# 启动、分发与运行时预检

用户从安装版或 portable 包启动 Typola；应用在创建窗口前确认 WebView2，启动后显示真实产品身份，并按分发类型处理更新。

## 子功能

- `installer-startup` 从 Windows 安装包启动并完成文件关联。
- `portable-startup` 从 portable zip 解压目录直接运行并识别便携标记。
- `webview2-preflight` 缺少 WebView2 时给出引导或运行随包 bootstrapper。
- `update-entry` 在关于页查看版本、检查更新并按安装版/portable 规则继续。

## 用户视角入口

- `Typola_*_x64-setup.exe`、`.msi` 和 `Typola_*_windows-x64_portable.zip`。
- 直接打开 `Typola.exe`，或双击已关联的 Markdown 文件。
- `设置 → 关于` 的产品版本、检查更新和更新卡片。

## 用 exe-CDP harness 驱动

- 发布验收必须使用实际安装包或 portable 解压产物；不能把 debug 内部 exe 当作分发物通过。
- 本地快速路径可运行 `npm run verify:exe-core`，确认子进程是 `src-tauri/target/debug/typola.exe`，页面地址为 `http://tauri.localhost/`、`data-runtime=tauri`，再从 `设置 → 关于` 读取 `Typola` 和版本。
- 完整分发配方需要记录包哈希、安装/解压目录、文件关联打开结果、WebView2 缺失预检和更新目标；当前运行未执行安装包、portable 包或缺失运行时模拟。

## 陷阱

- `src-tauri/target/debug/typola.exe` 只代表当前源码的验证构建，不是可单独分发的官方 Windows 产物。
- 不按进程名清理正式 Typola；验证实例必须使用独立标识、独立 profile 和脚本持有的 PID。
- WebView2 预检发生在 Tauri 窗口创建前，只有看到应用窗口不能证明缺失运行时分支。
- 安装包更新和 portable 更新不是同一条路径；不能用其中一条代替另一条。

维护信息：相关入口在 `src-tauri/src/main.rs`、`src-tauri/tauri.conf.json`、`src-tauri/windows/main.wxs`、`scripts/build-portable.mjs` 和 `src/components/settings/AboutSection.tsx`；最近核对日期为 2026-09-11，直接 exe 身份已执行，发布物和预检分支未执行。
