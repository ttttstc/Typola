# Typola · Design System

> 品牌、图标、视觉、UI、交互与技术栈规范。v2.1 · 2026-04-19

---

## 1. 品牌核心

**Typola** 是一款面向 Windows 桌面、AI 友好的本地 Markdown 编辑器。品牌气质关键词：

- **本地**（Local）—— 文件属于你，不属于云
- **通达**（Interoperable）—— 标准 `.md`，AI 和任何工具都能读写
- **轻**（Light）—— 安装包 30MB，启动 1 秒，不打扰系统
- **零门槛**（Zero Syntax）—— 像 Notion 一样打字，不用记符号

**品牌一句话**：Notion 的体验，`.md` 的数据，AI 的读写。

---

## 2. Logo 与图标

### 2.1 图标概念：T（三 W 抽象图标）

字母 T 作为 Typola 的核心视觉标识，简洁有力：

- **T** 代表 Typola 品牌首字母
- 简洁的线条设计，易于识别
- 适合在任务栏、系统托盘等小尺寸场景展示

### 2.2 图标规格

| 属性 | 值 |
|---|---|
| 画布尺寸 | 256 × 256（master） |
| 背景形状 | 圆角正方形（squircle） |
| 背景填充 | `#1a1a2e`（深蓝紫） |
| 文字颜色 | `#FFFFFF`（白色） |
| 圆角半径 | 15% |

### 2.3 多尺寸输出

Windows 分发包需要以下尺寸：

- 16, 32, 48, 128, 256

### 2.4 图标变体

| 变体 | 文件 | 用途 |
|---|---|---|
| 主图标 | `resources/typola.ico` | Windows 应用图标 |
| PNG 32 | `resources/icons/32x32.png` | 标题栏等小尺寸场景 |
| PNG 128 | `resources/icons/128x128.png` | 应用列表等中等尺寸 |

---

## 3. 配色系统

### 3.1 亮色主题（Light）

| Token | 值 | 说明 |
|---|---|---|
| `--color-ink` | `#0B0B0B` | 主文字、Logo 笔画 |
| `--color-paper` | `#FFFFFF` | 主背景、Logo 底 |
| `--color-line-strong` | `#0B0B0B` | 强分割线、边框 |
| `--color-line-soft` | `#E6E6E6` | 弱分割线、卡片边 |
| `--color-surface-sunken` | `#F7F7F7` | 侧边栏、状态栏、代码块背景 |
| `--color-muted` | `#6B6B6B` | 次要文字、图标 |

### 3.2 暗色主题（Dark）

| Token | 值 |
|---|---|
| `--color-ink` | `#F2F2F2` |
| `--color-paper` | `#0B0B0B` |
| `--color-line-strong` | `#F2F2F2` |
| `--color-line-soft` | `#242424` |
| `--color-surface-sunken` | `#141414` |
| `--color-muted` | `#9A9A9A` |

---

## 4. 字体系统

### 4.1 UI 字体

| 场景 | Windows | 备选 |
|---|---|---|
| 主 UI | Segoe UI Variable | Segoe UI, system-ui |
| 中文 UI | Microsoft YaHei UI | PingFang SC, sans-serif |

### 4.2 编辑区字体

| 场景 | 推荐 | 说明 |
|---|---|---|
| 正文 | Inter / Microsoft YaHei UI | 偏"工具感"，与 Notion 气质一致 |
| 代码 | Consolas / Cascadia Mono | Windows 自带，不增加安装包体积 |

### 4.3 字号阶梯

| Level | Size | Line height | 用途 |
|---|---|---|---|
| H1 | 26 / 36 | 1.25 | 正文 H1 |
| H2 | 22 / 32 | 1.3 | 正文 H2 |
| H3 | 18 / 28 | 1.35 | 正文 H3 |
| Body | 16 / 26 | 1.6 | 正文段落 |
| UI | 14 / 20 | 1.4 | 菜单、按钮、标签、斜杠命令项 |
| Caption | 12 / 18 | 1.4 | 状态栏、次要文字 |

---

## 5. 布局规范（主窗口）

```
┌────────────────────────────────────────────────────────┐
│  TitleBar (32px, draggable)    [🌙] [- □ X]          │
├────────┬──────────────────────────────────┬────────────┤
│        │  MenuBar (28px)                                  │
│        │  文件 | 编辑 | 段落 | 格式 | 视图              │
│        ├──────────────────────────────────┤            │
│  File  │                                  │            │
│  Tree  │         Editor Canvas           │  Outline   │
│ (240)  │       (max-width 820px,          │  (220px)   │
│        │        centered)                 │            │
│        │                                  │            │
│        │                                  │            │
├────────┴──────────────────────────────────┴────────────┤
│  StatusBar (24px · words · save status · path)         │
└────────────────────────────────────────────────────────┘
```

- **TitleBar**：32px，可拖拽，集成主题切换按钮
- **MenuBar**：28px，菜单栏（文件/编辑/段落/格式/视图）
- **File Tree**：默认 240px，可隐藏（`Ctrl+\`）
- **Outline**：默认 220px，可隐藏（`Ctrl+Shift+\`）
- **Editor Canvas**：内容区 max-width 820px，左右自动居中
- **StatusBar**：24px，显示字数、保存状态、当前文件相对路径

---

## 6. 菜单栏功能

### 6.1 文件菜单

| 功能 | 快捷键 |
|---|---|
| 新建文件 | `Ctrl+N` |
| 保存 | `Ctrl+S` |
| 退出 | - |

### 6.2 编辑菜单

| 功能 | 快捷键 |
|---|---|
| 撤销 | `Ctrl+Z` |
| 重做 | `Ctrl+Shift+Z` |
| 全选 | `Ctrl+A` |
| 快捷键设置 | - |

### 6.3 段落菜单

| 功能 | 快捷键 |
|---|---|
| 标题 1 | `Ctrl+1` |
| 标题 2 | `Ctrl+2` |
| 标题 3 | `Ctrl+3` |
| 正文 | `Ctrl+0` |
| 有序列表 | - |
| 无序列表 | - |
| 引用 | - |

### 6.4 格式菜单

| 功能 | 快捷键 |
|---|---|
| 粗体 | `Ctrl+B` |
| 斜体 | `Ctrl+I` |
| 删除线 | `Ctrl+Shift+S` |
| 行内代码 | `` Ctrl+` `` |
| 链接 | `Ctrl+K` |

### 6.5 视图菜单

| 功能 | 快捷键 |
|---|---|
| 侧边栏 | `Ctrl+\` |
| 大纲 | `Ctrl+Shift+\` |
| 主题切换 | `Ctrl+Shift+D` |

---

## 7. 核心交互：Notion-like 编辑体验

### 7.1 斜杠命令（Slash Command）

- 在空行开头输入 `/`，光标下方弹出插入菜单
- 菜单项按类别分组，支持模糊搜索
- 上下键移动，回车确认，`Esc` 关闭
- v1 菜单项（按顺序）：
  - **文本** · Heading 1 / Heading 2 / Heading 3 / Quote / Divider
  - **列表** · Bullet List / Ordered List / Todo List
  - **插入** · Table / Code Block / Image / Link
  - **图表** · Mermaid

### 7.2 选中浮动工具栏（Floating Toolbar）

- 选中一段文字时，上方 8px 处浮出小工具条
- 包含：段落格式下拉 / 粗体 / 斜体 / 删除线 / 行内代码 / 链接
- hover 项 120ms 高亮，点击立即生效
- 滚动或失焦时自动消失
- 高度 32px，圆角 8

### 7.3 右键上下文菜单

- 选中文字后右键弹出上下文菜单
- 快速设置：正文、标题 1、标题 2、标题 3

### 7.4 自动保存

- 用户停止输入 500ms 后写盘
- 关闭窗口、切换文件、失去焦点时立即 flush
- StatusBar 显示保存状态

### 7.5 外部修改检测

- 文件被外部程序修改时，Typola 检测到 mtime 变化
- 弹出确认对话框处理冲突

### 7.6 Mermaid 图表

- 斜杠命令 `/Mermaid` 插入一个 Mermaid 块
- 默认显示渲染结果；双击块进入编辑模式
- 编辑区失焦后回到渲染视图
- 渲染失败时显示错误信息

---

## 8. 快捷键总表

| 操作 | 快捷键 |
|---|---|
| 新建文件 | `Ctrl+N` |
| 保存 | `Ctrl+S` |
| 切换侧边栏 | `Ctrl+\` |
| 切换大纲 | `Ctrl+Shift+\` |
| 切换主题 | `Ctrl+Shift+D` |
| H1 | `Ctrl+1` |
| H2 | `Ctrl+2` |
| H3 | `Ctrl+3` |
| 正文 | `Ctrl+0` |
| 粗体 | `Ctrl+B` |
| 斜体 | `Ctrl+I` |
| 删除线 | `Ctrl+Shift+S` |
| 行内代码 | `` Ctrl+` `` |
| 链接 | `Ctrl+K` |
| 撤销 | `Ctrl+Z` |
| 重做 | `Ctrl+Shift+Z` |

---

## 9. 技术栈

| 层 | 选型 | 理由 |
|---|---|---|
| 桌面壳 | **Tauri 2.x** | Rust 后端 + 系统 WebView2，空包 3-10 MB |
| 前端框架 | **React 18** + TypeScript | 生态成熟，Milkdown 官方支持 |
| 编辑器内核 | **Milkdown**（基于 ProseMirror） | WYSIWYG Markdown、插件化 |
| 代码高亮 | **Shiki** | TextMate 级质量 |
| 图表 | **Mermaid** | 动态加载 |
| 样式 | CSS Variables + 原生 CSS | 不引入 Tailwind 运行时 |
| 文件 IO / 监听 | Rust（`notify` crate） | 外部修改检测 + 原子写盘 |

---

## 10. 分发产物

```
dist/
├── release/
│   ├── Typola_0.1.0_x64-setup.exe   # NSIS 安装版
│   └── Typola-portable-0.1.0.exe    # 便携版
├── index.html
└── assets/
```

- **安装版**：NSIS 安装程序，1.8MB
- **便携版**：单文件直接运行，4.9MB
- **依赖**：仅要求 Windows 10 1803+ 自带的 WebView2 Runtime

---

## 11. 版本

- v1.0 · 2026-04-17 · 首稿，Typora 替代品路线
- v2.0 · 2026-04-19 · 全面重写，转向 Notion-like + AI 友好 + Tauri 轻量路线
- v2.1 · 2026-04-19 · 新增菜单栏、右键上下文菜单、快捷键设置对话框、应用图标
