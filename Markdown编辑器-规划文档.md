# Typola —— 产品与技术规划文档

> 目标：打造一款面向 Windows 桌面的、Typora 风格（所见即所得）的开源 Markdown 编辑器，覆盖 Typora 核心能力，规避其商业授权限制。
>
> 版本：v0.3 全量 v1 稿 · 2026-04-17

---

## 0. 本次已敲定的决策（2026-04-17）

| # | 决策项 | 结果 |
|---|---|---|
| 1 | 产品名 | **Typola** |
| 2 | 目标平台 | Windows 10/11 桌面（首发） |
| 3 | 技术栈 | Electron + TypeScript + React |
| 4 | 编辑器内核 | **Milkdown**（ProseMirror） |
| 5 | 交互模式 | 所见即所得（Typora 风格）为主，可切换源码 |
| 6 | v1 范围 | **全量发布**：覆盖 Typora 主流功能 + 多标签 + 主题系统 + 全局搜索 + docx 导出 |
| 7 | 导出 | HTML + PDF + docx（均在 v1 内） |
| 8 | Mermaid 交互 | 即时渲染 + **双击弹出代码框编辑** + 导出 SVG/PNG |
| 9 | 开源协议 | **MIT**，完全开源 |
| 10 | 主题生态 | 自有主题系统（CSS 变量 + 主题包热加载） |
| 11 | 同步/云 | 不做第一方同步，纯本地；用户可自行用 Dropbox/OneDrive/Git |
| 12 | 分发渠道 | **双分发模式**：安装版（Installer/Uninstaller）+ 免安装便携版（Portable EXE + ZIP） |
| 13 | 开发方式 | **Claude Vibe Coding**：以 AI 协同编码推进，不受人力产能约束 |
| 14 | 下一步 | 生成完整工程骨架 → 按阶段落地全量 v1 |

### ✅ 取消原 M1a/M1b 拆分

既然采用 Claude vibe coding，产能不再是瓶颈，第一版直接按"全量能力"发布，一次性对齐 Typora 核心体验。原规划中 2.2 清单里属于"合格 Markdown 编辑器应有能力"的部分（多标签、主题系统、全局搜索、Front Matter、docx 导出、Mermaid 导出、焦点/打字机模式），全部纳入 v1 范围。只有真正属于"生态与云"的能力（插件市场、Git 集成、AI 写作、实时协作、图床上传）留给 v2+。

---

## 一、产品定位

**一句话定义**：像写 Word 一样写 Markdown —— 打开即用、实时渲染、文件即数据。

**核心原则**
- 本地优先（Local-first）：文件存储在用户磁盘，纯 `.md` 文本，无厂商锁定。
- 所见即所得（WYSIWYG）：输入时即时渲染，不看源码也能写作。
- 零配置可用：开箱即用的排版、图表、数学公式、导出。
- 开源可扩展：插件机制 + 主题机制，社区可二次开发。

**目标用户**
- 写技术文档 / 博客 / 笔记的开发者。
- 学生（论文、学习笔记）。
- 喜欢 Markdown 但不想配置 VS Code 的轻度用户。

---

## 二、功能清单

### 2.1 v1 全量能力（首发必含）

按模块组织，每一项都在 v1 内交付。

#### A. 文件与工作区
- 新建 / 打开 / 保存 / 另存为，支持 `.md` `.markdown` `.txt` `.mdown`
- 最近文件列表（最多 20 条，可固定）
- 自动保存（默认每 5 秒 + 失焦 + 关闭）
- 草稿恢复（未保存内容崩溃恢复）
- 拖拽打开文件 / 文件夹
- 打开目录作为工作区（Workspace），左侧文件树
- 文件树操作：新建文件/文件夹、重命名、删除到回收站、刷新、右键菜单
- 外部修改感知（chokidar 监听，提示"文件已在外部被修改"）
- 多标签页（Tabs）：打开多个文件、切换、关闭、脏标记 ● 指示
- 会话恢复（重启后恢复上次打开的工作区 + 标签）

#### B. 基础 Markdown 编辑（WYSIWYG）
- 标题 H1–H6、段落、换行、硬换行
- 粗体、斜体、删除线、行内代码、下划线（HTML `<u>`）、高亮 `==...==`
- 无序列表、有序列表、任务列表（含嵌套）
- 引用块（含嵌套）
- 分割线 `---`
- 链接（智能粘贴 URL 自动成链接）、自动链接
- 图片插入：本地粘贴、拖拽、文件选择、URL
- 图片管理：`xxx.assets/` 相对路径 / 全局图片目录（可选）
- 代码块（语言选择 + Shiki 高亮 + 复制按钮）
- 行内代码
- GFM 表格（可视化编辑：鼠标右键加/删行列、列对齐、拖拽宽度）
- 脚注 `[^1]`
- 定义列表
- Front Matter（YAML 头，支持字段提示与不渲染占位）
- HTML 内嵌（原样通过）

#### C. 进阶渲染
- **Mermaid 图**：flowchart / sequence / gantt / class / state / er / mindmap / pie 等
  - 编辑态：debounce 渲染（200ms） + 错误保留上次 SVG
  - **双击图片弹出代码编辑框**（浮层 Monaco/CodeMirror 6，Esc 关闭，Ctrl+Enter 确认）
  - 工具栏按钮导出当前图为 SVG / PNG
- **数学公式 KaTeX**：行内 `$...$`、块级 `$$...$$`，公式自动编号（可选）
- 代码块语法高亮（Shiki，支持 200+ 语言）
- 表情 `:smile:` 短码（可开关）

#### D. 视图与导航
- 大纲视图（TOC，点击跳转、折叠）
- 字数统计（字符 / 词 / 中文字数 / 阅读时间）
- 源码模式 ↔ WYSIWYG 一键切换（`Ctrl+/`）
- 焦点模式（隐藏除当前段落外的全部内容）
- 打字机模式（当前行始终垂直居中）
- 只读/预览模式（用于分享场景）
- 窗口内查找替换（支持正则、大小写、全词匹配）
- **跨文件全局搜索**（当前工作区，带上下文片段、点击跳转）
- 侧边栏伸缩（左侧文件树 / 右侧大纲独立开关）

#### E. 导出
- **HTML**：独立 HTML 文件（嵌入 CSS/图片）/ 带外链资源两种模式
- **PDF**：Electron `printToPDF`，支持自定义页边距、纸张、页眉页脚、页码
- **docx**：通过 pandoc（检测环境，未装时提示下载）或自研 mdast→docx
- **图片**：整页截屏 PNG（`webContents.capturePage`）
- **Mermaid 单图**：SVG / PNG
- **纯 Markdown 清理**：去除编辑器附加格式，输出干净 .md

#### F. 主题系统
- 内置主题：Typola Light / Typola Dark / Newsprint / GitHub / Academic（至少 4–5 套）
- 主题热切换（无需重启）
- 主题基于 CSS 变量 + 局部 CSS 覆盖
- 用户自定义主题目录：安装版为 `%APPDATA%/Typola/themes/*.css`，便携版为 `./data/themes/*.css`，均支持热加载
- 代码块配色随主题切换（Shiki 主题联动）
- UI 主题（菜单/侧边栏）与渲染主题联动

#### G. 设置与快捷键
- 设置面板（Tab 分组：通用 / 编辑器 / 渲染 / 主题 / 导出 / 快捷键 / 关于）
- 快捷键可视化配置（冲突检测）
- 默认快捷键参照 Typora（`Ctrl+1–6` 标题、`Ctrl+B/I/U`、`Ctrl+K` 链接等）
- 语言：简体中文 / English（i18n 框架预留）

#### H. 系统集成
- 安装版安装器与卸载器（Windows 应用列表可见，可正常卸载）
- 便携版启动器（双击即用，无安装、无注册表依赖）
- 文件关联 `.md`（安装版安装时可选注册；便携版默认不注册，后续可提供可选注册工具）
- "用 Typola 打开"右键菜单（安装版可选写入；便携版默认不写入，后续可提供可选注册工具）
- 系统托盘图标（可关）
- 窗口记忆位置与大小
- 安装版自动更新（electron-updater）
- 便携版应用内检查更新（跳转 GitHub Releases 下载最新便携包）

### 2.2 v2 规划（不在 v1 内）
- 插件机制（类 VS Code，activate/deactivate，API 沙箱）
- 主题市场 / 插件市场
- Git 集成（提交、历史、diff 视图）
- 图床上传（PicGo 集成 / 自定义 API）
- 拼写检查（nodehun + 多语言词典）
- AI 写作助手（本地 / 远程 LLM）
- 实时协作（Yjs / CRDT）
- WebDAV / S3 同步
- 跨平台（macOS / Linux）

---

## 三、技术架构

### 3.1 选型总览

| 层 | 选型 | 理由 |
|---|---|---|
| 壳 | **Electron 30+** + TypeScript | 成熟、Windows 打包稳定、生态丰富 |
| 构建 | Vite + electron-vite | HMR 快、配置简单 |
| UI 框架 | React 18 + TypeScript | 生态最大，可复用现成组件 |
| 状态 | Zustand 或 Jotai | 轻量，避免 Redux 的样板代码 |
| 编辑器核心 | **Milkdown**（ProseMirror 内核） | 天然 WYSIWYG Markdown，Typora 风格最佳开源选择 |
| 源码模式 | CodeMirror 6 | 提供"查看源码"视图 |
| Markdown 解析 | remark / unified | 与 Milkdown 生态一致，可复用插件 |
| 代码高亮 | Shiki | 基于 VS Code 引擎，效果最佳 |
| 数学公式 | KaTeX | 比 MathJax 快 10 倍，无需 DOM |
| 图表 | Mermaid.js | 官方库 |
| 样式 | Tailwind CSS + CSS Variables | 主题切换靠 CSS 变量 |
| 打包 | electron-builder | 生成 **NSIS 安装版**、卸载器、portable 绿色版与 `.zip` 压缩包 |
| 自动更新 | 双策略 | 安装版走 `electron-updater`，便携版走“发现新版本并引导下载替换” |

> **关于编辑器核心的关键决策**：Typora 最难复刻的是"所见即所得"体验。主流实现路径：
>
> 1. **Milkdown（推荐）**：基于 ProseMirror，专为 WYSIWYG Markdown 设计，已有社区示例接近 Typora。
> 2. **Tiptap + Markdown 扩展**：也是 ProseMirror 生态，语法扩展需自写。
> 3. **自研 ProseMirror schema**：最灵活，工作量最大。
>
> MVP 阶段选 Milkdown，长期若需深度定制可逐步下沉到 ProseMirror 层。

### 3.2 进程与模块划分

```
┌─────────────────────────────────────────────────────────┐
│                   Main Process (Node.js)                │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐     │
│  │ File Service │ │ Window Mgmt  │ │ Menu / Tray  │     │
│  └──────────────┘ └──────────────┘ └──────────────┘     │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐     │
│  │ Export (PDF) │ │ Auto Updater │ │ Settings IO  │     │
│  └──────────────┘ └──────────────┘ └──────────────┘     │
└─────────────────────────────┬───────────────────────────┘
                              │ IPC (contextBridge)
┌─────────────────────────────┴───────────────────────────┐
│                  Renderer Process (Chromium)            │
│  ┌───────────────────────────────────────────────────┐  │
│  │        Editor Core (Milkdown + Plugins)           │  │
│  │   WYSIWYG │ Source View │ Mermaid │ KaTeX │ ...   │  │
│  └───────────────────────────────────────────────────┘  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│  │ Sidebar  │ │ Outline  │ │ Tabs Bar │ │ StatusBar│   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │
│  ┌───────────────────────────────────────────────────┐  │
│  │   State (Zustand) · Theme · Shortcuts · Search    │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

**关键边界**
- Renderer **不直接** 访问 fs，所有文件/系统 API 走 preload 暴露的 `window.api.*`。
- 大文件流式读取、监听（chokidar）放在 Main，通过事件推送到 Renderer。
- Mermaid / KaTeX / 代码高亮全部在 Renderer 完成，避免跨进程 IPC 抖动。

### 3.3 数据与文件模型

- **文档即文件**：一个 Tab 对应一个磁盘文件，内存中保存脏状态。
- **工作区**：一个打开的目录，维护文件树 + 监听变化（外部编辑感知）。
- **图片资源**：默认与文档同名的 `xxx.assets/` 目录；可配置全局图片目录。
- **设置**：安装版存放在 `%APPDATA%/Typola/config.json`；便携版存放在应用目录下 `./data/config.json`。
- **主题**：安装版使用 `%APPDATA%/Typola/themes/*.css`；便携版使用 `./data/themes/*.css`。
- **会话与缓存**：安装版默认落在 `%APPDATA%/Typola/`；便携版默认落在 `./data/session.json`、`./data/cache/`。

---

## 四、关键技术挑战与方案

### 4.1 WYSIWYG 渲染的性能与稳定性
**挑战**：文档超过 1 万行时，ProseMirror 的 DOM 量大，卡顿。
**方案**：
- 视窗虚拟化（node view 懒渲染）。
- 代码块 / Mermaid / 公式使用 NodeView 独立挂载，避免重复 reparse。
- 大文档自动降级提示 "建议使用源码模式"。

### 4.2 Mermaid 图的实时渲染
**挑战**：编辑过程中每次按键都重渲染，开销高且会闪烁。
**方案**：
- 为 Mermaid 代码块做 debounce 渲染（200ms）。
- 缓存同一份源码的 SVG 结果。
- 渲染失败时保留上一次有效 SVG，仅在状态栏提示语法错误。

### 4.3 导出 PDF 的保真度
**挑战**：浏览器打印 CSS 与屏幕渲染差异大；分页、代码块换行、Mermaid 过宽。
**方案**：
- 使用 Electron `webContents.printToPDF`，统一控制 CSS `@media print`。
- 代码块 `white-space: pre-wrap` + `page-break-inside: avoid`。
- 宽图/宽 Mermaid 自动等比缩放到页宽。
- 后期接入 pandoc 做高保真 docx / LaTeX 导出。

### 4.4 图片粘贴与相对路径
**挑战**：剪贴板粘贴图片时，如何决定存哪、相对路径还是绝对路径。
**方案**：
- 若文件未保存，临时存入 app temp，保存时再转移到 `xxx.assets/`。
- 支持三种模式：同名 assets 目录 / 全局目录 / 外链上传（M2）。
- 写入时始终用相对路径，保证可移植。

### 4.5 主题与 Typora 生态兼容
**挑战**：Typora 社区有大量 CSS 主题，想复用。
**方案**：
- 渲染层 HTML 结构尽量对齐 Typora 的 class 命名（`#write`、`.md-section` 等）。
- 提供 "Typora 主题兼容模式" 开关，容忍部分差异。

### 4.6 安全
**方案**：
- `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`。
- 所有 Markdown HTML 输出用 DOMPurify 过滤。
- 代码执行（如 Mermaid、KaTeX）都是纯前端计算，不跑用户脚本。
- 插件系统（M3）引入 VM/Worker 隔离。

### 4.7 安装版与便携版并存的工程约束
**挑战**：产品既要像 Typora 一样支持安装/卸载，又要支持解压即用；两种分发形态不能互相污染数据目录和更新逻辑。
**方案**：
- 发布物同时提供 `Typola-Setup-x.y.z.exe`、卸载器、`Typola-portable.exe` 与 `Typola-win-portable.zip`。
- 运行时明确区分 `installed` 与 `portable` 模式，并按模式选择配置、主题、日志、缓存目录。
- 安装版默认启用系统级集成能力入口：卸载、文件关联、右键菜单、开始菜单快捷方式、自动更新。
- 便携版默认不依赖注册表与安装器；首次启动自动初始化 `data/` 目录结构，但不要求管理员权限。
- 更新策略分流：安装版走 `electron-updater`；便携版走“检查新版本 + GitHub Releases 下载页跳转 + 用户手动替换文件”。

---

## 五、v1 实施阶段（按依赖顺序，非按时间）

Claude vibe coding 下按"前序依赖"分阶段实施，每一阶段结束有一个可运行的里程碑版本。

### Phase 0 · 骨架与基础设施
- `typola/` 工程初始化：electron-vite + React 18 + TypeScript + Tailwind
- Main/Renderer/Preload 三层骨架 + contextBridge 基础 IPC
- Zustand store 骨架（editor / workspace / settings / ui）
- 路由与主窗口布局（侧边栏 + 编辑区 + 状态栏）
- 基础主题系统（CSS 变量）、暗色默认
- 双打包配置：安装版 `Typola-Setup.exe` + 便携版 `Typola-portable.exe` / `Typola-win-portable.zip`
- 运行模式识别与目录策略：安装版 `%APPDATA%/Typola/`，便携版 `./data/`
- CI：lint + typecheck + build + release（GitHub Actions）
- **产出标志**：安装版可正常安装/卸载，便携版可解压即用，二者都能打开空窗口 + 显示侧边栏

### Phase 1 · 编辑器核心与文件 IO
- Milkdown 集成（commonmark + GFM preset）
- 文件打开/保存/另存为 / 新建 / 最近文件
- 脏标记追踪与关闭前提示
- 自动保存策略
- 撤销/重做、查找替换（窗口内）
- 源码模式切换（CodeMirror 6）
- 字数统计状态栏
- **产出标志**：能完整编辑保存 .md，字符级所见即所得

### Phase 2 · 渲染增强
- Shiki 代码块高亮（按需加载语言）
- KaTeX 行内 + 块级公式
- Mermaid 节点：debounce 渲染 + SVG 缓存 + 错误容错
- Mermaid 双击编辑浮层（Monaco 轻量版或 CodeMirror）
- 脚注、定义列表、Front Matter、emoji 短码、高亮
- 图片粘贴/拖拽管理（`xxx.assets/` 策略）
- **产出标志**：所有 Typora 渲染能力全部对齐

### Phase 3 · 工作区与多标签
- 打开目录作为 Workspace
- 文件树组件（虚拟滚动、右键菜单、CRUD、回收站）
- 外部修改监听（chokidar）与冲突提示
- 多标签（Tab 栏、拖拽排序、脏标记）
- 会话恢复
- 大纲视图
- **产出标志**：可以把 Typola 当长期工作区使用

### Phase 4 · 全局搜索与视图
- 全局搜索（ripgrep 二进制嵌入 或 Node 层自实现）
- 搜索结果面板（带片段 + 跳转）
- 焦点模式 / 打字机模式 / 只读模式
- 侧栏独立开关、快捷键参照 Typora
- **产出标志**：可替代 Typora 的日常用例全打通

### Phase 5 · 导出管线
- HTML 导出（独立 / 带外链两档）
- PDF 导出（printToPDF，自定义页眉页脚、分页、代码块分页保护）
- docx 导出（优先 pandoc 通道 + 兜底自研）
- 整页 PNG 截图导出
- Mermaid 单图导出 SVG / PNG
- 纯 Markdown 清理导出
- **产出标志**：Typora 的所有导出场景都能覆盖

### Phase 6 · 主题系统
- 4–5 套内置主题（Light / Dark / Newsprint / GitHub / Academic）
- 主题热切换
- 用户主题目录（安装版 `%APPDATA%/Typola/themes/`；便携版 `./data/themes/`）+ 热加载
- UI 主题与渲染主题联动
- Shiki 主题联动
- **产出标志**：外观足够打磨，可以做发布截图

### Phase 7 · 设置与系统集成
- 设置面板（7 组 Tab）
- 快捷键可视化配置 + 冲突检测
- i18n 框架（中/英）
- 托盘图标
- 安装版自动更新 + 便携版版本检查与下载跳转
- 安装版文件关联/右键菜单/卸载入口 + 便携版可选注册工具
- 崩溃恢复与诊断日志
- **产出标志**：v1.0.0 正式版可发布

### Phase 8 · 打磨与发布
- 端到端手工走查 30+ 场景
- 性能基准：冷启动、打字延迟、1 万字/10 万字文档
- 完善 README、官网 landing、CHANGELOG、LICENSE
- 首发截图与演示视频
- 发布 v1.0.0 到 GitHub Releases

### 关键验收指标（v1.0）
- 冷启动 < 1.5s
- 1 万字文档输入延迟 p95 < 30ms
- 10 万字文档仍可编辑（< 100ms 延迟，允许自动降级提示）
- Mermaid 渲染失败率 < 1%（合法语法下）
- 安装版与便携版主包体积均 < 120MB，运行内存 < 400MB（单文档）
- 全流程无崩溃通过 30+ 手工场景

**关键验收指标**
- 冷启动 < 1.5s（M1 目标）
- 1 万字文档输入延迟 < 30ms
- Mermaid 渲染失败率 < 1%（合法语法下）
- 安装版与便携版主包体积均 < 120MB

---

## 六、项目结构草案

```
your-editor/
├── electron/              # Main & preload
│   ├── main/
│   │   ├── index.ts
│   │   ├── ipc/           # file, dialog, export, settings
│   │   ├── window.ts
│   │   └── menu.ts
│   └── preload/
│       └── index.ts       # contextBridge API
├── src/                   # Renderer (React)
│   ├── editor/            # Milkdown 封装 + 插件
│   │   ├── core/
│   │   ├── plugins/       # mermaid, katex, slash, table, image
│   │   └── themes/
│   ├── components/        # Sidebar, Tabs, Outline, StatusBar
│   ├── features/          # file-tree, search, export, settings
│   ├── store/             # Zustand stores
│   ├── hooks/
│   └── styles/
├── resources/             # 图标、默认主题
├── build/                 # electron-builder 配置
├── package.json
└── README.md
```

---

## 七、许可证与合规

- 建议 **MIT** 或 **Apache-2.0**（生态最友好）。
- 避免直接复用 Typora 的私有资源（图标、默认主题 CSS）。
- 依赖清单审计：Milkdown（MIT）、Mermaid（MIT）、KaTeX（MIT）、Shiki（MIT）均商用友好。
- 如未来做付费版，保持 core 开源 + Pro 插件闭源的双轨策略。

---

## 八、开放问题（已全部决策）

本次已全部敲定，见第 0 节。后续新出现的问题会在这里追加记录。

---

## 九、下一步行动

规划已完整，可直接进入落地。建议按以下顺序启动：

1. **确认仓库位置**：本地路径 `Typola/`（已是 workspace）即可，后续推到 GitHub 私有仓或直接公开仓。
2. **开始 Phase 0 工程骨架**：由我生成完整 `package.json`、`electron-vite` 配置、主/渲染/preload 三层基础代码、Zustand store、基础布局与主题变量、electron-builder 配置、GitHub Actions workflow、LICENSE、README、CHANGELOG。
3. **从 Phase 0 开始逐阶段推进**：每完成一个 Phase，打一个版本 tag（`v0.1`、`v0.2`…），直到 Phase 8 发布 `v1.0.0`。

完成后的仓库第一眼应该看到：

```
Typola/
├── electron/
│   ├── main/
│   ├── preload/
├── src/
│   ├── editor/
│   ├── components/
│   ├── features/
│   ├── store/
│   ├── styles/
│   └── App.tsx
├── resources/
├── build/
├── .github/workflows/
├── package.json
├── electron.vite.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── LICENSE (MIT)
├── README.md
└── CHANGELOG.md
```

> 本文档为规划 v0.3（全量 v1 稿）。无待决策项。
