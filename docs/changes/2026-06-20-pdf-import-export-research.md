# PDF 双向流能力调研与设计草案

- **日期**：2026-06-20
- **目的**：在动手实现前对齐两个目标能力的方案、技术栈与工作量
- **目标读者**：Claude Code / Coder / Codex（下一阶段实施）
- **范围**：Typola 新增「PDF 本地转 md」+「md 导出 PDF」两条闭环链路

---

## TL;DR（给 Claude 看的执行摘要）

| 项 | 结论 |
|---|---|
| **PDF → md 导入** | 引入 `liteparse = "2.1"`，`default-features = false`（关 OCR），单平台 native 增量 **~12 MB** |
| **md → PDF 导出** | 引入 `typst` crate + Typst 模板，Rust 原生排版，单平台增量 **~5-10 MB**（含字体） |
| **离线能力** | ✅ 两条路径均 100% 离线，无云依赖、无 LLM 调用 |
| **架构选择** | 两条都走 **Rust Tauri command**，不引入 npm/node native binding，避免分发复杂度 |
| **建议里程碑** | M3（PDF 导入 MVP，1 周）→ M4（Typst 导出 MVP，1-2 周）→ M5（OCR/批量/表格优化） |
| **关键风险** | ①Tauri 跨平台 native 分发（PDFium/Typst 二进制）②首次 cargo build 时间 +5-10 分钟③OCR 不在 MVP 范围 |
| **待用户决策** | ①MVP 是否含 OCR ②导出 PDF 是否完全替代现有 WebView2 路径 ③目标平台优先级 |

---

## 第一部分：LiteParse 调研（PDF → md 方向）

### 1.1 仓库本质

LiteParse V2（V1 已废弃，指向 `logan/liteparse-v1` 分支）是个 **Rust 核心 + 多语言 binding 的 monorepo**：

```
crates/
  liteparse/          Rust 核心 + CLI  (lit 命令)
  liteparse-napi/     Node binding (napi-rs)
  liteparse-python/   Python binding (PyO3)
  liteparse-wasm/     WASM binding (wasm-bindgen)
  pdfium/             PDFium C 库的安全封装
  pdfium-sys/         PDFium FFI 绑定
packages/
  node/    @llamaindex/liteparse v2.1.1          → npm
  python/  liteparse v2.1.1                     → PyPI
  wasm/    @llamaindex/liteparse-wasm v2.1.1    → npm
```

- **版本**：v2.1.1（2026-06 抓取）
- **License**：Apache-2.0（与 Typola 同协议，无兼容性问题）
- **本地路径**：`D:\AI\workspace\liteparse`

### 1.2 核心能力

- **PDF 直接解析**（PDFium，Chromium 同款引擎）
- **非 PDF 自动转 PDF**：DOCX/XLSX/PPTX/ODT 等 → LibreOffice；JPG/PNG/TIFF → ImageMagick
- **OCR**：内置 Tesseract（默认 feature），或 HTTP server 接入 EasyOCR/PaddleOCR
- **输出**：JSON / Text / **Markdown**（含 headings/tables/lists/images/links 启发式重建）
- **截图**：单页 PNG 渲染

### 1.3 4 个核心问题

#### Q1：会新增哪些依赖？

**Rust 路径（推荐）**——在 `src-tauri/Cargo.toml` 加一行：

```toml
liteparse = { version = "2.1", default-features = false }  # 关 tesseract
```

会传递引入：

| 依赖 | 作用 | 必需 |
|---|---|---|
| `pdfium` / `pdfium-sys` | PDF 解析+渲染（Google PDFium） | ✅ |
| `tesseract-rs` + `build-tesseract` | 内置 OCR | ❌ MVP 不开 |
| `reqwest` (rustls) | HTTP OCR server 客户端 | ❌ MVP 不开 |
| `tokio` | 异步运行时 | ✅（与 Tauri 共用） |
| `image` (png) | PNG 编码 | 已有 |
| `serde` / `serde_json` | 序列化 | 已有 |
| `infer` / `tempfile` / `thiserror` / `url` / `web-time` / `ordered-float` / `clap` | 小工具 | ✅（clap 仅 CLI 用） |

**外部系统依赖**（要支持非 PDF 才有）：
- LibreOffice（DOCX/PPTX/XLSX/ODT → PDF，几百 MB）
- ImageMagick（图片 → PDF）

→ **MVP 只做 PDF，不引入这两个大依赖**。

#### Q2：性能有无影响？

- **纯文本 PDF**：毫秒级（PDFium 是 Chromium 同款引擎）
- **含 OCR 的 PDF**：每页 1-5 秒（CPU 模式），`--no-ocr` 跳过
- **DOCX/PPTX/XLSX**：先调 LibreOffice 转 PDF，额外 2-10 秒（不在 MVP 范围）

→ 性能完全可接受。Tauri 异步 command + 前端 spinner 即可。

#### Q3：包体积会不会膨胀？

| 方案 | 单平台 native 增量 | 备注 |
|---|---|---|
| 完整版（含 Tesseract OCR） | **+30~50 MB** | Tesseract C++ 静态链接 + `eng.traineddata` |
| **仅 PDF（`default-features = false`）** | **+10~15 MB** | 仅 `pdfium.dll`（win 约 8-12 MB） |
| 仅 WASM（前端） | WASM 体积未知 | OCR 失效，不推荐 |

→ MVP 路线增量 **~12 MB**，可控。

#### Q4：是否支持纯离线？

✅ **100% 完全离线**。三项证据：

1. README 第 23 行明文："without proprietary LLM features or cloud dependencies. Everything runs locally on your machine."
2. `tesseract-rs` 用 `build-tesseract` feature 在 **cargo build 期静态编译 Tesseract**，运行时无任何下载
3. HTTP OCR server 是可选插件，用户不主动配 `ocrServerUrl` 不启用

→ 无 LLM API、无远程资源、无 telemetry、无云依赖。

### 1.4 集成方案

| 方案 | 推荐度 | 理由 |
|---|---|---|
| **A. Rust 直接依赖** | ⭐⭐⭐⭐⭐ | 编译进 `src-tauri`，零 JS 胶水，零子进程，零分发复杂度 |
| B. npm `@llamaindex/liteparse` | ⭐⭐ | Tauri 2 不友好分发 `*.node`/`.dll`；多一层 Node native binding |
| C. WASM `@llamaindex/liteparse-wasm` | ⭐ | OCR 失效；体积未知 |

**推荐方案 A + 仅 PDF（关 tesseract）**。

---

## 第二部分：Inkwell 调研（直接对位产品）

### 2.1 产品速览

| 维度 | 数据 |
|---|---|
| **产品名** | Inkwell |
| **公司** | 4Worlds 独立工作室（4worlds.dev） |
| **定位** | **The Sovereign Markdown Editor** |
| **价格** | 免费 + Pro $19 一次性买断（Gumroad） |
| **Pro 解锁** | PDF / HTML 导出 |
| **开源** | ❌ 闭源，GitHub repo 仅作 marketing + issue tracker |
| **热度** | 229 ⭐ / 10 forks / 4 open issues（GitHub API 2026-06-20） |
| **发布节奏** | 2026-02-24 v1.0 → 2026-06-12 v1.5.1，4 个月 6 个版本 |
| **本地路径** | `D:\AI\workspace\inkwell`（只含 README/CHANGELOG/截图，无源码） |

### 2.2 技术栈对照（与 Typola）

| 层 | Inkwell | Typola |
|---|---|---|
| **壳** | Tauri v2 | Tauri v2 ✅ |
| **后端** | Rust | Rust ✅ |
| **前端** | **vanilla JS，零依赖、零构建** | React 19 + Vite + CodeMirror + Vditor + xterm |
| **持久化** | SQLite（`inkwell.db`，v1.5.0）| 文件 + JSON + workspace watcher |
| **PDF 引擎** | **Typst 原生 Rust 排版**（v1.4.0）| 当前 docx + WebView2 |
| **打包体积** | Win 44 MB / Mac 18 MB / Linux 18 MB | Tauri 标准 |
| **遥测** | 零 | 零 |

**判断**：inkwell 是 Typola 的**镜像对手**——同样 Tauri v2 + 同样离线优先；区别是 inkwell 走 vanilla JS 极简路径（更小更快），Typola 走 React 富交互路径（更重但功能更多，**已具备 inkwell 没有的 AI 工作台**）。

### 2.3 Inkwell 关键功能演进

| 版本 | 时间 | 关键能力 |
|---|---|---|
| v1.0.0 | 2026-02-26 | Split view + live preview、4 主题、3 字体、GFM、Focus/Typewriter 模式、Templates、Auto-snapshot history |
| v1.1 | 2026-03-12 | Find & Replace、**History diff viewer**（双 tab + 行级 diff） |
| v1.2 | 2026-03-17 | **Workspace & File Tree**、Mermaid、KaTeX、自定义 Title Bar |
| v1.3.0 | 2026-03-24 | **Command Palette（Ctrl+K fuzzy 22 actions）**、Custom Theme Creator |
| v1.4.0 | 2026-03-30 | **Typst PDF Engine**（Rust 原生排版）、PDF 可点击 TOC |
| v1.5.0 | 2026-05-06 | **SQLite 持久化**（替代 localStorage）、自动迁移 |
| v1.5.1 | 2026-05-25 | OS 文件关联、Inline math regex 修复、周期磁盘 auto-save |

### 2.4 Typola 可借鉴清单

#### 🔴 P0 — 强推荐立刻借鉴

| 借鉴点 | 落地建议 |
|---|---|
| **Typst PDF 导出引擎** | Tauri 后端加 `typst` crate，写 `export_pdf` command |
| **SQLite 持久化层** | 在 `src-tauri/` 加 `rusqlite` 或 `sqlx`，迁 workspace state/history |
| **Command Palette（Ctrl+K fuzzy）** | `cmdk`（React）或 `fzf` 算法，统一 15-20 个动作 |

#### 🟡 P1 — 强烈推荐 P0 后做

| 借鉴点 | 落地建议 |
|---|---|
| **Version History 行级 diff viewer** | SQLite `snapshots` 表 + `diff-match-patch` |
| **"Sovereign" 品牌叙事** | 在 landing/about 页强化"代码在你 GitHub 上、数据在你硬盘上" |
| **Pro 付费模式参考** | 长期考虑"核心免费 + Pro 解锁云同步/协作/AI 额度"，**不在 M3/M4 阶段做** |
| **每个版本聚焦 1-2 个能力** | CHANGELOG 纪律对齐 inkwell |

#### 🟢 P2 — 长期差异化思考

| 借鉴点 | 思考方向 |
|---|---|
| **极简 vanilla JS 路线** | Typola 核心壳极小 + AI 工作台按需加载 |
| **每 5 分钟 auto-snapshot + 30 秒 auto-save 双层保护** | 核对当前 Typola auto-save 实现 |
| **OS 文件关联 + Microsoft Store** | 核对当前 OS 关联实现 |
| **vs/compare 页** | 主动做"vs Typora/MarkText/Inkwell"对比页 |

### 2.5 Typola 已领先 inkwell（**别丢**）

| 能力 | 状态 |
|---|---|
| AI 工作台 M1/M2（Skill OS） | ✅ inkwell 完全没碰 AI |
| Skill 系统 / 场景分类卡 | ✅ inkwell 只有 templates |
| 产物回流 M2 | ✅ inkwell 是纯静态编辑器 |
| 多格式导入（mammoth docx） | ✅ inkwell 主要 markdown 单格式 |
| 终端集成（headless Claude） | ✅ inkwell 没 |
| 中文优化 | ✅ inkwell 是英文小工作室 |

---

## 第二部分 B：Typola 竞品横向矩阵 + 竞争力规划（讨论稿）

> **补充日期**：2026-06-20
> **数据来源**：3 个并行子 agent 实抓（Typora / iA Writer / Obsidian / Bear / Zettlr / Inkwell）
> **目的**：基于 6 竞品横向对比，找出 Typola 差异化窗口和竞争力增强方向，给后续 Claude 决策用

### B.1 6 个竞品横向能力矩阵

| 能力维度 | Typola | Typora | iA Writer | Obsidian | Bear | Zettlr | Inkwell |
|---|---|---|---|---|---|---|---|
| **平台** | Win/Mac/Linux | Win/Mac/Linux | Mac/Win/iOS | 全平台+CLI | Apple Only | Win/Mac/Linux | Win/Mac/Linux |
| **技术栈** | Tauri v2 + React | Electron + TS | 原生 macOS/Win | Electron + TS | 原生 macOS/iOS | Electron + Vue | Tauri v2 + vanilla JS |
| **价格模式** | Apache-2.0 免费 | $14.99 买断 | $29.99-49.99 买断 | 本体免费+Sync $4/月+Publish $8/月 | Free / Pro $2.99 月 | 完全免费 GPL v3 | 免费 + Pro $19 买断 |
| **原生 AI** | ✅ M1/M2 Skill OS | ❌ | ❌（只标 Authorship） | ❌（靠插件） | ❌ | Apple Intelligence | ❌（哲学反对） |
| **实时预览 WYSIWYG** | ✅ Vditor IR | ✅（核心卖点） | ✅ | ✅ | ✅ | ✅ | ✅ |
| **双链/图谱** | ❌ | ❌ | ❌ | ✅ 护城河 | ❌ | ✅ Zettelkasten | ❌ |
| **PDF 导出** | ❌（M4 加 Typst） | ✅（浏览器引擎） | ✅ | ✅（插件） | ✅ Pro | ✅ Pandoc 30+ | ✅ Typst（Pro） |
| **学术/Pandoc** | ❌ | 部分 | ❌ | ❌ | ❌ | ✅ **护城河** | ❌ |
| **美学/主题** | 多主题 | CSS 自定义 | 4 主题 | 主题社区 | 28+ 主题 Pro | 多主题 | 4 主题+自定义 |
| **协作** | ❌（单机） | ❌（靠云盘） | ❌ | ✅ Publish/Shared | iCloud 单人 | ❌ | ❌ |
| **CLI/脚本化** | ✅ headless Claude | ❌ | ❌ | ✅ v1.12.4 CLI | ❌ | ❌ | ❌ |
| **插件生态** | Skill 系统 | ❌（9 年没做） | ❌ | ✅ **千款级** | ❌ | 扩展 | ❌ |

### B.2 Typola 当前定位 vs 竞品

#### Typola 已领先（差异化护城河）

| 能力 | 在 6 竞品中的稀缺性 |
|---|---|
| **原生 AI 工作台**（Skill OS M1 + Claude headless） | 6 个竞品 5 个官方 AI=0，唯一同位是 Zettlr Apple Intelligence（仅 Mac）。Typola 是**桌面 Markdown 编辑器里唯一把 AI 当一等公民且跨平台的** |
| **CLI/脚本化 + AI** | Obsidian v1.12.4 才加 CLI；Typola M1 已 headless Claude + Skill 系统 |
| **中文优化 + 心流模式** | 6 竞品全是英文/通用，Typola 中文体验是壁垒 |
| **Skill 系统** | 唯一把"AI 工具调用"做成可发现可注册的，竞品都没 |
| **本地优先 + AI** | Inkwell 是本地+无 AI；Obsidian 是本地+无 AI；Typola 是**唯一本地+AI 组合** |

#### Typola 相对落后（必须补）

| 能力 | 竞品对位 | 紧迫度 |
|---|---|---|
| **PDF 导出** | 6/6 都有，Typola 无 | 🔴 P0（M4 做 Typst） |
| **PDF 导入** | 部分有（Typora、Zettlr） | 🔴 P0（M3 做 LiteParse） |
| **SQLite 持久化** | Inkwell v1.5 做了 | 🟡 P1 |
| **Command Palette** | Inkwell 22 actions、Obsidian v1.13 | 🟡 P1 |
| **Authorship 标记** | iA Writer 独家 | 🟡 P1（**对 Skill OS 极契合**） |
| **OS 文件关联** | 都做了 | 🟡 P1（需核对当前实现） |

#### Typola 不应追（避免分散精力）

| 能力 | 为什么不做 |
|---|---|
| **双链/知识图谱** | Obsidian 护城河，10 年深耕；Typola 定位是"心流写作+AI"而非"知识库" |
| **Pandoc 学术导出** | Zettlr 强项；Typola 不是学术定位，PDF 走 Typst 足够 |
| **Publish/共享 Vault** | 协作是巨头游戏（Notion/Coda）；Typola 单机定位 |
| **Apple Only** | Bear 路径，Typola 跨平台是优势 |
| **千款插件市场** | Obsidian 难撼动；Skill 系统是 Typola 差异化"插件"形态 |
| **订阅制** | Bear 老用户抗议过订阅化；Typola Apache-2.0 + 完全免费是当前路线 |

### B.3 市场空白点（Typola 差异化窗口）

| 空白点 | 用户需求 | Typola 切入点 |
|---|---|---|
| **AI 优先桌面 Markdown 编辑器** | 写作者想要 AI 助手不离开编辑器 | M1/M2 Skill OS 已是 |
| **AI 内容可追溯** | AI 生成内容要标识清楚（iA Writer Authorship） | M2 产物回流可加"由 X skill 生成"标记 |
| **中文 AI 写作工作台** | 中文长文写作+ AI 一体化 | Typola 中文体验+Skill OS 中文优化 |
| **本地+AI+跨平台** | 隐私敏感的写作者想要本地 AI | Typola 本地优先 + Claude headless |
| **AI 时代编辑器"主权"** | 用户对 AI 失控的恐惧 | "AI 是协作者，不是替代者"叙事 |

### B.4 竞争力增强规划（草案）

#### 🔴 P0 — M3/M4 已经在做

| 能力 | 来源 | 规划 |
|---|---|---|
| PDF 本地转 md | LiteParse | M3 集成，默认 feature 关 |
| md 导出 PDF | Typst（学 Inkwell） | M4 集成，学术风默认模板 |

#### 🟡 P1 — M3/M4 完成后立刻做（按性价比）

| 能力 | 来源 | 优先级理由 | 估时 |
|---|---|---|---|
| **SQLite 持久化** | Inkwell v1.5 | 替换当前 JSON+localStorage，提升 workspace/recent/history 性能 | 2-3 天 |
| **Command Palette** | Inkwell v1.3、Obsidian v1.13 | Ctrl+K fuzzy 暴露 15-20 个动作，键盘流用户核心入口 | 2 天 |
| **Authorship 标记** | iA Writer 独家 | 编辑器视觉区分"AI 生成/用户手输/粘贴"——Skill OS 时代天然契合 | 3 天 |
| **Version History diff viewer** | Inkwell v1.1 | SQLite 存 snapshots，`diff-match-patch` 算 diff | 2 天 |

#### 🟢 P2 — M5+ 长期差异化

| 能力 | 来源 | 优先级理由 | 估时 |
|---|---|---|---|
| **AI 工作台 v2（多 agent / 多 backend）** | OpenHands ACP | M2 后用户量起来再加 | 5+ 天 |
| **MCP first-class** | 8 竞品 6 支持 | 让 Skill OS 可扩展 | 3 天 |
| **三段权限 + 审批卡** | helio / craft-agents | AI 风险动作拦截，对桌面 AI 必备 | 3 天 |
| **Mermaid/KaTeX → Typst 原生渲染** | Inkwell v1.4.0 | PDF 导出体验升级 | 3 天 |

### B.5 值得讨论的开放问题

#### Q1：Typola 是否应把"AI 优先桌面 Markdown 编辑器"作为品牌叙事？

- **选 A**（推荐）：把"AI first 桌面 Markdown"做成核心 tagline，对标 Obsidian 知识库心智
- **选 B**：维持"心流写作+AI 辅助"低调叙事（不被 AI 反感用户排斥）

#### Q2：Authorship 标记要不要做？做的话样式？

- **iA Writer 样式**：AI 生成文本灰底+斜体，粘贴内容变暗
- **Typola 适配**：Skill OS 时代天然契合——AI 生成的 `<artifact>` 可直接打"AI 生成"标签
- 是否立刻放到 P1？还是 M5 再做？

#### Q3：商业模式现状？

Typola 当前是 **Apache-2.0 + 完全免费**。6 竞品里有 5 个收费：

| 竞品 | 模式 |
|---|---|
| Typora | $14.99 一次性买断 |
| iA Writer | $29.99-49.99 一次性买断 |
| Bear Pro | $2.99/月订阅 |
| Inkwell Pro | $19 一次性买断 |
| Obsidian | 本体免费 + Sync $4/月 + Publish $8/月 |

Typola 是否考虑：
- **维持现状**：Apache-2.0 完全免费，靠社区/赞助/AI 工作台增值服务
- **加 Pro 模式**：核心免费 + 增值服务（云同步、AI 高频额度、企业版）
- **完全免费**：接受小众路线

#### Q4：品牌叙事对标谁？

- **对标 Obsidian**：知识库+AI（容易卷入双链战）
- **对标 Inkwell**：本地+极简+Typst（容易陷入小众）
- **对标 iA Writer**：写作+美学+AI 防护（定位窄）
- **自创位**：**"AI 时代中文写作者的工作台"**（本土+AI+写作）——差异化最强但最难讲清楚

### B.6 给你（后续 Claude）拍板的 4 个决策

| # | 决策点 | 选项 |
|---|---|---|
| 1 | **Authorship 标记是否进 P1**？ | A 进 P1（影响 M3/M4 后 roadmap） / B 推迟到 M5 |
| 2 | **品牌叙事选哪条**？ | A AI 优先桌面 Markdown（推荐）/ B 心流+低调 |
| 3 | **商业模式**？ | A 维持 Apache 免费 / B 加 Pro 增值 / C 完全免费+赞助 |
| 4 | **SQLite 持久化是否跟随 Inkwell 同期做**？ | A 跟随（影响 M3 工程量 +2 天）/ B 推迟到 M5 |

> **本节定位**：讨论稿。最终方案需结合 P0/P1/P2 优先级 + 4 个决策点综合决定，由后续 Claude 与用户对齐后写入 roadmap。

---

## 第二部分 C：文档工作台/驾驶舱护城河调研（8 竞品，2026-06-20 补充）

> **补充日期**：2026-06-20
> **数据来源**：4 个并行子 agent 实抓（GitHub + X/Reddit + 官方文档）
> **目的**：在 Typola 护城河（AI 工作台 + 桌面 + 本地 + 中文）维度上，调研 8 个"文档工作台/驾驶舱"竞品，找出差异化窗口和借鉴方向

### C.1 8 竞品横向能力矩阵

| 能力维度 | Typola | AFFiNE | AppFlowy | Mem.ai | Reflect | Tana | Logseq | AnyType | Reor |
|---|---|---|---|---|---|---|---|---|---|
| **定位** | 桌面 Markdown + AI 工作台 | 块+白板+数据库 | Flutter 块文档 | AI Thought Partner | AI 网络化笔记 | Supertag 知识图谱 | 本地优先大纲 | P2P 加密 Notion 替代 | 本地 AI 第二大脑 |
| **平台** | Win/Mac/Linux | 全平台+移动 | 全平台 | Mac/Win/iOS | Mac/iOS/Web | 全平台 | 全平台 | 全平台 | 桌面 3 端 |
| **技术栈** | Tauri+React | React+BlockSuite+OctoBase | Flutter+Rust | 闭源 | 闭源 | 闭源 | Clojure+DataScript | Go+TS+AnySync | Electron+LanceDB+Ollama |
| **块编辑器** | Vditor IR | BlockSuite 多视图 | appflowy_editor | 自研 | 自研 | 自研+supertag | 大纲块 | Object+Block 双层 | BlockNote（v0.2.32 后）|
| **多视图** | ❌ | ✅ Page/Edgeless/Grid/Board | ✅ Doc/Grid/Board/Cal | ❌ | ❌ | ✅ Tabs/Grid | ✅ Outline/Graph/Journal | ✅ Grid/List/Kanban/Cal/Graph | ❌ |
| **AI 集成** | ✅ Skill OS M1 | ✅ `/` + 块级 + Canvas AI | ✅ GPT-5/Gemini/Claude/本地 | ✅ Deep Search/Heads Up/Agentic | ✅ AI Chat+Custom Prompt | ✅ Custom Autofill/MCP | ❌（靠插件） | ❌（仍 Requested）| ✅ 本地 RAG 全栈 |
| **知识图谱** | ❌ | ✅ Graph view | ❌ | ✅ 自动回链 | ✅ Backlinks | ✅ Supertag 关系 | ✅ Datalog 查询 | ✅ Relations | ✅ RAG 相关 |
| **驾驶舱/Dashboard** | ❌ | ✅ 侧边栏 | ✅ 三栏树 | ✅ Inbox | ✅ Daily Note | ✅ Supertag Page | ✅ Journal | ✅ Sets+Collections | ✅ 相关笔记侧栏 |
| **协作** | ❌（单机） | ✅ Yjs CRDT | ✅ Web 实时 | ✅ 团队 | ❌ | ❌ | Git/DB RTC alpha | ✅ P2P | ❌ |
| **本地优先** | ✅ 桌面 | ✅ OctoBase | ✅ SQLite+可选云 | ❌（云） | ❌（云） | ❌（云） | ✅ 100% 本地 | ✅ 加密+本地 | ✅ 100% 本地 |
| **价格** | Apache 免费 | 开源+云 freemium | AGPL+Cloud | $12/月 | $10/月 | $20-120/月 | 免费开源 | Free/$4-16/月 | 免费+archived |
| **GitHub Star** | — | 69.6k | 72.6k | 闭源 | 闭源 | 闭源 | 43.5k | 闭源 | 8.5k（**已 archived**） |

### C.2 Typola 当前定位 vs 8 竞品

#### Typola 已领先（护城河）

| 能力 | 在 8 竞品中的稀缺性 |
|---|---|
| **桌面 + AI + 本地优先 三合一** | 8 竞品中只有 Reor 是这个组合，但 Reor **2026-03-07 已 archived**；AnyType 加密做到极致但 AI 画饼；AFFiNE/AppFlowy 桌面有但 AI 弱。**Typola 是这条赛道唯一在全力投入且持续维护的** |
| **Skill OS（场景分类 + skill 注册）** | Mem/Reflect 有"AI Chat + Custom Prompt"对位但缺"技能注册中心"；其他要么无 AI 要么 AI 简单。这是 Typola 独特形态 |
| **中文优化 + 本地 Markdown** | Logseq 也本地 Markdown，但中文 AI 工作台 Typola 独占 |
| **Apache-2.0 完全开源 + 桌面** | 8 竞品里只有 Logseq + Reor 满足"开源+本地"，Reor 死了，**Typola 是同赛道唯一持续维护的开源本地 AI 工作台** |
| **CLI/headless + AI** | 8 竞品中无对位（Reflect MCP 是最接近但仍云端） |

#### Typola 相对落后（必须补）

| 能力 | 8 竞品对位 | 紧迫度 |
|---|---|---|
| **多视图（Doc/Outline/Grid/Board）** | AFFiNE 5 视图、AppFlowy 4 视图、AnyType 5 视图 | 🟡 P1 |
| **块级 AI 触发（`/` 唤起 AI）** | AFFiNE `/` + 块级、AppFlowy AI 块 | 🟡 P1 |
| **知识图谱/反向链接** | AFFiNE Graph、Tana supertag、Mem 自动回链、Reflect backlinks | 🟡 P1 |
| **驾驶舱/Dashboard 入口** | Mem Inbox、Reflect Daily Note、Tana Supertag Page | 🟡 P1 |
| **本地 RAG（向量检索）** | Reor 三件套（已死）、AnyType 缺 | 🟡 P1 |
| **AI 改写可回滚** | Mem Version History | 🟡 P2 |
| **Daily/会议回顾** | Mem/Reflect/Tana 标配 | 🟡 P2 |

#### Typola 不应追

| 能力 | 为什么不做 |
|---|---|
| **多视图白板/Edgeless** | AFFiNE 强项，Typola 不是"块文档"路线，专注 Markdown 写作 |
| **P2P 协作** | AnyType/Logseq 路线，单机定位；CRDT 复杂度高 |
| **订阅制商业模式** | Mem/Reflect/Tana/AnyType 都订阅，Typola 走 Apache-2.0 路线 |
| **大而全 DB 视图** | Tana 路线，Typola 不做 PKM 平台，专注写作 |
| **块编辑器换核** | Reor 换 BlockNote 致社区分裂——**Typola 守住 Vditor** |
| **Notion-DB 完整能力** | Tana/AnyType 路线，Typola 不做 PKM 平台 |

### C.3 Typola 护城河差异化窗口

| 空白点 | 用户需求 | Typola 切入点 |
|---|---|---|
| **桌面 + 本地 + AI + 开源** | "Obsidian 的编辑器 + Reor 的本地 AI + 中文友好 + 不死"——Reor archived 后用户明确在找 | 强化"Apache 开源 + 持续维护 + 中文 + AI 工作台"四点叙事 |
| **AI 嵌字段而非对话框** | Mem/Reflect AI 都在 Chat 里；Tana 钉到字段（Custom Autofill）；Typola 应在 skill OS 里把 AI 产物钉到 frontmatter 字段 | M2 产物回流升级为"AI 写字段"而非"AI 写全文" |
| **块级 AI 触发（不打断心流）** | Reor 右侧栏 + AFFiNE `/` + AppFlowy AI 块 = 主流方向 | Typola Skill OS 触发从"开对话框"前移到"块级 inline 菜单" |
| **中文 AI 工作台** | 8 竞品全部英文；Typola 中文体验是壁垒 | Skill 模板、文档、提示词全中文化 |
| **本地 RAG（Reor 已死）** | 本地 AI 第二大脑需求明确，Reor 后市场真空 | 集成 Ollama + 本地 embedding + LanceDB 路线 |

### C.4 Typola 借鉴清单（按优先级）

#### 🟡 P1 — M3-M4 后做（高 ROI）

| 借鉴点 | 来源 | 落地建议 | 估时 |
|---|---|---|---|
| **`/` 触发 Skill** | AFFiNE、AppFlowy AI 块 | 复用 `SkillHubPanel`，把 Skill OS 接入 slash 菜单 | 2 天 |
| **本地 RAG 检索** | Reor 三件套 | `src-tauri/src/agent-runtime/local-rag/`：Ollama + LanceDB + embedding，Skill 可调 `vault.search` | 3-5 天 |
| **块级 AI 触发（侧栏相关）** | Reor 右侧栏、AFFiNE 块级 | 加 `<RelatedNotesSidebar>`，debounce 500ms 调本地 retrieve | 2 天 |
| **驾驶舱侧栏（今日/本周）** | Mem Inbox、Reflect Daily Note、AnyType Sets | `SidebarTodayPanel`：今日修改 + AI 摘要 + 推荐 skill | 2 天 |
| **AI 改写可回滚** | Mem Version History | 编辑器 undo 栈加"AI 修改" first-class 节点 | 2 天 |

#### 🟢 P2 — M5+ 长期差异化

| 借鉴点 | 来源 | 落地建议 |
|---|---|---|
| **多视图切换** | AFFiNE 5 视图、AppFlowy 4 视图 | Doc / Outline / Kanban 切换，**不追白板** |
| **Supertag / 关系字段** | Tana、AnyType Relations | frontmatter 字段 + 自定义 Type，**不深度学 Notion DB** |
| **MCP server 入口** | Reflect 2026-03、Tana 2026-06、Helio | Skill OS 暴露为标准 MCP server，让外部 Claude/Codex 可调 |
| **本地加密 vault** | AnyType BIP-39 + AES-GCM | Typola 个人备份杀手锏（差异化于明文 vault） |
| **Daily/会议回顾 Skill** | Tana voice、Reflect Daily Note | voice memo → 自动建 `#meeting` 块 + AI 摘要 |

### C.5 8 竞品共同的 Typola 启示

1. **AI 必须"内嵌到工作流"而非独立面板**——AFFiNE `/`、AppFlowy AI 块、Reor 侧栏证明 AI 触发点应贴近用户上下文；Typola Skill OS 已是此范式，但要把触发从"打开对话框"前移为"块级 inline 菜单"
2. **本地优先是核心差异化**——AFFiNE/AppFlowy/Logseq/AnyType/Reor 都把"local-first / 自托管 / 数据所有权"写进 README 第一屏；Typola 桌面 + 文件即仓库天然契合，要把这变成产品主张而非"刚好本地跑"
3. **驾驶舱/Dashboard 形态正在变成"AI 工作台"标配**——Mem Inbox、Reflect Daily Note、Tana Supertag Page、AnyType Sets、Logseq Journal 都是不同形态的"工作台入口面板"；Typola 当前没有统一入口是 P1 必修
4. **块级 AI 触发 + 右侧栏 = 主流方向**——Reor 右侧栏 + AFFiNE `/` + AppFlowy AI 块，三家不约而同；Typola 应加 `<RelatedNotesSidebar>` 走"不打断心流"路线
5. **MCP / LLM Connector 是 2026 年胜负手**——Reflect 2026-03、Tana 2026-06、Helio 同期都上 MCP；Typola Skill OS 必须把 skill 暴露为标准 MCP server
6. **AI 自动回链 = 杀手锏**——Mem Heads Up / Reflect Backlink Picker / Tana supertag 都用 embedding 自动建联系；Typola M2 产物回流应用同样用 embedding 在 workspace 内建"产物 ↔ skill ↔ 文档"的三向网
7. **AI 改写必须可回滚**——Mem Version History 让用户敢让 AI 改；Typola 编辑器需要把 AI 修改做成 first-class undo 节点
8. **跨平台差距 = 商机**——Reflect 无 Win/Android、Mem 无 Android、Reor 无移动端，Typola Tauri 桌面（Win/Mac/Linux）就是天然护城河
9. **"is a" + 类型驱动**：Tana supertag、AnyType Relations、AppFlowy Type 都把 frontmatter tag 从"弱标签"升级为"类型 + 字段 schema"；Typola Markdown frontmatter 可以走同样升级
10. **避免同步 drift 是口碑分水岭**——AFFiNE issue 区对 cloud sync drift 抱怨高频；Typola 全本地、零 drift 是天然优势，应在产品文案明确强调

### C.6 给你（后续 Claude）拍板的 5 个决策（工作台护城河专项）

| # | 决策点 | 选项 |
|---|---|---|
| 1 | **是否把"桌面+本地+AI+中文+开源持续维护"作为品牌叙事**？ | A 强化（推荐，借 Reor archived 时间窗口） / B 维持低调 |
| 2 | **`/` 触发 Skill vs 对话框触发**？ | A 块级 `/`（轻、不打断心流）/ B 对话框（更习惯）|
| 3 | **本地 RAG 是否进 P1**？ | A 进（引入 Ollama + LanceDB 新依赖） / B 推迟到 M5（只做云端 Claude）|
| 4 | **驾驶舱/Dashboard 是否做**？ | A 做（引入多视图投入）/ B 不做（守住单文档+侧栏）|
| 5 | **多视图（Doc/Outline/Kanban）优先级 vs Skill OS**？ | A 多视图先 / B Skill OS 先（推荐）|

> **本节定位**：与第二部分 B.6 的 4 个决策并列，是工作台护城河专项决策。最终方案由后续 Claude 与用户对齐后写入 roadmap。

---

## 第三部分：设计草案

### 3.1 功能 A — PDF 本地转 md（基于 LiteParse）

#### 3.1.1 技术依赖

```toml
# src-tauri/Cargo.toml
[dependencies]
liteparse = { version = "2.1", default-features = false }  # 关 tesseract MVP
# 未来要 OCR 时：
# liteparse = { version = "2.1" }  # 默认带 tesseract
```

#### 3.1.2 Tauri command 设计

```rust
// src-tauri/src/commands/pdf_import.rs
#[tauri::command]
pub async fn pdf_to_markdown(
    file_path: String,
    config: Option<PdfImportConfig>,
) -> Result<PdfImportResult, AppError> {
    let cfg = config.unwrap_or_default();
    let parser = liteparse::LiteParse::new(liteparse::LiteParseConfig {
        output_format: liteparse::OutputFormat::Markdown,
        image_mode: liteparse::ImageMode::Placeholder,
        extract_links: true,
        ocr_enabled: false,             // MVP 关 OCR
        max_pages: 1000,
        quiet: true,
        ..Default::default()
    })?;
    let result = parser.parse_file(&file_path).await?;
    Ok(PdfImportResult {
        markdown: result.text,
        page_count: result.pages.len(),
        pages: result.pages.into_iter().map(|p| PageData {
            page_num: p.page_num,
            text: p.text,
        }).collect(),
    })
}

#[derive(serde::Deserialize)]
pub struct PdfImportConfig {
    pub max_pages: Option<u32>,
    pub image_mode: Option<String>,  // "placeholder" | "off" | "embed"
    pub extract_links: Option<bool>,
}

#[derive(serde::Serialize)]
pub struct PdfImportResult {
    pub markdown: String,
    pub page_count: usize,
    pub pages: Vec<PageData>,
}
```

#### 3.1.3 前端 UX 流程

```
用户拖入/打开 PDF
    ↓
[Import 按钮] 或拖拽到编辑器
    ↓
Tauri dialog 选 PDF → 调 pdf_to_markdown
    ↓
进度条（"正在解析 X / Y 页..."）
    ↓
Markdown 插入到当前光标位置 / 新开标签页
    ↓
显示 page count + "产物回流：M2 已识别为 skill 产物"
```

**前端入口**：
- 顶部菜单 `文件 → 导入 PDF`
- 拖拽支持（`.pdf` 文件落到编辑器）
- Command Palette 入口（M3 后）

#### 3.1.4 风险与缓解

| 风险 | 缓解 |
|---|---|
| **跨平台 PDFium 分发**（win/mac/linux 各一份） | 在 `tauri.conf.json` 的 `bundle.resources` 声明 `pdfium-{target}.dylib/.so/.dll`，build.rs 根据 target triple 拷贝 |
| **首次 cargo build 时间** | sccache 缓存；CI 缓存 target/ |
| **大 PDF 阻塞 UI** | `async` command + 前端进度事件（`emit("pdf-import-progress", { current, total })`） |
| **PDF 表格/版式复杂** | README 自承"启发式重建对复杂版式质量一般"，用户预期管理（README 注明） |
| **OCR 缺位** | MVP 不做；M5 加 PaddleOCR HTTP server 或开 tesseract feature |

### 3.2 功能 B — md 导出 PDF（基于 Typst）

#### 3.2.1 技术依赖

```toml
# src-tauri/Cargo.toml
[dependencies]
typst = "0.12"          # Typst 库（Rust 原生排版）
typst-pdf = "0.12"      # PDF 输出（可选，typst 自带也行）
```

#### 3.2.2 Tauri command 设计

```rust
// src-tauri/src/commands/pdf_export.rs
#[tauri::command]
pub async fn md_to_pdf(
    markdown: String,
    config: Option<PdfExportConfig>,
) -> Result<Vec<u8>, AppError> {
    let cfg = config.unwrap_or_default();
    let typst_src = render_typst_template(&markdown, &cfg)?;
    let doc = typst::compile(&typst_src, &cfg.assets)?;
    let pdf_bytes = typst_pdf::pdf(&doc, &typst::pdf::PdfOptions::default())?;
    Ok(pdf_bytes)
}

fn render_typst_template(md: &str, cfg: &PdfExportConfig) -> Result<String, AppError> {
    // 1. md → IR (用 pulldown-cmark 或 comrak)
    // 2. IR → Typst markup
    // 3. 嵌入 Typst 模板（含章节、数学、字体）
    todo!()
}

#[derive(serde::Deserialize)]
pub struct PdfExportConfig {
    pub paper_size: Option<String>,    // "a4" | "letter"
    pub font_family: Option<String>,
    pub include_toc: Option<bool>,
    pub include_mermaid: Option<bool>,
    pub title: Option<String>,
}
```

#### 3.2.3 Typst 模板（内嵌到 Rust）

```typst
// 由 Rust 端组装，类似 inkwell 的做法
#let project(
  title: "Typola Export",
  authors: ("",),
  body,
) = {
  set document(
    title: title,
    author: authors,
  )
  set page(
    paper: "a4",
    margin: (x: 2.5cm, y: 3cm),
    header: align(right, text(0.9em, title)),
    numbering: "1 / 1",
  )
  set text(font: ("Crimson Pro", "Noto Serif CJK SC"), size: 11pt)
  show heading.where(level: 1): h => pagebreak(weak: true) + h
  show heading.where(level: 2): h => h
  show raw.where(block: true): block.with(
    fill: luma(245), inset: 8pt, radius: 3pt, width: 100%,
  )
  body
}
```

#### 3.2.4 前端 UX 流程

```
用户点 [导出 PDF]
    ↓
Tauri save dialog 选保存路径
    ↓
调 md_to_pdf（带进度）
    ↓
进度条（"正在排版..."）
    ↓
完成后用系统默认 PDF 阅读器打开
    ↓
可选："导出成功" toast + "在文件树中显示" 选项
```

**前端入口**：
- 顶部菜单 `文件 → 导出 PDF`
- 快捷键 `Ctrl+Shift+E`
- Command Palette（M3 后）

#### 3.2.5 风险与缓解

| 风险 | 缓解 |
|---|---|
| **Typst 学习曲线** | 模板固定写一次；前端不暴露 Typst 语法 |
| **中文字体打包** | 内嵌 Noto Serif CJK SC 子集（~5-10 MB），可选项，用户选择 |
| **Mermaid 图表** | v1 用 mermaid CLI 预渲染 SVG → 嵌入；v2 用 Typst 原生 |
| **KaTeX 数学** | Typst 原生数学语法支持，只需 md→typst 翻译器把 `$...$` 转成 `$...$`（Typst 兼容） |
| **替代 WebView2 路径** | 新增导出路径，**不立即删 WebView2**；并行 2-3 个版本后用户选 |
| **typst crate API 稳定性** | 锁版本（`=0.12.x`），不要追新 |

### 3.3 两条路径协同

| 共用点 | 方案 |
|---|---|
| **Tauri command 框架** | 都在 `src-tauri/src/commands/` 下，统一错误类型 `AppError` |
| **文件选择/保存对话框** | 复用现有 `tauri-plugin-dialog` |
| **进度反馈 UI** | 共用 `<ProgressOverlay>` 组件 |
| **错误降级** | PDF 解析失败 → 提示"请尝试 OCR 选项"或"转为图片导入"；导出失败 → 提示并保留 md |
| **快捷键** | 导入 `Ctrl+Shift+I` / 导出 `Ctrl+Shift+E`（避开现有） |
| **能力发现** | 在 `docs/ARCHITECTURE.md` 新增 "PDF 流能力" 章节；CHANGELOG 各起一项 |

---

## 第四部分：执行计划

### 4.1 建议里程碑

| 里程碑 | 时间 | 范围 | 验收标准 |
|---|---|---|---|
| **M3** | 1 周 | LiteParse PDF 导入 MVP（仅 PDF，关 OCR） | 拖入 PDF → 编辑器拿到 md；含基础进度条；含错误降级 |
| **M4** | 1-2 周 | Typst PDF 导出 MVP | 当前文档 → PDF 文件；含中文字体；保留 GFM 表格、代码块、Mermaid SVG |
| **M5** | 2-3 周 | OCR 选项 + 表格优化 + 批量 | OCR 开关；批量 PDF 导入；表格识别增强 |

### 4.2 工作量粗估

| 模块 | 工时 | 复杂度 |
|---|---|---|
| LiteParse 集成（Rust） | 0.5 天 | 低 |
| Tauri command 实现 | 0.5 天 | 低 |
| PDFium 跨平台分发脚本 | 1 天 | 中 |
| 前端 Import UI（拖拽/菜单/进度） | 1 天 | 低 |
| Typst 集成（Rust） | 1 天 | 中 |
| md → Typst 翻译器 | 2-3 天 | **高**（最复杂的部分） |
| Typst 模板设计 | 1 天 | 中 |
| 中文字体打包 | 0.5 天 | 低 |
| 前端 Export UI（保存/进度） | 1 天 | 低 |
| Mermaid SVG 预渲染集成 | 1 天 | 中 |
| KaTeX → Typst 数学 | 1 天 | 中 |
| 测试 + 文档 + 跨平台验证 | 2 天 | 中 |
| **合计 M3+M4** | **~12-15 人天** | |

### 4.3 关键风险与缓解（汇总）

| 风险 | 影响 | 缓解 |
|---|---|---|
| 跨平台 native 分发（PDFium/Typst） | 高 | build.rs + tauri.conf.json bundle.resources |
| 首次 cargo build 时间 +5-10 分钟 | 中 | sccache + CI 缓存 |
| md → Typst 翻译器不完美 | 中 | 渐进式支持：先基础 GFM → 表格 → 数学 → Mermaid |
| 中文字体体积 | 低 | 子集化（fontkit 切字体）；用户可关 |
| WebView2 导出路径 vs Typst 路径并存 | 低 | 保留 WebView2 作 fallback，加导出选项让用户选 |

### 4.4 待用户决策

在启动 M3 实施前需要确认：

1. **MVP 是否含 OCR**？
   - 选 A：不含（推荐）→ 增量 12 MB，工时 1 周
   - 选 B：含 Tesseract → 增量 40 MB，工时 +2 天（含静态编译排错）

2. **导出 PDF 是否完全替代现有 WebView2 路径**？
   - 选 A：新加路径，并存 2-3 版（推荐）→ 风险低
   - 选 B：直接替换 → 工作量大，回归测试多

3. **目标平台优先级**？
   - Win 优先（Typola 当前主力）
   - 三平台同步
   - Mac 优先

4. **是否同时上 LibreOffice/ImageMagick 扩展 DOCX/PPTX/XLSX 导入**？
   - 选 A：暂不做（推荐，M3/M4 专注 PDF 双向流）
   - 选 B：M3 内做（用户机器要装 LibreOffice，分发复杂）

5. **Typst 模板默认风格**？
   - inkwell 风（warm cream + Crimson Pro）
   - Typola 风（沿用现有主题色）
   - 让用户在 export dialog 选

---

## 附录

### A. 数据出处

| 来源 | 抓取时间 | 备注 |
|---|---|---|
| `D:\AI\workspace\liteparse` 本地 clone | 2026-06-20 | 含完整 monorepo 源码、AGENTS.md、README.md |
| `D:\AI\workspace\inkwell` 本地 clone | 2026-06-20 | 仅 README/CHANGELOG/LICENSE/截图，无源码（闭源） |
| GitHub API `repos/4worlds4w-svg/inkwell` | 2026-06-20 | star/fork/watch 数 |
| `helio.im` 官网 + `helio.so` 仓库 | 2026-06-20 | 已确认是两个无关项目（同名巧合） |

### B. 相关文档（已存在）

| 文档 | 路径 | 相关章节 |
|---|---|---|
| Typola 架构总览 | `docs/ARCHITECTURE.md` | 编辑器/工作区/Tauri command 模式 |
| AI 工作台 Skill OS M2 | `docs/AI_WORKBENCH_SKILL_OS.md` | 产物回流、场景分类 |
| AI 工作台 SPEC | `docs/AI_WORKBENCH_SPEC.md` | M1/M2/M3 演进路线 |
| Skill OS M1 评审 | `docs/REVIEW_SKILL_OS_M1.md` | 上一阶段评审经验 |

### C. 推荐下阶段任务

1. **用户决策 M3-M4 范围**（基于本文 4.4 节）
2. **如有 Coder 协作流程**：先把本文交给 Coder → 生成 `tasks/2026-06-20-pdf-flow-design.md` 实施 plan
3. **Codex 评审**：对 plan 做架构评审，重点核跨平台 native 分发方案
4. **渐进实施**：M3 先跑通，再做 M4，避免一次性大改
