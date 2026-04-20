# Typola

一款优雅高效的 Windows Markdown 编辑器。

[English](./README.md) | 中文

---

## 写作体验

- **所见即所得** — 无需了解 Markdown 语法，像 Notion 一样流畅书写
- **斜杠命令** — 输入 `/` 快速插入标题、列表、表格、代码块、图表
- **选中即格式化** — 选中文字自动弹出工具栏，快速设置粗体、斜体、删除线等
- **右键菜单** — 选中文字或置于行首，右键快速设置标题级别
- **自动保存** — 无需手动保存，写完即保存
- **外部修改感知** — 打开文件时自动检测外部修改，不丢失任何内容

---

## 特色功能

- **Mermaid 图表** — 插入图表，双击编辑，实时预览
- **代码高亮** — 写代码时自动识别语言并高亮
- **亮色/暗色主题** — 一键切换，适合不同光线环境
- **文件树** — 清晰展示工作区文件结构
- **大纲视图** — 快速导航长文档的大纲结构
- **多 Tab 页签** — 多文件切换，游刃有余

---

## 快捷键

| 操作 | 快捷键 |
|------|--------|
| 新建文件 | `Ctrl+N` |
| 保存 / 另存为 | `Ctrl+S` / `Ctrl+Shift+S` |
| 切换侧边栏 | `Ctrl+\` |
| 切换大纲 | `Ctrl+Shift+\` |
| 切换主题 | `Ctrl+Shift+D` |
| 标题 1/2/3 | `Ctrl+1` / `Ctrl+2` / `Ctrl+3` |
| 正文 | `Ctrl+0` |
| 粗体 / 斜体 / 删除线 | `Ctrl+B` / `Ctrl+I` / `Ctrl+Shift+S` |
| 行内代码 / 链接 | `` Ctrl+` `` / `Ctrl+K` |

---

## 下载

**Windows 10/11**

| 版本 | 下载 |
|------|------|
| 便携版 (ZIP) | [Typola-portable-0.1.0.zip](release/Typola-portable-0.1.0.zip) |

解压后直接运行 `Typola.exe` 即可。

> 如果需要安装版，请从 [Releases](https://github.com/ttttstc/Typola/releases) 页面下载。

---

## 从源码构建

```bash
npm install
npm run electron:build
```

构建产物位于 `release/` 目录。

---

## 许可证

MIT
