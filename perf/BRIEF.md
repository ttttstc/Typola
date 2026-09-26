# Typola 性能冲刺 · 开工简报

> 方法论：闪电.skill（源自 Anthropic《How we made claude.ai 3x faster in two weeks》）
> 原则：只要能量出来，就能变快。测量是爬山的第一步。

## 核心操作（用户选定，2026-09-26）

| # | 操作 | 「能用」的判定 | 对应 Anthropic 原文 |
|---|------|--------------|-------------------|
| A | 冷启动到能打字 | 进程启动 → 窗口出现 → 编辑器挂载且可输入 | 打开 App + 静态输入框 |
| B | 大文件打开与滚动 | 100KB+ markdown 注入后渲染稳定；滚动期无长任务 | 长对话加载 |
| C | 打字流畅度 | 连续键入期间帧间隔 p95 < 16.7ms（60fps 预算）且无长任务 | 发送消息/输入框 |
| D | 切换文件与视图 | IR⇄源码视图切换、Tab 切换后内容可见 | 切换对话 |

## 测量口径

- **实验室**（本轮）：release exe + CDP + Playwright 驱动，`scripts/perf/bench-exe.mjs`，每场景 ≥10 次取样，报 p50/p75/p95
- **确定性计数**（棘轮候选）：bundle 字节数（已有 perf-budget.json 棘轮）、启动请求瀑布、长任务次数/总时长、视图切换重渲染次数
- **排除项**：网络条件（本地静态资源，tauri:// 协议加载）；CrUX 线上数据不适用（桌面应用无 CrUX）

## 不能动的东西

- Typora 一致性：视觉、快捷键、对话框行为（用户既往明确要求）
- 不引入双 Tab/子面板等新 UI 结构
- 不接 trash/回收站 API
- 删文件逻辑维持现状

## 目标

用户未给具体数字目标。建议目标（待用户确认）：四类操作 p75 几何平均降 50%，其中冷启动是主攻方向。

## 护栏与回滚

- 黄金测试：现有 `.nimo/verification` exe 套件（verify-exe-core 等）跑绿
- bundle 棘轮：`npm run perf:bundle:check` 只许降不许升
- 视觉回归：e2e 截图快照（editor-paper-bg 等）
- 回滚：git revert 单 commit；每改动一个 commit
- PR 流程止于 `gh pr create`，merge 必须用户明确说

## 已知事实（诊断阶段 2026-09-26）

### 环境事实
- 本轮用的 release exe 曾因 `cargo:rustc-cfg=dev` 错误标记而内嵌 devUrl（localhost:5173），已于 2026-09-26 重新构建
- 项目已有 bundle 预算棘轮：perf-budget.json + scripts/perf/{capture,assert,collect}-bundle-size.mjs
- 既有 exe 驱动基建：.nimo/verification/scripts/verify-exe-*.mjs（spawn exe + CDP + Playwright）

### Rust 侧诊断结论（子代理，2026-09-26）
1. 同步命令阻塞主线程：agent_detect（最长 5s wait_timeout）、scan_artifacts（递归扫盘）、read_opened_document（整文件读）均非 async fn
2. 文件内容 IPC 走 JSON number[]（每字节 3-4 字符膨胀），未用 tauri::ipc::Response 原始字节
3. 每次保存：writeTextFile 后立即 document_fingerprint 重新整读文件算 FNV hash；写路径 file.sync_all() 强制 fsync
4. 文件监听无防抖：文档 watcher 每个 modify 立即 emit；workspace watcher 跨事件无合并
5. agent-stdout 逐行 emit、terminal_data 每 8KB chunk emit，高频时 IPC 风暴
6. Cargo.toml 无 [profile.release]：无 lto/strip/codegen-units=1，exe 15.9MB 未精简
7. 启动前串行 3 次 reg query 子进程探测 WebView2（每次 60-200ms）
