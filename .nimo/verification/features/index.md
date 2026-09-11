# Typola 核心用户面 Feature Map

本索引是 Typola 验证事实源，覆盖从安装启动、文档写作、结构化 Markdown、预览交付到 AI 协作的 15 个核心用户面，并把它们拆成 27 个可逐项验收的直接 exe 场景。每个条目都把用户入口、稳定句柄、实际动作、可观察终态、证据和清理边界写在一起；状态以最近一次直接 exe 套件为准。

## 基线前置条件

- 在仓库根目录安装依赖，存在 `node_modules`、Rust stable、Tauri CLI 和 Microsoft Edge WebView2 Runtime。
- 先构建验证二进制：`& '.\node_modules\.bin\tauri.cmd' build --debug --no-bundle --config '.nimo/verification/tauri-verification.conf.json'`。
- 验证 exe 为 `src-tauri\target\debug\typola.exe`；每次运行由 `verify:exe-core` 生成独立的 WebView2 profile、动态 CDP 端口和一次性夹具。
- 不驱动已存在的正式 `Typola.exe`。项目启用单实例，验证配置使用独立标识，避免与正式实例冲突。
- 核心本地配方使用本次运行创建的内存文档和夹具，不需要账号、AI CLI、外部账号或生产数据；需要原生对话框、外部 CLI 或发布物的条目必须声明其缺口。

## 驱动约定

- 首选 `npm run verify:exe-core`，它直接启动 exe 并通过该 exe 的 WebView2 CDP 操作页面；`npm run verify:exe-editor` 是旧的单一编辑器往返聚焦脚本。`npm run dev`、`npm run test:e2e` 或 `page.goto('/')` 不能作为桌面 exe 通过证据。
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
| `startup-distribution` | 启动、分发与 WebView2 预检 | 安装包、portable、`设置 → 关于` | **部分验证** | 直接 exe 身份和关于页已执行；安装包、portable 和缺失 WebView2 分支未执行 |
| `document-workspace` | 新建、打开、保存、工作区和多标签 | `新建文档`、`打开文件`、`打开文件夹`、`保存当前文件` | **部分验证** | 文件关联打开、磁盘保存、新建标签已执行；文件夹选择器和多文件切换未执行 |
| `editor-source-roundtrip` | 写作视图与源码模式往返 | `源码模式`、`渲染模式`、编辑器 | **已验证** | [直接 exe 套件证据目录](../evidence/)中的最新 `*-exe-core-suite` 编辑器往返动作和截图 |
| `editor-format-history` | Markdown 格式按钮与撤销 | `加粗`、代码块、列表、`Ctrl/Cmd+Z` | **部分验证** | 加粗和一次撤销已执行；其他格式和格式刷未执行 |
| `find-navigation` | 查找替换、快速打开、跳转到行和大纲 | `Ctrl/Cmd+F/H/P/G`、`查看大纲` | **部分验证** | 四个入口已执行；命中定位、键盘深度导航和折叠层级未完整执行 |
| `table-editing` | 表格网格、行列操作和键盘导航 | `插入表格`、单元格右键、`Tab` | **部分验证** | 插入及源码/网格确认已执行；行列菜单和 Tab 追加行未执行 |
| `image-assets` | 图片插入、资产复制和失败回退 | `插入图片`、拖拽/粘贴、`设置 → 图像` | **部分验证** | 缺失图片语法和失败占位已执行；原生选择、资产写盘和上传未执行 |
| `rich-markdown` | 公式、Mermaid、代码块和富文本粘贴 | 公式/代码按钮、源码 fenced code | **部分验证** | 公式与 Mermaid 渲染/源码保留已执行；普通代码复制和富文本粘贴未执行 |
| `markdown-preview-export` | Word/HTML 预览与 PDF/Word/HTML 交付 | `Word 预览`、`HTML 预览`、`导出` | **部分验证** | Word/HTML 预览已执行；原生导出文件未执行 |
| `settings-appearance` | 外观、编辑器、预览和导出预设 | `设置`、外观主题卡片 | **部分验证** | 主题切换已执行；字体、持久化和预设未执行 |
| `terminal` | 真实 PTY、多标签和离线边界 | `终端`、终端快捷键 | **部分验证** | 真实 PTY 创建、输入和输出回读已执行；多标签和离线依赖仍需补测 |
| `ai-workbench-skillhub` | Provider、Composer、SkillHub 和 AI 请求 | `打开 AI 工作台`、`设置 → AI 执行` | **受阻** | 工作台入口已执行；Provider、SkillHub 和模型请求需要外部 CLI 认证 |
| `artifact-center` | AI 产物扫描、预览、对比和生命周期 | `AI 产物`、产物卡片 | **部分验证** | 空产物中心入口已执行；真实产物生命周期需要 AI 会话 |
| `review-diff` | 人工意见、AI 检视、Diff 和应用历史 | `检视模式`、选区浮条、`AI 改稿` | **部分验证** | 检视面板入口已执行；意见、AI、Diff 应用需要已保存文档和 AI 会话 |
| `failure-boundaries` | 取消、权限、失败、超时和清理 | 取消/重试/错误状态、退出验证 | **部分验证** | 统一 exe 清理已执行；取消、权限和失败注入矩阵未执行 |

## 直接 exe 场景矩阵

下面的场景是“完整覆盖”的目标清单，不把当前未执行项伪装成通过；状态用于指导每次需求变更后的增量验证。

| 场景 ID | 用户操作链 | 可观察终态 | 当前状态 | 归属 Feature |
| --- | --- | --- | --- | --- |
| `exe-startup-01` | 冷启动验证 exe，进入 `设置 → 关于` | `tauri.localhost`、`data-runtime=tauri`、产品名和版本可见 | **已覆盖** | `startup-distribution` |
| `exe-startup-02` | 安装 NSIS/MSI，使用文件关联启动 | 安装目录、快捷方式/关联和打开文件结果正确 | **未覆盖** | `startup-distribution` |
| `exe-startup-03` | 解压 portable zip，直接启动 `Typola.exe` | 便携标记生效、数据不写入安装目录之外的用户路径 | **未覆盖** | `startup-distribution` |
| `exe-startup-04` | 在缺失 WebView2 的环境启动 | 预检提示、随包 bootstrapper 或官方引导可见 | **未覆盖** | `startup-distribution` |
| `exe-doc-01` | 用文件关联参数打开一次性 Markdown 夹具 | 标签、路径、正文和 source 一致 | **已覆盖** | `document-workspace` |
| `exe-doc-02` | 新建、修改、保存、另存为、重命名 | 实际文件字节、路径、保存状态和标签一致 | **部分覆盖** | `document-workspace` |
| `exe-doc-03` | 打开文件夹，从文件树打开多个文件并切换 | 文件树、标签内容和各自脏状态正确 | **受阻** | `document-workspace` |
| `exe-doc-04` | 退出后重新打开，恢复最近文件；触发未保存关闭确认 | 恢复、保存/放弃/取消分支不丢内容 | **未覆盖** | `document-workspace` |
| `exe-edit-01` | 切换阅读、写作、源码、心流、检视模式 | 模式可见状态变化，Markdown source 不被改写 | **部分覆盖** | `editor-source-roundtrip` / `review-diff` |
| `exe-edit-02` | 输入、格式化、撤销/重做，覆盖 IME 和选区拖动 | source、光标、选区和撤销历史正确 | **部分覆盖** | `editor-format-history` |
| `exe-nav-01` | 查找、替换当前命中和全部命中 | 匹配数、source 和关闭状态正确 | **已覆盖** | `find-navigation` |
| `exe-nav-02` | 快速打开并实际选择一个最近文件 | 目标文件进入活动标签，正文和路径正确 | **部分覆盖** | `find-navigation` |
| `exe-nav-03` | 跳转到行列，点击大纲标题并折叠层级 | 光标/选区/滚动落到目标，折叠状态正确 | **部分覆盖** | `find-navigation` |
| `exe-table-01` | 插入表格，编辑单元格，在网格和 source 间往返 | 网格可见，表头/分隔线/数据行可回读 | **部分覆盖** | `table-editing` |
| `exe-table-02` | 右键行列操作、Tab/Enter、复制粘贴和撤销 | 行列结构、对齐、剪贴板和 source 正确 | **未覆盖** | `table-editing` |
| `exe-image-01` | 选择、拖拽、粘贴图片并复制到 `assets/` | 实际资源文件、相对路径、预览和重新打开均正确 | **受阻** | `image-assets` |
| `exe-rich-01` | 编辑公式、Mermaid、普通代码块并粘贴富文本 | widget/错误态可读，原始语法和粘贴结果可回读 | **部分覆盖** | `rich-markdown` |
| `exe-preview-01` | 打开 Word/HTML 预览并切换预设 | 页数、文章区域、预设和正文变化同步 | **部分覆盖** | `markdown-preview-export` |
| `exe-export-01` | 导出 PDF、Word、HTML，选择保存位置 | 实际文件存在、大小大于零、类型可读取 | **受阻** | `markdown-preview-export` |
| `exe-settings-01` | 修改主题、字体、行距、缩放、自动保存和预设 | 重开设置后值持久化，source 和文件字节不变 | **部分覆盖** | `settings-appearance` |
| `exe-terminal-01` | 创建多个 PTY，切换/关闭标签并执行命令 | 各 shell 输出、关闭状态和离线本地能力正确 | **部分覆盖** | `terminal` |
| `exe-ai-01` | 检测 Provider，选工作目录，附加文档并发送/停止请求 | 可见消息、上下文、退出状态和取消结果正确 | **受阻** | `ai-workbench-skillhub` |
| `exe-ai-02` | 扫描 SkillHub，选择场景/能力并预填 Composer | Provider 过滤、场景参数和实际调用正确 | **受阻** | `ai-workbench-skillhub` |
| `exe-artifact-01` | 生成产物，扫描、预览、打开、对比、覆盖、撤销和归档 | `.typola-output` 实际文件与生命周期正确 | **受阻** | `artifact-center` |
| `exe-review-01` | 选择正文，添加/编辑/忽略/定位人工意见，运行 AI 检视 | 意见锚点、来源、行号、筛选和导出正确 | **受阻** | `review-diff` |
| `exe-review-02` | 生成候选稿，逐处采纳/拒绝，应用或恢复历史 | 应用前源文档不变，应用后 source/磁盘/历史一致 | **受阻** | `review-diff` |
| `exe-failure-01` | 取消对话框、触发权限/资源/导出/AI 失败并结束运行 | 错误可读、无越权副作用、实例和夹具清理 | **部分覆盖** | `failure-boundaries` |

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

维护信息：最近核对日期为 2026-09-11；本索引与同级 15 个条目、27 个直接 exe 场景均已从当前源码入口核对。直接 exe 套件证据保存在 [`evidence/`](../evidence/) 下按运行生成的 `*-exe-core-suite` 目录，最近一次状态为 `passed_with_gaps`，进程、profile、runtime 夹具和 CDP 均已清理。
