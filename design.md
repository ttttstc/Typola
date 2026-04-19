# Typola · Design System

> 品牌、图标、视觉与 UI 设计规范。v1.0 · 2026-04-17

---

## 1. 品牌核心

**Typola** 是一款面向 Windows 桌面的开源 Markdown 编辑器。品牌气质关键词：

- **专注**（Focused）—— 面向长时间写作的人，不打扰、不喧宾夺主
- **克制**（Restrained）—— 纯黑白、极简几何、无多余装饰
- **有节奏**（Rhythmic）—— 写作是一件有韵律的事，图标与排版都在暗示这一点
- **开放**（Open）—— MIT 开源、本地数据、无锁定

**品牌一句话**：像写 Word 一样写 Markdown —— Typola 把所见即所得还给你。

---

## 2. Logo 与图标

### 2.1 图标概念：Trio W（三 W 抽象图标）

三个相同的 W 形符号横向排列，作为 Typola 的核心视觉标识。三层含义：

- **WYSIWYG**（What You See Is What You Get）—— 产品的核心体验，三个单词分别以 **W** 开头
- **节拍感** —— 连续的起伏像波形、山脉、心电图，暗示写作的韵律
- **抽象克制** —— 它不"像"任何具象事物，留给用户自己的联想

### 2.2 主图标预览

![Typola Icon](./assets/typola-icon.svg)

*（如果预览未渲染，打开 `assets/typola-icon.svg` 查看。）*

### 2.3 几何规格（主图标）

| 属性 | 值 |
|---|---|
| 画布尺寸 | 1024 × 1024（master） |
| 背景形状 | 圆角正方形（squircle） |
| 背景圆角半径 | 220 |
| 背景填充 | `#FFFFFF`（亮色版）/ `#0B0B0B`（暗色版） |
| 背景描边 | 8，`#000000`（亮色版）/ `#FFFFFF`（暗色版） |
| 笔画颜色 | `#000000`（亮色版）/ `#FFFFFF`（暗色版） |
| 笔画粗细 | 56 |
| 笔画端点 | `round`（圆头） |
| 笔画连接 | `round`（圆角转折） |
| 安全区 | 中心 800 × 240（W 集群） |
| W 尺寸 | 每个 W 宽 240、高 240 |
| W 间距 | 40（视觉上清晰可辨三个独立 W） |

### 2.4 三个 W 的坐标（参考）

```
W1: (112,392) → (172,632) → (232,392) → (292,632) → (352,392)
W2: (392,392) → (452,632) → (512,392) → (572,632) → (632,392)
W3: (672,392) → (732,632) → (792,632) → (852,632) → (912,392)
```

整体居中于画布 512,512，顶部 y=392，底部 y=632。

### 2.5 图标变体

| 变体 | 文件 | 用途 |
|---|---|---|
| 亮色主图 | `assets/typola-icon.svg` | 默认，应用图标、官网、README |
| 暗色反白 | `assets/typola-icon-dark.svg` | 暗色背景或暗色主题下 |
| 纯符号（无底） | `assets/typola-icon-mono.svg` | 嵌入文本、水印、 favicon、印刷单色 |
| 小尺寸简化版 | `assets/typola-icon-small.svg` | 16–32 px 任务栏 / 系统托盘（仅保留一个 W） |

### 2.6 多尺寸输出规划

Windows 分发包（便携版/安装版共用 `.ico`）需要以下尺寸，从 master SVG 栅格化生成：

- 16, 20, 24, 32, 40, 48, 64, 96, 128, 256

小于 48 px 的尺寸使用 `typola-icon-small.svg`（只保留单个 W），否则三 W 会糊成一片。

### 2.7 最小净空与禁用

- **最小净空**：图标四周留出 ≥ 12% 画布宽度的空白
- **最小使用尺寸**：16 px（简化版）/ 32 px（完整三 W 版）
- **禁用**：
  - ❌ 修改 W 形状、增加阴影、渐变、描边颜色
  - ❌ 拉伸或压缩（必须等比缩放）
  - ❌ 添加"Typora"式的橙色圆圈或任何强调色
  - ❌ 把三个 W 换成别的字母

---

## 3. 配色系统

v1 坚持 **纯黑白单色** 策略（呼应图标调性），强调色留给主题系统解决。

### 3.1 核心色（Brand Tokens）

| Token | 值 | 说明 |
|---|---|---|
| `--color-ink` | `#0B0B0B` | 主文字、Logo 笔画 |
| `--color-paper` | `#FFFFFF` | 主背景、Logo 底 |
| `--color-line-strong` | `#0B0B0B` | 强分割线、边框 |
| `--color-line-soft` | `#E6E6E6` | 弱分割线、卡片边 |
| `--color-surface-sunken` | `#F7F7F7` | 侧边栏、状态栏背景 |
| `--color-muted` | `#6B6B6B` | 次要文字、图标 |
| `--color-focus` | `#0B0B0B` | 焦点态描边（与 ink 同色，只是厚度变化） |

### 3.2 暗色映射（Dark Theme Default）

| Token | 值 |
|---|---|
| `--color-ink` | `#F2F2F2` |
| `--color-paper` | `#0B0B0B` |
| `--color-line-strong` | `#F2F2F2` |
| `--color-line-soft` | `#242424` |
| `--color-surface-sunken` | `#141414` |
| `--color-muted` | `#9A9A9A` |

### 3.3 主题系统关系

上述 Token **仅用于 UI 框架**（菜单、侧栏、按钮）。Markdown 内容渲染区由 **主题包** 控制，主题包可以引入任意颜色（Newsprint 的米色、GitHub 蓝等），但永远不影响 UI chrome 本身。

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
| 正文（内置默认） | Source Serif Pro / 思源宋体 | 长文本阅读友好，有"写作感" |
| 正文（Mono 风格） | Inter / 思源黑体 | 偏工具感的默认选项（可切换） |
| 代码 | JetBrains Mono | 开源、全 Ligatures、中文回退优雅 |

### 4.3 字号阶梯

| Level | Size | Line height | 用途 |
|---|---|---|---|
| Display | 32 / 40 | 1.2 | 设置页标题、空状态 |
| H1 | 26 / 36 | 1.25 | 正文 H1 |
| H2 | 22 / 32 | 1.3 | 正文 H2 |
| H3 | 18 / 28 | 1.35 | 正文 H3 |
| Body | 16 / 26 | 1.6 | 正文段落 |
| UI | 14 / 20 | 1.4 | 菜单、按钮、标签 |
| Caption | 12 / 18 | 1.4 | 状态栏、次要文字 |

---

## 5. 间距、圆角与阴影

### 5.1 间距（4 的倍数）

`4 / 8 / 12 / 16 / 24 / 32 / 48 / 64`

### 5.2 圆角

| Token | 值 | 用途 |
|---|---|---|
| `--radius-sm` | 4 | 按钮、输入框、标签 |
| `--radius-md` | 8 | 卡片、对话框 |
| `--radius-lg` | 12 | 大面板、 modal |
| `--radius-full` | 9999 | 胶囊按钮、头像 |

### 5.3 阴影（极度克制）

- **Level 0**：无阴影。大部分 UI 不应有阴影。
- **Level 1**：`0 1px 2px rgba(0,0,0,0.06)` —— 悬浮下拉、toast
- **Level 2**：`0 8px 24px rgba(0,0,0,0.08)` —— modal、command palette

绝不使用 Level 3+。

---

## 6. 布局规范（主窗口）

```
┌────────────────────────────────────────────────────────┐
│  TitleBar (draggable, 32px)              [- □ X]       │
├────┬───────────────────────────────────────────────────┤
│    │                                                   │
│ F  │                                                   │
│ i  │                                                   │
│ l  │                 Editor Canvas                     │
│ e  │              (max-width 820px,                    │
│    │              centered, reading optimized)         │
│ T  │                                                   │
│ r  │                                                   │
│ e  │                                                   │
│ e  │                                                   │
│    │                                                   │
├────┴───────────────────────────────────────────────────┤
│  StatusBar (24px · words · cursor · mode · sync)       │
└────────────────────────────────────────────────────────┘
```

- **TitleBar**：32 px，可拖拽，集成菜单入口（`≡`）
- **Sidebar (File Tree)**：默认 240 px，可拖拽调整，可隐藏
- **Outline**：从右侧滑出，默认 220 px，可隐藏
- **Editor Canvas**：内容区 max-width 820 px，左右自动居中
- **StatusBar**：24 px，极简显示字数/光标/模式，hover 才展开详情

---

## 7. 图标系统（应用内图标）

- **图标库**：[Lucide Icons](https://lucide.dev)（MIT，1500+ 图标，与极简调性匹配）
- **统一尺寸**：16 / 20 / 24，笔画 1.5–2 px
- **颜色**：继承文本色（`currentColor`）
- **禁止**：自定义特殊图标时保持 stroke 风格，不混搭填充风格
- **禁止使用 emoji 图标** 代替 UI 图标

---

## 8. 交互细则

### 8.1 动效

| 场景 | 时长 | 缓动 |
|---|---|---|
| hover 状态变化 | 120 ms | `ease-out` |
| 面板滑入/滑出 | 200 ms | `cubic-bezier(0.2, 0, 0, 1)` |
| modal 出现 | 180 ms | `ease-out` |
| 主题切换 | 300 ms | `ease-in-out`（颜色 fade） |

### 8.2 焦点

- 所有可聚焦元素都有 **2 px 黑色 focus ring**（暗色下白色）
- 不使用渐变、无发光效果

### 8.3 快捷键（Typora 对齐）

| 操作 | 快捷键 |
|---|---|
| 新建 | `Ctrl+N` |
| 打开 | `Ctrl+O` |
| 保存 | `Ctrl+S` |
| 查找 | `Ctrl+F` |
| 切换源码 | `Ctrl+/` |
| 命令面板 | `Ctrl+Shift+P` |
| H1–H6 | `Ctrl+1` – `Ctrl+6` |
| 粗体 / 斜体 / 下划线 | `Ctrl+B` / `Ctrl+I` / `Ctrl+U` |
| 代码 / 链接 | `Ctrl+K` |
| 插入表格 | `Ctrl+T` |

---

## 9. 写作样式（Markdown 默认主题：Typola Light）

- 正文字号 16，行距 1.7
- 段落间距 0.8em
- H1 居中（首屏标题感），H2–H6 左对齐
- 代码块：浅灰底 `#F7F7F7`，Shiki `github-light` 主题
- 引用块：左侧 3 px 黑竖线，正文浅灰色
- 表格：细线、交替底色、hover 行高亮
- 分割线：上下留白 2em，纯细横线
- 链接：仅下划线 + 继承色（无蓝色）

**Typola Dark** 镜像上述规则，代码块使用 Shiki `github-dark`。

---

## 10. 命名与资产组织

```
Typola/assets/
├── typola-icon.svg          # 亮色主图 (1024)
├── typola-icon-dark.svg     # 暗色版
├── typola-icon-mono.svg     # 纯符号 (currentColor)
├── typola-icon-small.svg    # 16–32 px 简化版 (单 W)
└── typola-icon.ico          # (后期) Windows 分发包用
```

所有版本以 SVG 作为 single source of truth，打包时由脚本栅格化为 PNG/ICO。

---

## 11. 版本

- v1.0 · 2026-04-17 · 首稿，随 Typola v1 主版本一起发布
- 后续变更记录于 `CHANGELOG.md`
