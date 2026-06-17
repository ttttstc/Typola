# Handoff — 心流模式 MVP 移交开发

> 这份文件是**给开发 agent（codex）的开场 prompt**。把整段标记为「开发指令」内容粘贴到 codex 会话作为第一条消息即可。

---

## 给用户的使用说明

1. 启动 codex（或 ccg coder），在新会话第一条消息粘贴下方「开发指令」整段。
2. codex 会**先做 R1/R2 spike** 并暂停等你确认（产物：`docs/changes/2026-06-14-work-package/spike-notes.md`）。
3. 你确认 spike 结论后，codex 按 spec §4–§9 顺序实施，**每完成一节单独 commit 并向你报告**，等你确认再进下一节。
4. 全部完成后跑完整验证（spec §11）+ 推 PR。

---

## 开发指令（粘贴给 codex）

```
你是 Typola 的接力开发工程师，本期任务是实施「心流模式 MVP」。

# 项目背景
Typola = Tauri 2 + React 19 + TypeScript + Vite 8 桌面 Markdown 编辑器。
工作分支 `codex/ai-doc-workbench` 已含：文件树、多 tab、未保存三按钮对话框、
WYSIWYG 代码块焦点态、右键菜单、自定义 tooltip、新建文件、编辑器→预览同步滚动、配色统一；
headless AI 工作台原型已外科式移除（commit abae51e）。
⚠️ 这些前置 + 收敛后的 spec 都在 `codex/ai-doc-workbench` 上，**main 尚未合入**。

# 必读文档（按顺序读完再开工）
1. docs/AI_WORKBENCH_SPEC.md（全文，是本期实施依据）
2. docs/changes/2026-06-14-work-package/brief.md（方向 / 范围 / 验收，快速浏览）
3. docs/changes/2026-06-14-work-package/headless-removal.md（已执行的历史，不要重做）

# 工作目录
仓库根 D:\暂存\Typola。**从 `codex/ai-doc-workbench` 起新分支**（例如 codex/flow-mode-mvp）；
不要从 main 起——收敛后的 spec 与全部前置工作都在 `codex/ai-doc-workbench`，main 没有。

# 第一步（必须，且只做这一步就暂停）
按 spec §13 做 R1/R2 spike（R3 已删——权限全在终端，App 不发按键，无需验证）：
- R1: Windows 下 `TerminalPanel.openNewTab` 起 shell → writeTerminal(termId, 'claude\r')
  → 验证 claude TUI 起来 + `aiClaudePath` 路径配置生效 + 中文宽字符显示正确。
- R2: 在 claude TUI 里 writeTerminal(termId, '\x1b[200~把 a.md 生成 HTML 演示\x1b[201~')（**末尾不加 \r**）
  → 验证 bracketed paste 把整段落为「可继续编辑的输入行」，用户随后手敲参数 + Enter 能正常提交。失败则记录 fallback。

把两条结论写到 docs/changes/2026-06-14-work-package/spike-notes.md，
包括「OK / fallback 内容 / 阻断」三档结论 + 具体观测到的现象。
然后**停下来报告给我，等我确认再继续。不要直接进入 §4–§9 实施。**

Spike 时**不需要写正式代码**，可以临时在 TerminalPanel 加几行调试调用，验证完撤销。
spike-notes.md 是唯一要提交的产物（commit 信息 `spike: 心流模式 R1/R2 验证`）。

# Spike 通过后才进入的步骤（每完成一节 commit + 报告 + 等我确认再进下一节）
按 spec 顺序：
§4 心流模式布局编排（flowMode、Toolbar 心流宏 + AI 工作流独立开关、最大化/还原快照、三块面板独立开关、flowRightTab）
§8 agent 终端（TerminalPanelHandle：startAgentTerminal/sendText/hasAgentTerminal/focus，懒启动；权限全在终端，App 不发 Shift+Tab）
§5 场景启动器（FlowScenario 类型、注册表 JSON [MVP 仅 1 张 HTML 卡]、ScenarioPanel、agentBridge 注入不回车、发送即存盘）
§6 闭环输出（6.1 自动 reload + 脏冲突三选项条 + 6.2 workspace watch + agentChangedPaths + 预览顶部产物 chips + .html sandboxed iframe 渲染）

实施顺序：§4 → §8（先把骨架 + 终端懒启动起来）→ §5（HTML 场景卡注入）→ §6（闭环输出 + 产物 chips + iframe）。
**无 §7**（选区注入已移出 MVP）。每一节自己内部能独立工作（可被验收）。

# 工程纪律（不可违反）
1. **每节实施前后必跑**：npm run typecheck && npm test && cargo check --manifest-path src-tauri/Cargo.toml。
   有红的不要继续往下做，先修。
2. **不引入回归**：阅读器模式（关闭心流后）行为必须与当前 main 完全一致；
   不影响 222 个既有 vitest 测试、9 个 cargo 测试通过。
3. **最小 diff**：复用现有 TerminalPanel/FileTreePanel/documentWatchService/agent_detect
   等基础设施（spec §2 + §3）。不重复造轮子。不预先抽象多引擎适配层。
4. **不擅自加功能**：spec §1 「非目标」全部不做（特别注意：
   不做选区注入、不做参数表单、不做 App 级权限开关/状态机、不做会话重起按钮、
   不做 git diff、不做跟随模式、不做多引擎、不做场景图形编辑器；MVP 场景卡只上 HTML 1 张）。
5. **遇到 spec 不清楚或冲突**：停下来问我，不要按猜测继续。
6. **权限全在终端（spec §8）**：App 不提供权限开关、不读 TUI 模式、不发 Shift+Tab；
   用户自己在终端按 Shift+Tab 切。单 session 长驻、不重起（spec §8.1 硬要求）。
7. **commit 信息中文**，前缀 `feat: / fix: / chore: / docs:`（参考 `git log --oneline -10`）。

# 报告格式（每节完成时给我）
- 做了什么（文件清单 + 关键决策）
- 验证：typecheck / test / cargo 各自结论（数字）
- 手动验证：在 npm run tauri dev 里观察到的行为（截图或文字描述）
- 下一节计划（确认或调整）
- 任何 spec 没覆盖但实施中冒出来的开放问题

# 全部完成后
按 spec §11 跑全套验收 + 写 PR 描述（参考 PR #53 的格式），推到 GitHub，PR 标题
`feat: 心流模式 MVP（HTML 场景卡 + 终端懒启动 + 闭环输出）`，body 引用本 spec
和 spike-notes 的链接。

# 开始
请先读完三份必读文档，然后开始做 R1/R2 spike 并把结论写到 spike-notes.md。
做完 spike 后停下来等我确认。
```

---

## 移交前自检（用户用）

发出指令前确认以下都是 ✅：

- [x] `npm run typecheck` 全绿
- [x] `npm test` 222/222
- [x] `cargo test --manifest-path src-tauri/Cargo.toml` 9/9
- [x] `git status` 干净（无未提交改动）
- [x] PR #53 已存在或已合入 main，分支 `codex/ai-doc-workbench` 为最新

如果你打算从 PR #53 当前 HEAD 直接接力（未合入 main），告诉 codex「基于 codex/ai-doc-workbench 起新分支」即可。
