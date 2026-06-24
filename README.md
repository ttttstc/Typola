# Typola

> 中文 · [English](./README.en.md)

**Typola 是为 AI 时代写作者准备的本地 Markdown 文档工作台。**

不是「AI 帮你写文档」,而是把文档作为产物,从你自己的 AI 流水线里产出来。选中文字就有 AI、产物直接落回编辑器、AI 改动可一键撤销;整个文档围绕「阅读 / 心流 / 检视」三种形态展开,左右栏跟随场景平滑切换。所有 AI 调用走你本机已装的 `claude` CLI,不要 API Key,不上传,跨平台离线优先。

## 跟其他工具的差异

| 你想做的事 | 用别的工具 | 用 Typola |
|---|---|---|
| 让 AI 改一段文字 | 切到 ChatGPT/Claude Desktop → 粘贴段落 → 输入指令 → 复制结果 → 回编辑器 → 粘贴覆盖 | 选中 → 浮条点「润色」→ 「采纳替换」,不离开编辑器 |
| 让 AI 写整篇 | 在网页 AI 长聊 → 复制粘贴成 md | 心流模式 → 选场景模板(日报 / PPT / HTML / 公众号) → AI 直接产出文件落到工作区 |
| 文档审稿 | Word 批注 → 给同事 → 等 review → 自己合并 | 检视模式 → 选段加意见 → 「导出 review 版」给协作者,或「发 AI 改」让 AI 按所有意见改 |
| 给 AI 一段你的写作风格 | 每次粘贴 system prompt | 用你 `~/.claude/skills/` 下的 skill,场景卡直接调,Claude Code 用户零成本嫁接 |

## AI 协作能力

### 文档三态:阅读 / 心流 / 检视

工具栏右上的凹槽分段切换器一键切换,左右栏跟随平滑收放:

- **阅读模式**:默认形态。专注阅读和写作,文件树、Word/微信预览按需开关。
- **心流模式**:左栏 AI 工作台对话,右栏技能场景模板(日报、总结报告、PPT、HTML、公众号、数据分析),窗口自动最大化。AI 产物(HTML / Markdown / 演示稿)自动落到 `<工作区>/.typola-output/<会话>/`,以 chip 形态在右栏出现,可一键在主编辑器打开、归档到工作区或删除。
- **检视模式**:文档当作待审稿,右栏挂「检视意见」面板。选段 → 加意见 → 汇总跳转;一键导出 review.md(每段后注入 `> **检视意见，请处理**：...`)给协作者;或「发 AI 改」把全文 + 全部意见拼 prompt 让 AI 产出修订稿。

### 选区浮条:选中即用,原地闭环

选中正文时浮条自动出现在选区上方:

- **润色 / 缩写 / 扩写 / 校对 / 解释术语**:静默调用 Claude,结果以「原文 vs 新版本」对比卡贴在选区旁,点「采纳替换」直接落回文档,**不离开编辑器**。润色支持调用前先输入要求(如「更口语」「更精简」),其他动作走默认模板。
- **自定义**:把选区作为引用拼到 AI 工作台对话框,自由提需求。
- **加检视意见**:开浮卡输入意见后写入右栏检视面板。

浮条可在「设置 → 编辑器 → 选区浮条」关掉,右键菜单与 `Ctrl+K` 仍可触达同一组动作。

### AI 修改可撤销

任何 AI 替换执行前自动快照编辑器内容。`Ctrl+Z` 智能区分:

- 文档没动过 → 直接回退 AI 改动
- AI 改后又手改了几处 → 先撤销手改,等手改撤完再撤销 AI

栈式逐步回退,跨文件自动清空,最多保留 50 条 AI 快照,不会污染普通编辑撤销。

### Claude CLI + Skill 生态

AI 工作台直接驱动本机已装的 `claude` CLI(headless 模式),技能场景接入 `~/.claude/skills/` 下的 skill。**Typola 里不需要配 API Key**,所有调用走你自己的 CLI 环境、模型、权限和余额——已有 Claude Code 工作流的人零成本嫁接。

## Markdown 编辑与交付

- 所见即所得 Markdown 编辑(Vditor IR 模式)+ 源码模式(CodeMirror 6),按需切换
- 文件支持:`.md` / `.markdown` / `.html` / `.htm`,只读预览 `.docx`
- 多文件 tab 自动管理,左侧文件树,浮动大纲(悬浮 / 固定为侧栏 / 点击跳转)
- Word 纸张预览(A4)+ `.docx` 导出
- HTML 预览 + 富文本复制 + 完整 HTML 导出
- 编辑器与预览按比例同步滚动(rAF 节流,零额外渲染)
- 查找替换(`Cmd/Ctrl+F` / `Cmd/Ctrl+H`,大小写 / 全词 / 正则)+ 快速打开(`Cmd/Ctrl+Shift+P`)
- PDF 导出(`Cmd/Ctrl+P`，Windows WebView2)
- 编辑辅助:一键插入链接 / 图片 / Markdown 表格;粘贴图片自动保存到 `assets/` 并插入相对路径
- 文档统计(词数 / 字符数 / 段落数 / 预计阅读时间,debounce 不阻塞输入)
- 集成终端(底部多 tab,跟随当前文件目录启动)
- 本地图片解析(相对路径在编辑、预览、导出全链路一致)
- 数据安全(未保存关闭三按钮确认,外部文件变更状态栏提示)
- 桌面原生(系统文件关联、拖拽打开、单实例转发、自动更新)

## 安装方式

### Windows 安装版

从 GitHub Release 下载 `Typola_*_x64-setup.exe` 或 `Typola_*_x64_*.msi`,双击安装。适合长期使用、文件关联和自动更新。

### Windows 免安装版

下载 `Typola_*_windows-x64_portable.zip`,解压后运行里面的 `Typola.exe`。不写入 `Program Files`,适合临时测试、便携使用。

Windows 仍需要系统中可用的 Microsoft Edge WebView2 Runtime,现代 Windows 通常已经内置。


## 基本使用

- 打开文件:工具栏打开按钮,或拖拽 Markdown / HTML / Word 文件到窗口
- 切换文档形态:右上凹槽切换器(阅读 / 心流 / 检视)
- 选区 AI:选中正文 → 浮条点动作 → 采纳替换 / 进对话框 / 加意见
- 心流模式:切心流 → 左栏对话或右栏选场景模板 → AI 产物落到工作区
- 检视模式:切检视 → 选段加意见 → 右栏汇总 → 导出 review.md 或发 AI 改
- 撤销 AI:`Ctrl+Z`(智能区分手改 / AI 改)
- 设置偏好:主题 / 字体 / 编码 / 自动保存 / 选区浮条开关 / 导出预设

常用快捷键:

- `Cmd/Ctrl + O`:打开文件
- `Cmd/Ctrl + S`:保存
- `Cmd/Ctrl + Shift + S`:另存为
- `Cmd/Ctrl + F` / `H`:查找 / 替换
- `Cmd/Ctrl + P`:导出 PDF
- `Cmd/Ctrl + Shift + P`:快速打开
- `Cmd/Ctrl + Shift + I`:编辑辅助
- `Cmd/Ctrl + Alt + S` / `P` / `M`:切换源码 / Word 预览 / HTML 预览
- `Cmd/Ctrl + K`:对选区唤起 AI 动作菜单
- `Cmd/Ctrl + Z`:撤销(含 AI 修改撤销)
- `Shift + A`:切换心流模式
- `Cmd/Ctrl + ,`:打开设置

## 开发与构建

依赖:Node.js + npm、Rust stable、Tauri 平台依赖(Windows / macOS)

```bash
npm install
npm run tauri dev        # 桌面开发模式
npm run dev              # 前端开发模式
npm test                 # 单测
npm run typecheck        # TypeScript 检查
cargo test --manifest-path src-tauri/Cargo.toml
```

## 打包

```bash
npm run tauri:build:local      # 本地安装版(msi + nsis)
npm run tauri:build:portable   # 本地免安装版(portable zip)
npm run tauri:build:update     # 带自动更新签名的发布版本
```

产物:

- Windows 安装版:`src-tauri/target/release/bundle/{msi,nsis}/*`
- Windows 免安装:`src-tauri/target/release/bundle/portable/*_windows-x64_portable.zip`
- macOS:CI 产出 `.dmg` 和 `*_macos-{arm64,x64}_portable.zip`

## 技术栈

Tauri v2 · React 19 · TypeScript · Vite 8 · Vditor · CodeMirror 6 · xterm.js · portable-pty · Claude CLI(headless)

## 许可证

Apache License 2.0
