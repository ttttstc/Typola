# ADR-001：对标 Typora 的能力差距与增强规划

- 状态：Proposed
- 日期：2026-04-24
- 作者：Claude（基于当前代码快照分析）
- 相关文档：[spec.md](../spec.md)、[vision.md](../vision.md)、[export-pandoc-roadmap.md](../export-pandoc-roadmap.md)

---

## 1. 背景

Typola 定位为「Notion 交互 + 本地 .md + 集成终端」的轻量 Markdown 编辑器，编辑核心基于 Milkdown（ProseMirror），目前已落地 WYSIWYG、Slash 命令、浮动工具栏、Mermaid、Shiki 代码高亮、文件树、大纲、多标签、集成终端、搜索替换、PDF/HTML 导出、双语 i18n、原生菜单等能力。

相较 Typora（行业标杆），差距集中在「**写作沉浸感**」「**Markdown 完整性**」「**导出与互操作**」「**个性化主题**」四个维度。本 ADR 梳理差距并给出 **P0/P1/P2 分级增强规划**，不讨论 AI 相关能力（另见 md-editor-ai-markdown.md）。

## 2. 现状 vs Typora 能力对照

| 维度 | Typora | Typola 现状 | 差距 |
|------|--------|------------|------|
| 数学公式 | KaTeX 行内/块级 | ❌ 无 | P0 缺失 |
| 脚注 | `[^1]` 语法 + 侧栏 | ❌ 无 | P1 缺失 |
| 自动配对括号/引号 | ✅ | ❌ | P0 缺失 |
| 专注/打字机模式 | ✅ | ❌ | P1 缺失 |
| 字数统计 | 状态栏实时 | ❌ | P0 缺失 |
| 拼写检查 | 系统级 | ❌ | P2 |
| 最近文件 | 菜单/启动页 | ❌ | P0 缺失 |
| 自定义 CSS 主题 | 主题文件夹 | ❌ 仅硬编码明暗 | P1 缺失 |
| DOCX / EPUB 导出 | ✅ | ❌（已有 roadmap） | P1 |
| 表格编辑 UI | 右键菜单 + 拖拽列宽 | 基础 GFM + 有限操作 | P1 偏浅 |
| 图片管理 | 自动复制/上传/相对路径 | 基础插入 | P1 偏浅 |
| 源码/预览切换 | ✅ | ❌ 仅 WYSIWYG | P2（按品牌取舍） |
| 大纲/文件树/多标签 | ✅ | ✅ | 持平 |
| Mermaid/代码高亮 | 基础 | ✅（双击编辑 + Shiki） | **超越** |
| 集成终端 | ❌ | ✅（xterm + node-pty） | **差异化优势** |
| PDF/HTML 导出 | ✅ | ✅（支持图片策略） | 持平 |

## 3. 增强规划（按优先级）

### P0（近期，1 个迭代内，直接影响"写作是否顺手"）

1. **KaTeX 数学公式支持**
   - 引入 `@milkdown/plugin-math` 或自写 node（推荐后者以控制体积，见 ADR-002）
   - 支持 `$...$` 行内与 `$$...$$` 块级，双击编辑态切换
   - 交付物：新增 `src/editor/plugins/math.ts`，settings 可开关

2. **自动配对**
   - 输入 `(` `[` `{` `"` `` ` `` `*` `_` 时自动补全另一半；选区包裹
   - 通过 ProseMirror `inputRules` + `keymap` 实现，预计 < 100 LOC
   - 交付物：`src/editor/plugins/autoPair.ts`

3. **字数统计状态栏**
   - 底部状态栏组件，实时显示字符数/单词数/行数；选中时显示选区统计
   - 交付物：`src/components/StatusBar.tsx`

4. **最近文件**
   - Electron 侧持久化 `recentFiles` 列表（上限 10）
   - 原生菜单「File → Open Recent」子菜单 + 启动页卡片
   - 交付物：`electron/recentFiles.ts` + MenuBar 集成

### P1（中期，2-3 个迭代，提升写作沉浸与互操作）

5. **脚注** — 解析 `[^n]` 与 `[^n]: ...` 定义，点击跳转；侧栏浮窗预览
6. **专注模式 + 打字机模式** — 当前段/行高亮，其余淡出；光标居中滚动
7. **自定义主题 (CSS)** — 用户目录 `themes/*.css`，Settings 主题选择器，主题热加载
8. **DOCX / EPUB 导出** — 按 `export-pandoc-roadmap.md` 采用 **外部 pandoc**（不打包，检测已安装），避免膨胀
9. **表格深度编辑** — 右键菜单（插入行列、合并、对齐）、列宽拖拽、快捷键
10. **图片管理策略** — 粘贴/拖入时按 settings 规则：复制到同名 assets 目录 / base64 内联 / 保留原路径

### P2（远期或按需）

11. **拼写检查** — 复用 Electron `session.setSpellCheckerLanguages`（零体积成本）
12. **源码模式切换** — 为高级用户保留，快捷键 `Ctrl+/`（品牌取舍后再定）
13. **更多图表** — PlantUML / Graphviz（按需加载，不默认打包）

## 4. 决策与取舍

- **坚持 WYSIWYG 唯一模式**：源码模式排在 P2 且需产品决策，避免破坏"零语法"品牌。
- **差异化优势继续强化**：终端、Mermaid 双击编辑、Shiki 是相对 Typora 的亮点，不应因瘦身牺牲。
- **体积敏感功能走"外部依赖"路线**：pandoc 导出、PlantUML 走"检测已装"而非打包，与 ADR-002 策略一致。
- **AI 能力**：单独 ADR，不纳入本规划。

## 5. 验收标准

每个 P0 项需满足：
- 有对应 `src/editor/plugins/*.ts` 或 `src/components/*.tsx` 文件
- Settings 中可配置（如适用）
- 在 README/spec.md 更新特性列表
- 不引入 > 500KB gzipped 的运行时依赖（否则进入 ADR-002 瘦身评审）

## 6. 风险

- KaTeX 全量引入约 270KB gzipped — 需按需加载（见 ADR-002 §3.2）
- 自定义主题 CSS 可能破坏内置样式变量约束 — 需定义主题 API 白名单
- Pandoc 外部依赖检测失败的降级路径需友好提示
