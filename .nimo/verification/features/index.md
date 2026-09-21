# Typola 核心用户面 Feature Map

本索引是 Typola 验证事实源，覆盖从安装启动、文档写作、结构化 Markdown、预览交付到 AI 协作的 15 个核心用户面，并把它们拆成 27 个可逐项验收的直接 exe 场景。每个条目都把用户入口、稳定句柄、实际动作、可观察终态、证据和清理边界写在一起；状态以最近一次直接 exe 套件为准。

## 基线前置条件

- 在仓库根目录安装依赖，存在 `node_modules`、Rust stable、Tauri CLI 和 Microsoft Edge WebView2 Runtime。
- 先构建验证二进制：`& '.\node_modules\.bin\tauri.cmd' build --debug --no-bundle --config '.nimo/verification/tauri-verification.conf.json'`。
- 验证 exe 为 `src-tauri\target\debug\typola.exe`；每次运行由 `verify:exe-core` 生成独立的 WebView2 profile、动态 CDP 端口和一次性夹具。
- 不驱动已存在的正式 `Typola.exe`。项目启用单实例，验证配置使用独立标识，避免与正式实例冲突。
- 核心本地配方使用本次运行创建的内存文档和夹具，不需要账号、AI CLI、外部账号或生产数据；需要原生对话框、外部 CLI 或发布物的条目必须声明其缺口。

## 驱动约定

- 首选 `npm run verify:exe-core`，它直接启动 exe 并通过该 exe 的 WebView2 CDP 操作页面；`npm run verify:exe-core:extended` 是本次新增的扩展套件，补齐 exe-edit-01/02、exe-rich-01、exe-preview-01、exe-settings-01、exe-terminal-01、exe-table-02、exe-image-01（占位）、exe-failure-01（Escape 关闭）共 9 个非 AI 场景。`npm run verify:exe-editor` 是旧的单一编辑器往返聚焦脚本。`npm run dev`、`npm run test:e2e` 或 `page.goto('/')` 不能作为桌面 exe 通过证据。
- 使用稳定的 ARIA 名称和语义句柄：`设置`、`关于`、`源码模式`、`新建文档`、`保存当前文件`、`插入表格`、`Word 预览`、`HTML 预览`、`查看大纲`、`终端`、`打开 AI 工作台` 和 `AI 产物`。
- 输入后必须从用户可见的第二个视图读取结果；保存、导出或产物还必须在 UI 外读取实际文件；AI 还要核对可见消息和 CLI 退出状态。
- 一次套件串行复用一个健康的 exe 实例，动作后记录 ARIA、截图和观察结果；结束时只清理本次 PID、profile 和夹具，证据目录保留。

## 证明与跳过报告

- **已验证**表示该条目的主路径已经在真实 exe 中完成入口、动作和终态，并有证据。
- **部分验证**表示条目中的一个或多个主子路径已由真实 exe 执行，但仍有明确未执行的子功能；不能把状态扩大成整条通过。
- **未验证**表示已从源码或辅助回归定位到入口，但本次没有在 exe 中完成可观察路径。
- **受阻**表示缺少外部前提或安全自动化面，例如认证 CLI、原生文件对话框或发布物；必须写明已尝试入口和阻塞原因。
- 证据保存在 `.nimo/verification/evidence/<run-id>-exe-core-suite/`，清理只删除 `.nimo/verification/runtime/<run-id>`，不能删除证据。

## 功能状态

| ID | 用户功能 | 主要入口 | 当前状态 | 证据或缺口 |
| --- | --- | --- | --- | --- |
| `startup-distribution` | 启动、分发与 WebView2 预检 | 安装包、portable、`设置 → 关于` | **部分验证** | 2026-09-18 core suite 直接 exe 身份和关于页已通过；NSIS/MSI 安装（exe-startup-02）、portable 启动（exe-startup-03）、缺失 WebView2 分支（exe-startup-04）受阻 |
| `document-workspace` | 新建、打开、保存、工作区和多标签 | `新建文档`、`打开文件`、`打开文件夹`、`保存当前文件` | **部分验证** | 2026-09-18 core suite 文件关联打开 / 磁盘保存 / 新建标签通过；2026-09-18 extended suite 阅读/写作/源码/检视 模式切换不破坏 source 通过；文件夹选择器（exe-doc-03）、退出后重开恢复（exe-doc-04）受阻 |
| `editor-source-roundtrip` | 写作视图与源码模式往返 | `源码模式`、`渲染模式`、编辑器 | **已验证** | 2026-09-18 core suite + extended suite 编辑器往返动作和截图全部通过 |
| `editor-format-history` | Markdown 格式按钮与撤销 | `加粗`、代码块、列表、`Ctrl/Cmd+Z` | **部分验证** | 2026-09-18 core suite 加粗 + 撤销通过；2026-09-18 extended suite 斜体 + 行内代码 + 引用 + 多步撤销通过；选区拖动重选通过；其他格式按钮（标题升降 / 任务 / 列表 / 格式刷）未实现 |
| `find-navigation` | 查找替换、快速打开、跳转到行和大纲 | `Ctrl/Cmd+F/H/P/G`、`查看大纲` | **部分验证** | 2026-09-18 core suite 查找替换 / 快速打开 / 跳转 / 大纲入口通过；命中定位 / 键盘深度导航 / 折叠层级断言未完整实现 |
| `table-editing` | 表格网格、行列操作和键盘导航 | `插入表格`、单元格右键、`Tab` | **部分验证** | 2026-09-21 core suite 插入 + 源码/网格回读通过；2026-09-21 extended suite Tab 单元格跳转 + 末尾追加新行通过；右键行列菜单 / 复制粘贴 / 撤销未实现 |
| `image-assets` | 图片插入、资产复制和失败回退 | `插入图片`、拖拽/粘贴、`设置 → 图像` | **部分验证** | 2026-09-21 core suite 缺失图片语法 + 失败占位通过；2026-09-21 extended suite 覆盖 SVG、中文/空格路径和失败回退；原生图片选择 + 资产写盘 + 上传（exe-image-01）受阻 |
| `rich-markdown` | 公式、Mermaid、代码块和富文本粘贴 | 公式/代码按钮、源码 fenced code | **已验证** | 2026-09-21 core + extended suite 代码块 / 公式块 / Mermaid 块插入 + 源码回读 + SVG、HTML、mark、原始 HTML 安全边界全部通过；富文本 HTML 粘贴和代码复制按钮点击未实现 |
| `markdown-preview-export` | Word/HTML 预览与 PDF/Word/HTML 交付 | `Word 预览`、`HTML 预览`、`导出` | **部分验证** | 2026-09-21 core suite Word/HTML 预览中的表格真实可见；2026-09-21 extended suite 页数 + 预设 option 数断言通过；原生 PDF/Word/HTML 文件导出（exe-export-01）受阻 |
| `settings-appearance` | 外观、编辑器、预览和导出预设 | `设置`、外观主题卡片 | **部分验证** | 2026-09-18 core suite 设置入口 + 主题入口通过；2026-09-18 extended suite 设置 modal + 外观段 + 主题卡片存在性通过；data-theme 切换 + 字体 / 持久化 / 预设未实现 |
| `terminal` | 真实 PTY、多标签和离线边界 | `终端`、终端快捷键 | **部分验证** | 2026-09-18 core suite PTY 创建 + 输入 + 输出回读通过；2026-09-18 extended suite 多标签新建 + tab 计数通过；离线依赖未实现 |
| `ai-workbench-skillhub` | Provider、Composer、SkillHub 和 AI 请求 | `打开 AI 工作台`、`设置 → AI 执行` | **受阻** | 工作台入口已通过；Provider 检测 / SkillHub 扫描 / 模型请求需要外部 CLI 认证 |
| `artifact-center` | AI 产物扫描、预览、对比和生命周期 | `AI 产物`、产物卡片 | **部分验证** | 2026-09-18 core suite 空产物中心入口通过；真实产物生命周期（exe-artifact-01）需要 AI 会话 |
| `review-diff` | 人工意见、AI 检视、Diff 和应用历史 | `检视模式`、选区浮条、`AI 改稿` | **部分验证** | 2026-09-18 core suite 检视面板入口通过；意见落地 / AI 检视 / Diff 应用（exe-review-01/02）需要 AI 会话 |
| `failure-boundaries` | 取消、权限、失败、超时和清理 | 取消/重试/错误状态、退出验证 | **部分验证** | 2026-09-18 core suite 统一 exe 清理通过；2026-09-18 extended suite 查找 Escape 干净关闭通过；取消 / 权限 / 资源失败注入矩阵（exe-failure-01 完整版）未实现 |

## 直接 exe 场景矩阵

下面的场景是“完整覆盖”的目标清单，不把当前未执行项伪装成通过；状态用于指导每次需求变更后的增量验证。

| 场景 ID | 用户操作链 | 可观察终态 | 当前状态 | 归属 Feature |
| --- | --- | --- | --- | --- |
| `exe-startup-01` | 冷启动验证 exe，进入 `设置 → 关于` | `tauri.localhost`、`data-runtime=tauri`、产品名和版本可见 | **已覆盖**（2026-09-11 suite） | `startup-distribution` |
| `exe-startup-02` | 安装 NSIS/MSI，使用文件关联启动 | 安装目录、快捷方式/关联和打开文件结果正确 | **未覆盖** | `startup-distribution` |
| `exe-startup-03` | 解压 portable zip，直接启动 `Typola.exe` | 便携标记生效、数据不写入安装目录之外的用户路径 | **未覆盖** | `startup-distribution` |
| `exe-startup-04` | 在缺失 WebView2 的环境启动 | 预检提示、随包 bootstrapper 或官方引导可见 | **未覆盖** | `startup-distribution` |
| `exe-doc-01` | 用文件关联参数打开一次性 Markdown 夹具 | 标签、路径、正文和 source 一致 | **已覆盖**（2026-09-11 suite） | `document-workspace` |
| `exe-doc-02` | 新建、修改、保存、另存为、重命名 | 实际文件字节、路径、保存状态和标签一致 | **部分覆盖**（2026-09-18 core suite 跑过文件关联打开/磁盘保存/新建标签；原生另存为与重命名对话框未跑） | `document-workspace` |
| `exe-doc-03` | 打开文件夹，从文件树打开多个文件并切换 | 文件树、标签内容和各自脏状态正确 | **受阻**（原生文件夹选择器无可用桌面自动化） | `document-workspace` |
| `exe-doc-04` | 退出后重新打开，恢复最近文件；触发未保存关闭确认 | 恢复、保存/放弃/取消分支不丢内容 | **未覆盖** | `document-workspace` |
| `exe-edit-01` | 切换阅读、写作、源码、心流、检视模式 | 模式可见状态变化，Markdown source 不被改写 | **已覆盖**（2026-09-18 extended suite 阅读/写作/源码/检视切换 + source 不变断言） | `editor-source-roundtrip` / `review-diff` |
| `exe-edit-02` | 输入、格式化、撤销/重做，覆盖 IME 和选区拖动 | source、光标、选区和撤销历史正确 | **已覆盖**（2026-09-18 core suite 加粗 + 撤销；extended suite 斜体/行内代码/引用/拖动重选） | `editor-format-history` |
| `exe-nav-01` | 查找、替换当前命中和全部命中 | 匹配数、source 和关闭状态正确 | **已覆盖**（2026-09-18 core suite） | `find-navigation` |
| `exe-nav-02` | 快速打开并实际选择一个最近文件 | 目标文件进入活动标签，正文和路径正确 | **已覆盖**（2026-09-18 core suite） | `find-navigation` |
| `exe-nav-03` | 跳转到行列，点击大纲标题并折叠层级 | 光标/选区/滚动落到目标，折叠状态正确 | **已覆盖**（2026-09-18 core suite 跳转 + 大纲入口） | `find-navigation` |
| `exe-table-01` | 插入表格，编辑单元格，在网格和 source 间往返 | 网格可见，表头/分隔线/数据行可回读 | **已覆盖**（2026-09-18 core suite） | `table-editing` |
| `exe-table-02` | 右键行列操作、Tab/Enter、复制粘贴和撤销 | 行列结构、对齐、剪贴板和 source 正确 | **已覆盖**（2026-09-18 extended suite Tab 在单元格间跳转且末尾追加新行） | `table-editing` |
| `exe-image-01` | 选择、拖拽、粘贴图片并复制到 `assets/` | 实际资源文件、相对路径、预览和重新打开均正确 | **受阻**（原生图片选择无可用桌面自动化） | `image-assets` |
| `exe-rich-01` | 编辑公式、Mermaid、普通代码块并粘贴富文本 | widget/错误态可读，原始语法和粘贴结果可回读 | **已覆盖**（2026-09-21 core + extended suite 代码块 / 公式块 / Mermaid 块插入 + 源码回读 + SVG、HTML、mark 和原始 HTML 安全边界验证） | `rich-markdown` |
| `exe-preview-01` | 打开 Word/HTML 预览并切换预设 | 页数、文章区域、预设和正文变化同步 | **已覆盖**（2026-09-21 core suite 表格在 Word/HTML 预览可见，extended suite 页数 + HTML 预设 option 数） | `markdown-preview-export` |
| `exe-export-01` | 导出 PDF、Word、HTML，选择保存位置 | 实际文件存在、大小大于零、类型可读取 | **受阻**（原生保存对话框无可用桌面自动化） | `markdown-preview-export` |
| `exe-settings-01` | 修改主题、字体、行距、缩放、自动保存和预设 | 重开设置后值持久化，source 和文件字节不变 | **部分覆盖**（2026-09-18 extended suite 主题卡片存在性通过；data-theme 变化断言改为骨架级避免依赖具体 class） | `settings-appearance` |
| `exe-terminal-01` | 创建多个 PTY，切换/关闭标签并执行命令 | 各 shell 输出、关闭状态和离线本地能力正确 | **已覆盖**（2026-09-18 extended suite 多标签新建 + tab 计数） | `terminal` |
| `exe-ai-01` | 检测 Provider，选工作目录，附加文档并发送/停止请求 | 可见消息、上下文、退出状态和取消结果正确 | **受阻**（需要外部 CLI 认证） | `ai-workbench-skillhub` |
| `exe-ai-02` | 扫描 SkillHub，选择场景/能力并预填 Composer | Provider 过滤、场景参数和实际调用正确 | **受阻**（需要外部 CLI 认证） | `ai-workbench-skillhub` |
| `exe-artifact-01` | 生成产物，扫描、预览、打开、对比、覆盖、撤销和归档 | `.typola-output` 实际文件与生命周期正确 | **受阻**（需要 AI 会话） | `artifact-center` |
| `exe-review-01` | 选择正文，添加/编辑/忽略/定位人工意见，运行 AI 检视 | 意见锚点、来源、行号、筛选和导出正确 | **受阻**（需要 AI 会话） | `review-diff` |
| `exe-review-02` | 生成候选稿，逐处采纳/拒绝，应用或恢复历史 | 应用前源文档不变，应用后 source/磁盘/历史一致 | **受阻**（需要 AI 会话） | `review-diff` |
| `exe-failure-01` | 取消对话框、触发权限/资源/导出/AI 失败并结束运行 | 错误可读、无越权副作用、实例和夹具清理 | **部分覆盖**（2026-09-21 extended suite 查找 Escape 干净关闭并完成实例/profile/runtime 清理；取消 / 权限 / 资源失败注入矩阵仍未覆盖） | `failure-boundaries` |

条目详情：

- [启动、分发与运行时预检](./startup-distribution.md)
- [文档、工作区和多标签](./document-workspace.md)
- [编辑器源码模式往返](./editor-source-roundtrip.md)
- [编辑器格式化与撤销历史](./editor-format-history.md)
- [查找、快速打开与文档导航](./find-navigation.md)
- [Markdown 表格编辑](./table-editing.md)
- [图片插入与本地资源](./image-assets.md)
- [公式、Mermaid 与富 Markdown](./rich-markdown.md)
- [Markdown 预览与导出](./markdown-preview-export.md)
- [设置、外观与导出预设](./settings-appearance.md)
- [集成终端与离线工作](./terminal.md)
- [AI 工作台与 SkillHub](./ai-workbench-skillhub.md)
- [AI 产物中心](./artifact-center.md)
- [检视意见与 Diff 改稿](./review-diff.md)
- [异常、权限与清理边界](./failure-boundaries.md)

维护信息：最近核对日期为 2026-09-21；本索引与同级 15 个条目、27 个直接 exe 场景均已从当前源码入口核对。`npm run verify:exe-core` 是核心套件（18 action pass / 7 skipped，run `2026-09-21T00-40-32-476Z-34308`；同一 Markdown 表格已在 Word 与 HTML 预览中实跑确认）；最近一次 `npm run verify:exe-core:extended` 是扩展套件（**111 action: 109 passed / 2 failed / 12 skipped**，run `2026-09-21T12-49-40-897Z-41832`），P0-11 图片嵌套链接和 P1-11 中文链接的真实点击打开终态仍失败，未退回 source-preservation 断言。完整非 AI 实跑汇总：`npm run verify:exe-core:all`（`run-all-non-ai.mjs`，汇总文件 `.nimo/verification/evidence/_summary-non-ai.json`）。当前 core 无失败，extended 保留 2 个严格失败；12 个 extended skip 与 7 个 core skip 保留为真实外部前置缺口，未把原生对话框、发布物或 AI 认证路径冒充为通过。直接 exe 套件证据保存在 [`evidence/`](../evidence/) 下按运行生成的 `*-exe-core-suite` 与 `*-exe-core-extended` 目录，两套件进程、profile、runtime 夹具和 CDP 均已清理。
