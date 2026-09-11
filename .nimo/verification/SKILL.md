---
name: typola-verification
description: "使用真实 Typola Windows Tauri exe 和 WebView2 CDP 驱动核心用户面，保留可审计证据，并诚实报告未覆盖和受阻路径。"
---

# Typola 项目验证 Skill

本 Skill 验证当前仓库构建出的 Typola Windows Tauri 桌面应用，重点覆盖真实 `Typola.exe` 的 WebView2 用户界面。需要证明编辑器、预览、文件、AI 或交付行为时，先读本文件和 `features/index.md`；不要把 Vite 浏览器回归误报为桌面 exe 验证。Feature Map 当前按 15 个核心用户面、27 个直接 exe 场景拆分，完整套件允许在安全边界内记录“部分验证”和“受阻”。

## 启动

### 用户实际启动方式

- Windows 用户通过安装包启动 `Typola.exe`，或解压官方 portable zip 后运行 `Typola.exe`。官方支持的分发物是安装包和 portable zip。
- 本仓库的桌面开发链是 `npm run tauri dev`：Vite 开发服务被 Tauri WebView2 加载；这个入口适合开发调试，不是核心行为证据。
- 本地可重复的二进制验证链使用独立标识构建 debug exe，避开已有正式 Typola 单实例，同时仍加载当前仓库构建出的前端和 Rust 命令。

### 构建验证 exe

在仓库根目录执行：

```powershell
& '.\node_modules\.bin\tauri.cmd' build --debug --no-bundle --config '.nimo/verification/tauri-verification.conf.json'
```

构建成功的确切产物是 `src-tauri\target\debug\typola.exe`。该命令会执行仓库真实的 `npm run build`，生成或更新被 `.gitignore` 忽略的 `dist/` 与 `src-tauri\target/`；它不产生安装包。

### 由 exe harness 启动

完整套件：

```powershell
npm run verify:exe-core
```

单一编辑器聚焦配方：

```powershell
npm run verify:exe-editor
```

`verify-exe-core-suite.mjs` 直接以子进程启动 `src-tauri\target\debug\typola.exe`，不启动 Vite、不调用 `page.goto` 加载网页。它为本次运行设置：

- `WEBVIEW2_USER_DATA_FOLDER=.nimo\verification\runtime\<run-id>`：只存本次 WebView2 profile 和一次性夹具。
- `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=<动态端口>`：只开放本次实例的 CDP。
- 验证配置中的应用标识 `com.typola.reader.verification`：避免与正式 `com.typola.reader` 单实例冲突。

就绪判定必须同时满足：

1. 本次子进程仍存活，动态 CDP 地址的 `/json/version` 返回 HTTP 200。
2. CDP 找到页面，页面标题为 `Typola`，地址为 `http://tauri.localhost/`。
3. `document.documentElement.dataset.runtime` 为 `tauri`，且可见按钮 `button[aria-label="源码模式"]` 已出现。
4. 打开 `设置 → 关于` 后，可见产品名 `Typola` 和当前版本。

如果 `target\debug\typola.exe` 不存在，先执行构建命令。若需要验证正式打包 exe，必须先确认没有同标识 Typola 实例；不要通过进程名查找并强杀其他实例。

### 拆除启动实例

`verify-exe-core-suite.mjs` 和 `verify-exe-core-flow.mjs` 在成功、断言失败、CDP 连接失败三种路径都会进入清理：先断开 CDP，只对它自己记录的 exe PID 执行 Windows `taskkill /PID <pid> /T /F`，再删除自己创建的 `.nimo\verification\runtime\<run-id>`。它们不会按 `typola` 或 `node` 进程名清理，也不会删除证据目录。

手动运行 `npm run tauri dev` 时，停止它的前台命令会话即可；不要触碰本机已有的正式 Typola 进程。

## 体检

运行核心套件前，至少确认以下事实：

```powershell
Test-Path '.\src-tauri\target\debug\typola.exe'
Get-Item '.\src-tauri\target\debug\typola.exe' | Select-Object FullName,Length,LastWriteTime
Get-FileHash '.\src-tauri\target\debug\typola.exe' -Algorithm SHA256
```

脚本还记录并检查：

- exe 路径、大小、修改时间和 SHA-256；
- `package.json` 版本；
- Git `HEAD` 与由当前 diff、状态和未跟踪文件清单共同计算的 `worktreeDiffId`；
- 本次 PID、动态 CDP 端口、Edge/WebView2 版本、Tauri 页面地址和运行时标记；
- `设置 → 关于` 的产品名和版本；
- 每个用户动作、动作后的可观察结果、ARIA 快照、截图、页面错误、请求失败和控制台警告。

体检失败时停止驱动。尤其不要因为某个端口有响应就假定它是 Typola：页面必须满足 `tauri.localhost`、`data-runtime=tauri` 和稳定的 `源码模式` 句柄。

## 驱动

驱动面是 exe 自己创建的 WebView2 页面，通过 CDP 连接 Playwright；动作仍然是用户可做的点击、键盘输入和可见状态读取。禁止用 `page.evaluate` 写入 React 状态、调用测试专用端点或直接改内部 editor setter 来制造通过结果。脚本中的 `page.evaluate` 只读取运行时身份；内容由真实按钮、编辑器、面板和写作视图完成往返。

当前已固化的核心套件配方：

1. 确认页面标题、`http://tauri.localhost/` 和 `data-runtime=tauri`，再打开 `设置 → 关于` 读取 `Typola` 和版本。
2. 通过文件关联参数打开一次性 Markdown 夹具，编辑后用 `Ctrl+S` 回读磁盘，并新建未命名标签。
3. 点击 `button[aria-label="源码模式"]`，在 `.cm-content` 输入 Markdown，从写作视图回读标题和正文。
4. 通过格式按钮加粗选区并用 `Control+z` 回退；执行查找替换、快速打开、跳转到行和大纲入口。
5. 插入表格、缺失图片、公式和 Mermaid，分别从 source、网格、widget 或可读错误状态确认结果。
6. 打开 Word/HTML 预览、主题、AI 工作台、产物中心、检视面板和真实 PTY 终端；对原生对话框、外部 CLI 和模型请求记录明确跳过理由。

稳定句柄来自当前应用的无障碍名称或稳定语义类名：`设置`、`关于`、`源码模式`、`.cm-editor`、`.cm-content`、`.cm6-markdown-editor-pane`、`Word 预览`、`HTML 预览`、`插入表格`、`查看大纲`、`终端`、`打开文件树`、`打开 AI 工作台`、`AI 产物`，以及 `.find-panel`、`.quick-open-overlay`、`.goto-line-popover`、`.typola-cm6-math-block`、`.typola-cm6-mermaid`。不使用坐标、Tab 序号或动画完成时间作为证明。

`.nimo/verification/features/` 中的每个条目会给出用户入口、动作和终态；没有在 exe 中实际执行的入口必须保持“未验证”或“受阻”。仓库已有的 `e2e/` Playwright 用例可以帮助定位渲染器回归，但它们由 Vite `webServer` 启动，不能替代本 Skill 的 exe 证据。

## 证据

每次 `npm run verify:exe-core` 都在以下位置生成一个不可随实例清理删除的目录：

```text
.nimo/verification/evidence/<run-id>-exe-core-suite/
├── run.json                 版本、exe、Git、动作、结果、跳过、清理和运行时日志摘要
├── 00-*.png                 初始界面和关于页截图
├── 01-*.png … 16-*.png      各核心用户面动作后的截图
├── *.aria.txt               与每张截图对应的无障碍树快照
├── exe.stdout.log           本次 exe 标准输出
└── exe.stderr.log           本次 exe 标准错误
```

证明标准：

- `run.json.status` 必须为 `passed_with_gaps`（套件有明确跳过项）或 `passed`（无跳过项），`runtime.runtime` 必须为 `tauri`，而不是 Vite 地址；动作失败仍为 `failed`。
- `actions` 必须同时记录用户动作和紧随其后的结果；只写“最终页面看起来正确”不算证明。
- 编辑器往返必须以第二个用户可见视图读取标题和正文；不能只读输入控件或内部状态。
- 证据必须带 `packageVersion`、exe SHA-256、Git `head`、`worktreeDiffId` 和采集时间。工作树脏时不能只记录 `HEAD`。
- 保存、导出或产物必须另外核对目标文件、路径、大小和类型；AI 还要核对可见对话、CLI 退出状态和产物文件。
- 不使用外部账号、生产数据、模型凭据或网络 mock。AI 相关功能只有在用户已配置本机 CLI 且不需要把秘密写入证据时才能驱动。

本次交付的 exe 证据目录位于 `.nimo/verification/evidence/*-exe-core-suite/`。最近一次目录中的 `run.json` 必须明确记录页面为 `http://tauri.localhost/`、`runtime=tauri`，列出 15 个 Feature Map 状态、每个动作、跳过原因和清理结果；场景矩阵在 `features/index.md` 维护，旧的 `*-exe-core-editor/` 目录作为历史证据保留。

本次真实 exe 还可能观察到 CSP/IPC 控制台错误：`ipc.localhost` 被当前 `connect-src 'self'` 拦截后，Tauri 回退到 postMessage；终端关闭还可能记录 `Failed to kill terminal ... os error 0`。这些信息不阻止已通过动作，但必须原样保存在 `run.json.runtimeMessages.console`，属于需要产品侧另行处理的已知限制，不可静默成“无错误”。

## 清理

清理只允许作用于本次运行创建的资源：

- 进程：只使用脚本持有的子进程 PID，连同其子进程树停止；绝不按进程名杀。
- WebView2 状态：只删除 `.nimo/verification/runtime/<run-id>`，删除前确认它由本次脚本创建。
- CDP：先断开 Playwright，再确认动态端点不可访问；`run.json.cleanup.cdpClosed` 应为 `true`。
- 证据：永远位于 `evidence/<run-id>-exe-core-suite/` 或旧的聚焦目录，不在 runtime 目录内；实例停止、profile 删除后仍必须能读取 `run.json`、ARIA 快照和截图。
- 用户状态：本次核心套件只保存脚本创建的夹具、不保存用户文件、不调用 AI；扩展文件/导出/AI 配方时必须明确夹具所有权和恢复动作。

如果脚本中途失败，先读取失败目录的 `run.json`，确认 `processStopped` 和 `profileRemoved`，再重新运行；不要留下孤儿 exe、CDP 端口或共享 profile。

## 辅助

- `tauri-verification.conf.json`：构建时合并的独立应用标识配置，保留产品名 `Typola`，关闭安装包打包。
- `scripts/verify-exe-core-suite.mjs`：直接启动 exe，串行驱动 Feature Map 的可达核心路径，采集证据并清理；调用方式是 `npm run verify:exe-core` 或 `node .nimo/verification/scripts/verify-exe-core-suite.mjs`。
- `scripts/verify-exe-core-flow.mjs`：保留旧的单一编辑器源码往返聚焦配方；调用方式是 `npm run verify:exe-editor` 或 `node .nimo/verification/scripts/verify-exe-core-flow.mjs`。
- `features/index.md`：15 个功能条目和 27 个直接 exe 场景的索引与验证状态；每个功能文件是用户路径配方。
- 维护时参考 `nimo-verification-maintain`：代码、菜单、启动链或证据边界变化后，先更新地图，再重新执行受影响的 exe 路径。
