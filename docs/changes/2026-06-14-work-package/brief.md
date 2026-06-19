# Brief — Typola 文档中心 AI 工作台(心流模式)

> ⚠️ **MVP 切片已于 2026-06-16 评审 mock 后细化**：触发入口从"选区甩终端"收敛为**场景卡注入（不自动回车）**，首张卡 = **HTML 生成**（非"润色闭环"）；"改动可见"= **文件高亮 + 预览顶部产物 chips**（git diff 移到 Phase 2）。**当前 MVP 范围以 [AI_WORKBENCH_SPEC.md](../../AI_WORKBENCH_SPEC.md) 为准**；本 brief 的 Direction/价值/差异化仍有效，但下方 Goals/Acceptance 是初版 Spark 记录，已被 spec 覆盖。

**日期**: 2026-06-14
**分支**: codex/ai-doc-workbench
**阶段**: Spark
**审查模式**: SELECTIVE EXPANSION
**决策**: 价值评估通过；是否进入 Design 待用户确认

---

## Summary

把 Typola(现有 Markdown 编辑/阅读器)升级为**以真实文档编辑器为中心的 AI agent 驾驶舱**。用户痛点真实(dogfood):AI 能力散落在终端 + 多窗口,文档工作流(产出/润色、html/ppt、日报、数据分析)在 Finder ↔ 终端 ↔ 预览之间反复切换,没有闭环。

核心技术决策已验证:**放弃 headless spawn(`claude -p` + JSONL 解析,即"效果很差"的老路),改用"内嵌真实交互式终端跑 `claude`"的路线(fanbox 同构方案)。** 该判断准确,且成本极低——Typola 已具备 `portable_pty`(Rust)+ `@xterm/xterm`(前端)全套终端基础设施。

## Direction

- **方向**: 心流模式 = 文件树(左) + 编辑器/预览(中) + 跑真实交互 `claude` 的内嵌终端(右/下);通过"选中甩给 agent → agent 写盘 → 编辑器/预览实时刷新 → 改动可见"形成单窗口闭环。能力(润色/html/ppt/日报/数据分析)交给终端里的 skill,**app 只做"贴合"那一层**。
- **差异化焦点**: **文档中心**(产品经理/架构师/技术写作者),区别于 fanbox(代码/finder 中心)、Cursor/VS Code(代码中心)。fanbox 明确"不跟 VS Code 拼编辑";而**编辑器恰是 Typola 的身份**,因此 Typola 能把 编辑器↔预览↔agent 的实时联动做得比 fanbox 更深。
- **灵感来源**: fanbox-windows("vibe coding 驾驶舱:左文件 × 右终端 × 中预览";node-pty + xterm.js 跑真实 agent;"看清改动"靠 git diff + 文件监听/跟随,而非解析输出)。

## Scope Summary

- 双模式:**阅读器模式**(现状,简单编辑+阅读)/ **心流模式**(工作台布局),同窗口布局切换。
- MVP 锁定单一垂直切片「**文档润色闭环**」,验证"集成闭环"这一护城河。
- 集成手法 MVP 范围 = **精简三件套**(见 Goals)。其余 fanbox 驾驶舱能力进 Phase 2+。
- 已确认放弃 headless 执行路径(详见"现有产物去留")。

## 复杂度评估

- **项目类型**: 本地 Agent 文档工作台(Tauri 桌面)
- **预期规模**: 中(站在成熟编辑器 + 终端之上扩展,非从零)
- **技术风险**: 低–中
- **主要风险点**:
  - R1(最高)Windows 下 `claude.cmd` 在 PTY 内启动(GUI PATH 不全 / `.cmd` 包装)——建议 Design 首个 spike 验证
  - R2 "改动可见"在非 git 目录的降级策略
  - R3 安全边界:终端内 claude 可直接写盘(特性),但不代为 `bypassPermissions`
  - R4 文件监听 ↔ 编辑器未保存改动的竞态

## 价值评估结论(摘要)

SELECTIVE EXPANSION，**通过**。问题正确、杠杆极高(MVP 几乎全是接线现有能力)、可逆性高(2-way door:心流模式可切换、删 headless 是增量)、风险集中且可控。
**唯一需钉死的警示:成功标准是"闭环质量/贴合度",不是功能数量。** 警惕扩张成"重造 VS Code / fanbox"。
完整评估见 [.vibeflow/plan-value-review.md](../../../.vibeflow/plan-value-review.md)。

## Roundtable 结论

未启用(用户选择跳过)。

## 现有产物去留(codex/ai-doc-workbench 分支)

"废弃 headless"= 只砍执行内核;约一半工作是驾驶舱地基,保留复用。

| 删(headless 执行路径) | 留并复用(驾驶舱地基) |
|---|---|
| `src/services/agentService.ts` 的 run/stop/session | `detectAgent` + Rust `agent_detect`(终端模式仍需定位 claude) |
| `src/components/AIWorkspacePanel.tsx`(自定义聊天 UI) | `src/components/FileTreePanel.tsx`(左侧文件树) |
| Rust `agent_run_create`/`agent_run_stop`/`agent_session_clear` + `agent_event` | `src/services/workspaceService.ts` + `list_directory_entries` |
| `AiCliSection` 内 headless 会话设置 | `src/components/settings/AiCliSection.tsx` 的 claude 路径/版本检测 |
| 旧 spec 的 `claude -p --output-format stream-json` 方案 | `src/components/TerminalPanel.tsx` + `portable_pty` → 改造成 agent 终端;`notify` 文件监听 |

## Scope And Acceptance

### Goals(MVP:文档润色闭环 · 精简三件套)
1. 心流模式布局:文件树 + 编辑器/预览 + 跑真实交互 `claude` 的内嵌终端,同窗口。
2. **选中即甩给终端**:编辑器/预览选一段 → 一键以"文件出处 + 围栏(bracketed paste)"注入 PTY,不被逐行误执行。
3. **写盘 → 文件监听 → 编辑器/预览自动刷新**:复用 `notify` watcher。
4. **改动可见**:git diff(HEAD vs 工作区);非 git 目录降级为"被 agent 改动的文件高亮"。

### Non-goals(MVP)
- html/ppt/日报/数据分析的专门 UI(同一终端跑 skill 即可,无需专门 feature)。
- headless / 结构化输出通道(已放弃)。
- 跟随模式、拖文件进终端、可点击路径、会话回放、变更收件箱、skills 透视、用量面板(Phase 2+)。
- 多引擎(codex/opencode)适配(Phase 3,等真有需求再抽象)。

### Acceptance criteria
- 心流模式下选中一段 Markdown → 一键发给终端里的 claude 要求润色 → claude 写回文件 → 编辑器/预览自动刷新显示新内容 → 在 diff/变更高亮看到改动。
- 全程单窗口闭环,不切换窗口。
- Windows 下 claude 在 PTY 内正常启动,中文宽字符显示正确。
- 旧 headless 代码移除后:`npm run typecheck`、`npm test`、`npm run build`、`cargo test --manifest-path src-tauri/Cargo.toml` 通过。

### Constraints
- 平台:Tauri 2 + React;Windows 11 为主目标。
- 复用现有 `portable_pty` + `@xterm/xterm` + `FileTreePanel` + `notify` + 编辑器/预览,最小 diff,不过早抽象。
- 不代为绕过 claude 权限(`bypassPermissions`);依赖真实交互终端的原生权限提示。
- 阅读器模式行为不回归。

### Assumptions
- 用户机器已安装 `claude` CLI(或可在设置中配置路径);检测复用 `agent_detect`。
- 用户的自定义 skill 体系在交互式 CLI 下工作 = 主要价值来源。

### Open questions(留待 Design)
- agent 终端是"改造 TerminalPanel 的 agent 变体"还是"复用 TerminalPanel + 自动起 claude + 叠加注入层"(倾向后者,最小 diff)。
- 心流模式布局的具体分栏与默认尺寸、与现有终端面板的关系(共用左槽 vs 独立)。
- "改动可见"MVP 默认形态:git diff 优先还是变更高亮优先。
- 选区注入的 prompt 包裹格式(文件出处 + 围栏)细节。
