# Typola

一款轻量级、AI 友好的 Windows 桌面 Markdown 编辑器。

[English](./README.md) | 中文

***

## 功能特点

* **类 Notion 编辑体验** — WYSIWYG 所见即所得，无需记忆语法

* **斜杠命令** — 输入 `/` 插入各种块（标题、列表、表格、代码块、Mermaid 图表）

* **浮动工具栏** — 选中文字后弹出格式化工具（粗体、斜体、删除线、行内代码、链接）

* **右键上下文菜单** — 快速设置标题级别

* **自动保存** — 500ms 防抖保存机制

* **外部修改检测** — 检测外部编辑器对文件的修改

* **Mermaid 图表** — 插入并编辑图表，支持实时预览

* **Shiki 代码高亮** — 美丽的代码块，带语言标签

* **亮色/暗色主题** — `Ctrl+Shift+D` 切换

* **文件树和大纲** — 轻松导航长文档

* **Tab 页签** — 多文件切换

* **右键删除文件** — 文件树支持右键删除

***

## 快捷键

| 操作        | 快捷键                                  |
| --------- | ------------------------------------ |
| 新建文件      | `Ctrl+N`                             |
| 保存        | `Ctrl+S`                             |
| 另存为       | `Ctrl+Shift+S`                       |
| 切换侧边栏     | `Ctrl+\`                             |
| 切换大纲      | `Ctrl+Shift+\`                       |
| 切换主题      | `Ctrl+Shift+D`                       |
| 标题 1/2/3  | `Ctrl+1` / `Ctrl+2` / `Ctrl+3`       |
| 正文        | `Ctrl+0`                             |
| 粗体/斜体/删除线 | `Ctrl+B` / `Ctrl+I` / `Ctrl+Shift+S` |
| 行内代码/链接   | `` Ctrl+` `` / `Ctrl+K`              |

***

## 下载安装

### 系统要求

Windows 10/11

### 便携版

下载 `Typola-portable.zip` 并解压，直接运行 `Typola.exe` 即可。

### 从源码构建

```bash
npm install
npm run electron:build
```

构建产物位于 `release/` 目录。

***

## 技术栈

* **Electron 33.x** — 桌面运行环境

* **React 18** + TypeScript — 前端框架

* **Milkdown** — 基于 ProseMirror 的 Markdown 编辑器

* **Shiki** — 代码语法高亮

* **Mermaid** — 图表渲染（懒加载）

* **Zustand** — 状态管理

***

## 项目结构

```
typola/
├── src/                    # React 前端
│   ├── components/         # UI 组件
│   ├── editor/             # Milkdown 编辑器配置
│   ├── store/              # Zustand 状态管理
│   └── styles/             # CSS 样式文件
├── electron/               # Electron 主进程
│   ├── main.ts             # 主进程入口
│   └── preload.ts          # Preload 脚本
├── resources/               # 图标资源
├── release/                # 构建产物
└── design/                 # 设计文档
```

***

## 许可证

MIT