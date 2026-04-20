# Typola · Implementation Spec v1.0

> 面向 minimax2.7 的完整实现需求规范。基于 vision v2.0 / design v2.0。
> 平台：Windows 10 1803+（首发）· 2026-04-19

---

## 0. 快速索引

| Phase | 交付物 | 里程碑验收 |
|---|---|---|
| 0 | 工程骨架 + 空窗口可运行 | 安装包 ≤30MB，窗口正常打开 |
| 1 | 文件 IO + 基础 WYSIWYG 编辑 | 能打开/保存 `.md`，内容正确渲染 |
| 2 | 渲染增强（Mermaid + 代码高亮） | Mermaid 双击编辑，Shiki 高亮 |
| 3 | 工作区 + 文件树 + 完整交互 | 可作为日常写作工具使用 |
| 4 | 打磨 + 分发 | 安装包 ≤30MB，发布 v1.0.0 |

---

## 1. 产品概述

**Typola** 是一款面向 Windows 桌面的、AI 友好的本地 Markdown 编辑器。

- 交互范式：Notion-like（斜杠命令、块级编辑、选中浮动工具栏）
- 存储：标准 `.md` 文件，本地磁盘，无云账号
- 目标用户：产品经理、运营、设计师等非程序员；在意数据归属的个人写作者
- 核心卖点：不需要学 Markdown 语法；AI 工具（Claude Code、Cursor 等）可直接读写文件

---

## 2. 技术栈（硬性约束）

| 层 | 选型 | 版本要求 |
|---|---|---|
| 桌面壳 | **Tauri 2.x** | ≥2.0 |
| 前端框架 | **React 18** + TypeScript | ≥18.0 |
| 编辑器内核 | **Milkdown** (ProseMirror) | ≥7.0 |
| 状态管理 | **Zustand** | ≥4.0 |
| 代码高亮 | **Shiki** | ≥1.0，按需加载 |
| 图表 | **Mermaid** | ≥10.0，**懒加载**（首次插入时才下载） |
| 样式 | 原生 CSS + CSS Variables | 不引入 Tailwind 运行时 |
| 文件 IO / 监听 | Rust（`notify` crate） | Tauri 插件 |
| 打包 | `tauri build` | NSIS 安装版 + 便携版 `.exe` |

**体积硬门**：安装包 ≤ 30MB。每引入新依赖前必须评估体积影响。

**不能用 Electron**。

---

## 3. 工程结构

```
typola/
├── src/                        # 前端 (React + TypeScript)
│   ├── components/
│   │   ├── Layout.tsx           # 三栏主布局
│   │   ├── TitleBar.tsx         # 自定义标题栏（可拖拽）
│   │   ├── FileTree.tsx         # 左侧文件树
│   │   ├── Editor.tsx           # 编辑区（Milkdown 封装）
│   │   ├── Outline.tsx          # 右侧大纲
│   │   ├── StatusBar.tsx        # 底部状态栏
│   │   ├── SlashMenu.tsx        # 斜杠命令菜单
│   │   └── FloatingToolbar.tsx  # 选中浮动工具栏
│   ├── editor/
│   │   ├── index.tsx            # Milkdown 初始化与插件注册
│   │   ├── plugins/
│   │   │   ├── slash.ts         # 斜杠命令插件
│   │   │   ├── mermaid.ts       # Mermaid 块插件
│   │   │   └── image.ts         # 图片插入与 .resources/ 策略
│   │   └── theme.ts             # 编辑区 CSS 变量注入
│   ├── store/
│   │   ├── workspace.ts         # 工作区状态（当前目录、文件树）
│   │   ├── editor.ts            # 编辑器状态（当前文件、脏标记）
│   │   └── ui.ts                # UI 状态（侧栏开关、主题）
│   ├── styles/
│   │   ├── tokens.css           # CSS 变量（颜色、字体、间距）
│   │   ├── light.css            # 亮色主题
│   │   ├── dark.css             # 暗色主题
│   │   └── editor.css           # 编辑区渲染样式
│   ├── App.tsx
│   └── main.tsx
├── src-tauri/                   # Rust 后端
│   ├── src/
│   │   ├── main.rs
│   │   ├── file.rs              # 文件读写、原子保存
│   │   ├── watcher.rs           # 外部修改监听（notify crate）
│   │   └── cmd.rs               # Tauri commands 注册
│   ├── Cargo.toml
│   └── tauri.conf.json
├── resources/
│   ├── icons/                   # Trio W 图标各尺寸
│   └── typola.ico
├── index.html
├── vite.config.ts
├── tsconfig.json
├── package.json
└── README.md
```

---

## 4. Phase 0 · 工程骨架

**目标**：空窗口可运行，三栏布局显示，安装包可打出且 ≤30MB。

### 4.1 工程初始化

```bash
# 用 Tauri 官方模板初始化
npm create tauri-app@latest typola -- --template react-ts
cd typola
npm install
```

### 4.2 依赖清单（package.json）

```json
{
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "@milkdown/core": "^7.6.0",
    "@milkdown/react": "^7.6.0",
    "@milkdown/preset-commonmark": "^7.6.0",
    "@milkdown/preset-gfm": "^7.6.0",
    "@milkdown/plugin-slash": "^7.6.0",
    "@milkdown/plugin-tooltip": "^7.6.0",
    "@milkdown/plugin-history": "^7.6.0",
    "@milkdown/plugin-listener": "^7.6.0",
    "zustand": "^4.5.0",
    "shiki": "^1.6.0",
    "lucide-react": "^0.400.0"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.0.0",
    "vite": "^5.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "typescript": "^5.4.0"
  }
}
```

> Mermaid **不在**初始依赖里，Phase 2 按需动态 import。

### 4.3 Tauri 配置要点（tauri.conf.json）

```json
{
  "productName": "Typola",
  "version": "0.1.0",
  "identifier": "com.typola.app",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:1420"
  },
  "app": {
    "windows": [{
      "title": "Typola",
      "width": 1280,
      "height": 800,
      "minWidth": 800,
      "minHeight": 600,
      "decorations": false,
      "transparent": false,
      "resizable": true
    }]
  },
  "bundle": {
    "active": true,
    "targets": ["nsis", "app"],
    "icon": ["resources/icons/32x32.png", "resources/icons/128x128.png", "resources/typola.ico"],
    "windows": {
      "nsis": {
        "installMode": "currentUser"
      }
    }
  }
}
```

`decorations: false` 使用自定义标题栏（TitleBar 组件负责拖拽和窗口控制按钮）。

### 4.4 主布局（Layout.tsx）

三栏结构，CSS Grid：

```
┌────────────────────────────────────────────────┐
│  TitleBar (32px, data-tauri-drag-region)       │
├──────────┬─────────────────────────┬───────────┤
│ FileTree │      Editor             │  Outline  │
│ (240px)  │  (flex:1, max-w:820px)  │  (220px)  │
│          │       centered          │           │
├──────────┴─────────────────────────┴───────────┤
│  StatusBar (24px)                              │
└────────────────────────────────────────────────┘
```

- FileTree 和 Outline 可通过 `Ctrl+\` / `Ctrl+Shift+\` 切换显示/隐藏
- 编辑区内容 max-width 820px，水平居中

### 4.5 主题系统（tokens.css）

```css
:root {
  --color-ink: #0B0B0B;
  --color-paper: #FFFFFF;
  --color-line-strong: #0B0B0B;
  --color-line-soft: #E6E6E6;
  --color-surface-sunken: #F7F7F7;
  --color-muted: #6B6B6B;
  --color-focus: #0B0B0B;
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
}

[data-theme="dark"] {
  --color-ink: #F2F2F2;
  --color-paper: #0B0B0B;
  --color-line-strong: #F2F2F2;
  --color-line-soft: #242424;
  --color-surface-sunken: #141414;
  --color-muted: #9A9A9A;
  --color-focus: #F2F2F2;
}
```

主题切换：在 `<html>` 上切换 `data-theme="dark"`，300ms `ease-in-out` transition。

### 4.6 Rust 侧（src-tauri/src）

Phase 0 只需要：

```rust
// cmd.rs
#[tauri::command]
fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
```

文件 IO 命令在 Phase 1 实现。

### 4.7 验收标准

- [ ] `npm run tauri dev` 启动无报错，白色空窗口显示 TitleBar + 三栏骨架
- [ ] `npm run tauri build` 产出 NSIS 安装包，体积 ≤30MB
- [ ] 安装版可正常安装/卸载（控制面板可见）
- [ ] `Ctrl+\` 隐藏/显示文件树；`Ctrl+Shift+\` 隐藏/显示大纲
- [ ] 拖拽 TitleBar 可移动窗口；窗口控制按钮（最小化/最大化/关闭）功能正常

---

## 5. Phase 1 · 文件 IO + 基础 WYSIWYG 编辑

**目标**：能打开 `.md` 文件，WYSIWYG 渲染，编辑后保存，自动保存生效。

### 5.1 Tauri Commands（Rust）

```rust
// file.rs
#[tauri::command]
async fn read_file(path: String) -> Result<String, String>;

#[tauri::command]
async fn write_file(path: String, content: String) -> Result<(), String>;

#[tauri::command]
async fn pick_folder() -> Result<Option<String>, String>;

#[tauri::command]
async fn list_dir(path: String) -> Result<Vec<FileEntry>, String>;

#[tauri::command]
async fn create_file(path: String) -> Result<(), String>;

#[tauri::command]
async fn rename_path(old: String, new: String) -> Result<(), String>;

#[tauri::command]
async fn delete_path(path: String) -> Result<(), String>;

#[tauri::command]
async fn save_image(workspace_root: String, data: Vec<u8>, ext: String) -> Result<String, String>;
// 返回相对路径，如 ".resources/1714123456789-abc.png"
// 自动创建 .resources/ 目录
```

`write_file` 必须原子写（先写临时文件再 rename），防止写入中断导致文件损坏。

### 5.2 Milkdown 集成（editor/index.tsx）

```tsx
import { Editor, rootCtx, defaultValueCtx } from '@milkdown/core'
import { commonmark } from '@milkdown/preset-commonmark'
import { gfm } from '@milkdown/preset-gfm'
import { history } from '@milkdown/plugin-history'
import { listener, listenerCtx } from '@milkdown/plugin-listener'

export function createEditor(
  container: HTMLElement,
  initialContent: string,
  onChange: (markdown: string) => void
) {
  return Editor.make()
    .config(ctx => {
      ctx.set(rootCtx, container)
      ctx.set(defaultValueCtx, initialContent)
      ctx.get(listenerCtx).markdownUpdated((_, md) => onChange(md))
    })
    .use(commonmark)
    .use(gfm)
    .use(history)
    .use(listener)
    .create()
}
```

### 5.3 自动保存（editor store）

```typescript
// store/editor.ts
interface EditorState {
  currentFile: string | null   // 当前文件绝对路径
  content: string              // 当前内容（Markdown 字符串）
  isDirty: boolean
  saveStatus: 'saved' | 'saving' | 'error'
  autoSaveTimer: ReturnType<typeof setTimeout> | null
}

// 每次 content 变化时：
// 1. 设置 isDirty = true
// 2. 清除上次 timer，设置新 timer 500ms 后调用 saveFile()
// 3. 窗口 blur / beforeunload 时立即 saveFile()
```

### 5.4 编辑区渲染样式（editor.css）

```css
.ProseMirror {
  max-width: 820px;
  margin: 0 auto;
  padding: 48px 64px;
  font-size: 16px;
  line-height: 1.6;
  color: var(--color-ink);
  background: var(--color-paper);
}

.ProseMirror h1 { font-size: 26px; line-height: 1.25; }
.ProseMirror h2 { font-size: 22px; line-height: 1.3; }
.ProseMirror h3 { font-size: 18px; line-height: 1.35; }

.ProseMirror p { margin: 0 0 0.8em; }

.ProseMirror blockquote {
  border-left: 3px solid var(--color-line-strong);
  margin: 0;
  padding-left: 16px;
  color: var(--color-muted);
}

.ProseMirror table {
  border-collapse: collapse;
  width: 100%;
}
.ProseMirror td, .ProseMirror th {
  border: 1px solid var(--color-line-soft);
  padding: 6px 12px;
}
.ProseMirror tr:hover td { background: var(--color-surface-sunken); }

.ProseMirror a {
  text-decoration: underline;
  color: inherit;
}

.ProseMirror hr {
  border: none;
  border-top: 1px solid var(--color-line-soft);
  margin: 2em 0;
}

/* 待办清单 */
.ProseMirror input[type="checkbox"] {
  appearance: none;
  width: 14px;
  height: 14px;
  border: 1.5px solid var(--color-ink);
  border-radius: 2px;
  margin-right: 6px;
  vertical-align: middle;
  cursor: pointer;
}
.ProseMirror input[type="checkbox"]:checked {
  background: var(--color-ink);
}
.ProseMirror li:has(input[type="checkbox"]:checked) {
  text-decoration: line-through;
  color: var(--color-muted);
}
```

### 5.5 状态栏（StatusBar）

显示内容（从左到右）：
- 字数：`XXX 字`（中文按字符计，英文按词计）
- 保存状态：`已保存` / `保存中…` / `保存失败`
- 当前文件相对路径（相对工作区根目录）

### 5.6 验收标准

- [ ] 点击"打开工作区"，选择一个包含 `.md` 文件的文件夹，文件树显示目录结构
- [ ] 点击文件树中的 `.md` 文件，编辑区加载内容并渲染（无源码符号可见）
- [ ] 编辑内容后 500ms，StatusBar 显示"保存中…"然后变"已保存"
- [ ] 用外部编辑器（记事本/VS Code）保存同一文件，Typola 弹出提示
- [ ] `Ctrl+S` 立即强制保存
- [ ] 新建文件（`Ctrl+N`），输入内容，保存到当前工作区

---

## 6. Phase 2 · 渲染增强

**目标**：代码块 Shiki 语法高亮；Mermaid 图表懒加载 + 双击编辑。

### 6.1 Shiki 代码高亮

在 Milkdown 的代码块 NodeView 中集成 Shiki：

```typescript
// plugins/highlight.ts
import { createHighlighter } from 'shiki'

// 模块级单例，第一次使用时初始化
let highlighter: Awaited<ReturnType<typeof createHighlighter>> | null = null

async function getHighlighter() {
  if (!highlighter) {
    highlighter = await createHighlighter({
      themes: ['github-light', 'github-dark'],
      // 只加载常用语言，其余按需加载
      langs: ['javascript', 'typescript', 'python', 'bash', 'json', 'markdown',
              'rust', 'go', 'java', 'css', 'html', 'sql']
    })
  }
  return highlighter
}
```

- 未识别语言降级为纯文本，不报错
- 代码块右上角显示"复制"按钮（点击后 2 秒消失，变为"✓"）
- 语言标签左上角显示（如 `typescript`）

### 6.2 Mermaid 懒加载

```typescript
// plugins/mermaid.ts

// Mermaid 模块懒加载，只在第一次渲染 Mermaid 块时执行
let mermaidModule: typeof import('mermaid') | null = null

async function getMermaid() {
  if (!mermaidModule) {
    mermaidModule = await import('mermaid')
    mermaidModule.default.initialize({
      startOnLoad: false,
      theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'default',
      securityLevel: 'loose'
    })
  }
  return mermaidModule.default
}
```

### 6.3 Mermaid NodeView

Mermaid 块的状态机：

```
[显示模式] ←── 失焦 / Esc ──── [编辑模式]
     │                              ↑
     └────── 双击 ────────────────→ │
```

**显示模式**（默认）：
- 渲染 SVG，居中显示
- hover 时右下角显示"双击编辑"提示文字
- 渲染失败时显示红色错误信息 + 保留上次有效 SVG

**编辑模式**（双击进入）：
- 上方：`<textarea>` 显示 Mermaid 源码（等宽字体，自动高度）
- 下方：实时预览（debounce 300ms）
- `Esc` 或点击编辑区外部退出，回到显示模式
- 源码保存为标准 Markdown fenced code block：
  ````
  ```mermaid
  flowchart LR
    A --> B
  ```
  ````

### 6.4 图片处理（plugins/image.ts）

粘贴或拖拽图片时：

1. 捕获 `paste` / `drop` 事件
2. 提取图片 binary data
3. 调用 Tauri command `save_image(workspaceRoot, data, ext)`
4. Rust 侧：
   - 确保 `{workspaceRoot}/.resources/` 目录存在
   - 文件名：`{Date.now()}-{randomHex(8)}.{ext}`
   - 写入文件，返回相对路径
5. 前端将相对路径插入为 `![image](./.resources/xxx.png)`

图片在编辑区内渲染时使用 `convertFileSrc()` 转换为 Tauri asset URL。

### 6.5 验收标准

- [ ] 代码块显示语言对应的 Shiki 高亮（github-light 主题）
- [ ] 暗色模式下代码块切换为 github-dark 主题
- [ ] 斜杠命令插入 `/mermaid`，默认显示 `flowchart LR\n  A --> B`
- [ ] 双击 Mermaid 块进入编辑模式，修改源码后预览实时更新（300ms debounce）
- [ ] Esc 退出编辑模式，显示渲染结果
- [ ] Mermaid 语法错误时：显示错误信息，不崩溃，保留上次有效渲染
- [ ] 粘贴截图进编辑区：图片自动保存至 `.resources/`，Markdown 写入相对路径
- [ ] 拖拽图片文件进编辑区：同上

---

## 7. Phase 3 · 完整交互

**目标**：斜杠命令、浮动工具栏、大纲、文件树 CRUD、外部修改检测全部完成，可作为日常写作工具。

### 7.1 斜杠命令（SlashMenu）

触发条件：在空行开头输入 `/`

菜单项定义：

```typescript
const SLASH_ITEMS = [
  // 文本
  { id: 'h1',       label: 'Heading 1',    icon: 'Heading1',     group: '文本' },
  { id: 'h2',       label: 'Heading 2',    icon: 'Heading2',     group: '文本' },
  { id: 'h3',       label: 'Heading 3',    icon: 'Heading3',     group: '文本' },
  { id: 'quote',    label: '引用',          icon: 'Quote',        group: '文本' },
  { id: 'divider',  label: '分割线',        icon: 'Minus',        group: '文本' },
  // 列表
  { id: 'bullet',   label: '无序列表',      icon: 'List',         group: '列表' },
  { id: 'ordered',  label: '有序列表',      icon: 'ListOrdered',  group: '列表' },
  { id: 'todo',     label: '待办清单',      icon: 'CheckSquare',  group: '列表' },
  // 插入
  { id: 'table',    label: '表格',          icon: 'Table',        group: '插入' },
  { id: 'code',     label: '代码块',        icon: 'Code',         group: '插入' },
  { id: 'image',    label: '图片',          icon: 'Image',        group: '插入' },
  { id: 'link',     label: '链接',          icon: 'Link',         group: '插入' },
  // 图表
  { id: 'mermaid',  label: 'Mermaid 图表', icon: 'GitBranch',    group: '图表' },
]
```

交互细则：
- 继续打字可模糊过滤菜单项（匹配 `label`）
- `↑` / `↓` 键移动高亮，`Enter` 确认，`Esc` 关闭
- 菜单宽度 280px，每项 36px 高，配 16px 图标
- 菜单出现在光标下方 8px，超出视口时向上展开
- 确认后删除已输入的 `/xxx`，插入对应块

### 7.2 浮动工具栏（FloatingToolbar）

触发条件：鼠标选中一段非空文本

工具栏按钮：

| 按钮 | 图标 | 快捷键 | 效果 |
|---|---|---|---|
| 粗体 | `Bold` | `Ctrl+B` | 切换 strong mark |
| 斜体 | `Italic` | `Ctrl+I` | 切换 em mark |
| 删除线 | `Strikethrough` | `Ctrl+Shift+S` | 切换 strike mark |
| 行内代码 | `Code` | `` Ctrl+` `` | 切换 code mark |
| 链接 | `Link` | `Ctrl+K` | 弹出链接输入框 |

样式：
- 高度 32px，内边距 4px，圆角 8px
- `box-shadow: 0 1px 2px rgba(0,0,0,0.06)`
- 背景 `--color-paper`，按钮 hover 时背景 `--color-surface-sunken`
- 出现动画 120ms ease-out；滚动或失焦消失

### 7.3 大纲（Outline）

- 监听编辑器内容变化，提取所有 H1/H2/H3 节点
- 用缩进（H2 左移 12px，H3 左移 24px）表示层级
- 点击跳转到对应标题（`scrollIntoView`）
- 当前光标所在标题高亮

```typescript
interface OutlineItem {
  id: string      // 标题节点 id 或生成的唯一 key
  level: 1 | 2 | 3
  text: string
  pos: number     // ProseMirror 文档位置
}
```

### 7.4 文件树（FileTree）

左侧文件树操作：

**基础操作**：
- 点击文件：加载到编辑区（如有未保存内容先提示）
- 点击文件夹：展开/折叠
- `Ctrl+N`：在当前选中目录下新建文件，文件名输入框立即获焦
- 右键菜单：新建文件、新建文件夹、重命名、删除

**命名规则**：
- 新建文件默认名 `未命名.md`，如已存在则追加 `-1`、`-2`
- 删除操作弹出确认对话框（不可撤销）

**文件树数据**：

```typescript
interface FileEntry {
  name: string
  path: string       // 绝对路径
  isDir: boolean
  children?: FileEntry[]  // 仅 isDir 时有
}
```

**展示规则**：
- 文件夹排在文件前面
- 隐藏以 `.` 开头的文件和文件夹（`.resources` 不显示）
- 支持虚拟滚动（文件数量多时不卡顿）

### 7.5 外部修改检测

Rust 侧 `watcher.rs` 使用 `notify` crate 监听当前打开文件：

```rust
// 监听当前打开文件的 mtime 变化
// 通过 Tauri event 推送到前端
tauri::emit!(app, "file-changed", &path);
```

前端响应逻辑：

```typescript
listen('file-changed', async (event) => {
  const path = event.payload as string
  if (path !== currentFile) return

  if (isDirty) {
    // 有未保存修改，弹出对话框
    showConflictDialog({
      onKeepMine: () => { /* 用当前内容覆盖磁盘 */ saveFile() },
      onLoadDisk: () => { /* 从磁盘重新加载 */ reloadFile() },
    })
  } else {
    // 无未保存修改，静默重新加载
    await reloadFile()
    showStatusHint('文件已从磁盘重新加载')
  }
})
```

### 7.6 快捷键总表

| 操作 | 快捷键 |
|---|---|
| 新建文件 | `Ctrl+N` |
| 强制保存 | `Ctrl+S` |
| 切换文件树 | `Ctrl+\` |
| 切换大纲 | `Ctrl+Shift+\` |
| 切换暗色/亮色 | `Ctrl+Shift+D` |
| 粗体 | `Ctrl+B` |
| 斜体 | `Ctrl+I` |
| 删除线 | `Ctrl+Shift+S` |
| 行内代码 | `` Ctrl+` `` |
| 链接 | `Ctrl+K` |
| H1 | `Ctrl+1` |
| H2 | `Ctrl+2` |
| H3 | `Ctrl+3` |
| 撤销 | `Ctrl+Z` |
| 重做 | `Ctrl+Shift+Z` |

### 7.7 验收标准

- [ ] 在空行输入 `/`，菜单弹出；继续输入过滤；`Enter` 插入对应块
- [ ] 选中文字，浮动工具栏出现；点击粗体，文字变粗；点击链接弹出输入框
- [ ] 大纲跟随编辑器内容实时更新；点击大纲项滚动到对应标题
- [ ] 文件树：新建文件、重命名、删除均正常工作
- [ ] 删除文件弹出确认对话框
- [ ] 外部修改文件（VS Code 保存同一文件）：有未保存修改时弹出冲突对话框，无修改时静默重载
- [ ] 所有快捷键功能正确

---

## 8. Phase 4 · 打磨与分发

**目标**：安装包 ≤30MB，冷启动 <1 秒，全流程无崩溃，发布 v1.0.0。

### 8.1 体积检查清单

在 `npm run tauri build` 后执行：

```bash
# 检查安装包体积
ls -lh src-tauri/target/release/bundle/nsis/*.exe

# 检查前端 bundle（gzipped）
du -sh dist/assets/*.js
```

目标：
- 安装包 ≤ 30MB
- 首屏 JS bundle（不含 Mermaid）gzipped ≤ 500KB

如超出，优先排查：
1. 是否有 Mermaid 被静态 import（改为动态 import）
2. Shiki 是否加载了所有语言 grammar（改为只加载常用 12 种）
3. Lucide 图标是否 tree-shaking 生效

### 8.2 性能验收指标

| 指标 | 目标 |
|---|---|
| 冷启动时间（到编辑区可交互） | < 1 秒 |
| 空闲内存（无文件打开） | < 150MB |
| 单文件加载（10,000 字） | < 200ms |
| 输入延迟（p95） | < 30ms |
| Mermaid 首次加载时间 | < 800ms（本地，无网络） |

### 8.3 手工走查场景（发布前必须全部通过）

**文件操作**
- [ ] 首次打开软件，选择工作区文件夹
- [ ] 新建文件、输入内容、自动保存
- [ ] 打开已有 `.md` 文件，内容正确渲染
- [ ] 重命名文件，编辑区标题栏同步更新
- [ ] 删除文件（确认后），文件树移除

**编辑功能**
- [ ] 斜杠命令插入所有类型块（H1-H3、列表、表格、代码块、引用、Mermaid、图片）
- [ ] 浮动工具栏：粗体、斜体、删除线、行内代码、链接
- [ ] 待办清单打勾/取消
- [ ] 表格：输入内容，Tab 键移动到下一格
- [ ] 撤销/重做
- [ ] 粘贴截图，图片保存到 `.resources/`，相对路径正确

**Mermaid**
- [ ] 插入 Mermaid，渲染正确
- [ ] 双击进入编辑模式，修改源码，预览更新
- [ ] 语法错误时显示错误信息，不崩溃
- [ ] Esc 退出编辑模式

**主题**
- [ ] `Ctrl+Shift+D` 切换暗色/亮色，动画流畅
- [ ] 重启后主题设置保留

**其他**
- [ ] 外部修改检测（VS Code 编辑同一文件）
- [ ] 窗口大小记忆（关闭再打开，恢复上次位置和大小）
- [ ] 工作区记忆（重启后自动打开上次工作区）

### 8.4 设置持久化

设置存储路径：
- 安装版：`%APPDATA%\Typola\config.json`
- 便携版：`.\data\config.json`（与 `.exe` 同目录）

```typescript
interface Config {
  theme: 'light' | 'dark'
  lastWorkspace: string | null
  windowBounds: { x: number; y: number; width: number; height: number }
  sidebarVisible: boolean
  outlineVisible: boolean
}
```

启动时读取，关闭时写入。

### 8.5 分发产物

```
release/
├── Typola-Setup-1.0.0.exe      # NSIS 安装版（控制面板可卸载）
└── Typola-portable-1.0.0.exe   # 便携版（解压即用，无注册表依赖）
```

便携版识别：检测 `data/` 目录是否在 `.exe` 同级存在，是则为便携模式，配置存 `data/config.json`。

### 8.6 GitHub Release

```
v1.0.0 Release Notes
- 首个正式版本
- 支持 Notion-like WYSIWYG Markdown 编辑
- Mermaid 图表支持（双击编辑）
- Shiki 代码高亮
- 斜杠命令、浮动工具栏
- 自动保存（500ms debounce）
- 外部修改检测
- 亮色/暗色主题
- 安装包 < 30MB
```

---

## 9. 非功能需求

### 9.1 安全

- Tauri 默认 `CSP` 头，拦截外部脚本注入
- Milkdown 渲染的 HTML 不执行用户提供的脚本
- 图片只允许 `asset://` 协议加载，不允许 `http://` 加载外部图片（防止信息泄露）
- Rust 侧文件 IO：路径遍历检测，禁止读写工作区之外的路径

### 9.2 错误处理原则

- Rust command 返回 `Result<T, String>`，前端对 `Err` 统一显示 StatusBar 提示，不 alert
- Mermaid 渲染错误：catch 后显示错误文字，保留上次 SVG，不抛出
- 文件保存失败：StatusBar 显示"保存失败"，保留内存内容，5 秒后自动重试

### 9.3 不做的事（v1 明确排除）

- 源码模式切换（WYSIWYG 是唯一视图）
- 多标签
- 导出 PDF / docx / HTML
- 用户主题系统（只有内置亮/暗）
- KaTeX 数学公式
- Front Matter
- 自定义快捷键
- i18n（v1 只有中文 UI）
- 自动更新

---

## 10. 版本记录

- v1.0 · 2026-04-19 · 首稿，基于 vision v2.0 / design v2.0
