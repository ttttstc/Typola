# Typola 项目协作指南

## 项目简介

Typola 是一个轻量 Markdown 桌面编辑器，提供所见即所得 Markdown 编辑、源码模式、Word/HTML 预览与导出，以及集成终端。

技术栈：Tauri v2 + React 19 + TypeScript + Vite 8 + CodeMirror 6 + remark/rehype；Vditor 仅保留既有兼容预览资源。

## 基本约定

- 全程使用中文回复与写作。
- 用户可见变更写入 `CHANGELOG.md`。
- 涉及架构、命令、跨端行为时同步更新 `docs/ARCHITECTURE.md`。
- 自动保存保留为设置项，但默认关闭。
- 不恢复旧 Electron / Milkdown / 工作区 / 多标签 / 全局搜索实现。
- 不恢复法律行业专项、内测授权、复杂表格锁定或查看原貌链路。

## 文件清单

| 文档 | 位置 | 职责 |
|------|------|------|
| README.md | 根目录 | 项目介绍、快速开始 |
| CHANGELOG.md | 根目录 | 版本变更记录 |
| ARCHITECTURE.md | docs/ | 系统架构、数据流、模块说明 |

## 开发命令

```bash
npm install
npm run tauri dev
npm run typecheck
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri:build:local
```

## 关键设计决策

- 编辑器：CM6 同时承担写作与源码模式；Markdown 导出基座使用 remark/rehype，Vditor 仅保留既有兼容预览链路。
- 布局：默认单页 WYSIWYG 编辑，右侧 Word / HTML 预览面板按需打开。
- Word / HTML 导出：支持内置预设与用户自定义 JSON 预设；Word 使用内置 `docx` 生成器，不依赖 Pandoc 或其他外部可执行文件。
- Vditor 资源：本地化到 `public/vditor/dist/`，不依赖外部 CDN。
- 终端：通过 Tauri Rust commands + `portable-pty` 提供底部多标签终端。
