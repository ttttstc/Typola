# 异常、权限与清理边界

用户在文件、导出、AI、终端或窗口关闭过程中遇到取消、失败、权限不足、超时或外部变更时，Typola 应显示可理解的状态，不误写文件，并在验证结束后清理自有资源。

## 子功能

- `dialog-cancel` 取消打开、保存、导出、图片选择或关闭确认后保持原状态。
- `permission-and-path` 对越权路径、不可写目录、缺失资源和无浏览器给出错误，不静默改写其他文件。
- `operation-failure` 处理保存、导出、上传、AI、Mermaid 和终端失败/超时，保留可恢复状态。
- `verification-cleanup` exe、CDP、WebView2 profile、临时夹具和产物按所有权清理，证据仍可读取。

## 用户视角入口

- 原生文件对话框的取消按钮、未保存关闭确认和冲突栏。
- 保存/导出/上传/AI/终端操作中的取消、重试、错误 toast 和停止按钮。
- `设置 → 关于` 更新失败、PDF 浏览器缺失、文件权限错误和资源加载失败提示。
- 验证运行结束后的进程、profile、runtime 目录和证据目录。

## 用 exe-CDP harness 驱动

- 每次直接 exe 运行都要记录健康检查、进程退出、CDP 关闭、profile/runtime 删除结果；最新套件已证明 `processStopped`、`profileRemoved`、`runtimeRemoved`、`cdpClosed` 均为 `true`。
- 取消和权限场景必须由真实用户动作触发，再从原文、目标文件、错误状态和进程树确认没有错误副作用；不能用异常注入代替用户取消。
- 完整矩阵需要一次性夹具、可控不可写目录、缺失浏览器/资源和可停止的外部命令；每个场景独立记录，失败证据保留，不能删除用户已有文件或进程。

## 陷阱

- “对话框出现”不等于取消语义正确；取消后必须确认原文、标签和磁盘内容没有变化。
- 失败 toast 不等于安全失败；文件、产物和临时目录必须实际回读并检查归属。
- 通过 `taskkill` 按进程名、删除整个 workspace 或复用共享 profile 都会破坏清理证明。
- CSP/IPC fallback、终端关闭警告等控制台信息必须记录，不能为了绿色结果过滤掉。

维护信息：相关入口在 `src/components/UnsavedChangesDialog.tsx`、`src/components/UpdateCard.tsx`、`src/services/exportErrors.ts`、`src/services/dialogService.ts`、`src-tauri/src/main.rs` 和直接 exe harness 清理段；最近核对日期为 2026-09-11，统一成功清理已执行，取消/权限/失败注入矩阵未执行。
