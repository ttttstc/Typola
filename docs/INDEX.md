# Typola 知识索引

> 这是 `docs/` 目录型 Knowledge Target 的正式 Index 层。冷启动 agent 从 Overview（[`docs/ARCHITECTURE.md`](./ARCHITECTURE.md)）进入后，通过本页路由到具体知识页。
>
> 本页由 `nimo-knowledge-maintain` 维护（managed-by-nimo）。修改需在 maintain 流程内。

## 角色分工（先看这个，避免混读）

| 角色 | 文档 | 谁该读 |
|---|---|---|
| **Overview** | [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md) | 想知道"项目长什么样"的所有人 |
| **Index**（本页） | `docs/INDEX.md` | 不知道文件名时按问题选下一跳 |
| **User Manual** | [`docs/USER_GUIDE.md`](./USER_GUIDE.md) | 中文写作者用户第一天上手 |
| **Design Spec** | `docs/AI_*.md` 系列 | 工程师 / Skill 作者了解设计动机与实现规约 |
| **Engineering Conventions** | [`../AGENTS.md`](../AGENTS.md) | 协作约定 / 开发命令 / 工程边界 |
| **Glossary** | [`../CONTEXT.md`](../CONTEXT.md) | 项目术语表（AI Workbench / AI Provider / Provider-bound Conversation / Artifact Return） |

## 知识页地图

### AI 工作台（设计 → 实现）

| 主题 | 入口 | 详细 |
|---|---|---|
| AI 工作台总览（已落地版本） | `docs/ARCHITECTURE.md` "AI Workbench" 段 | — |
| 历史设计快照（2026-06-16） | [`docs/AI_WORKBENCH_SPEC.md`](./AI_WORKBENCH_SPEC.md) | 顶部声明：事实以 ARCHITECTURE.md 为准，本文保留设计动机 |
| Provider 抽象 / OpenCode PRD | [`docs/AI_WORKBENCH_OPENCODE_PRD.md`](./AI_WORKBENCH_OPENCODE_PRD.md) | — |
| SkillHub / Skill OS | [`docs/AI_WORKBENCH_SKILL_OS.md`](./AI_WORKBENCH_SKILL_OS.md) |  |
| Scenario Roadmap | [`docs/AI_DOCUMENT_WORKBENCH_SCENARIO_ROADMAP.md`](./AI_DOCUMENT_WORKBENCH_SCENARIO_ROADMAP.md) | — |

### 检视 / 改稿

| 主题 | 入口 |
|---|---|
| 检视系统设计 | [`docs/AI_REVIEW_DESIGN.md`](./AI_REVIEW_DESIGN.md) |
| 检视交互规约 | [`docs/AI_REVIEW_INTERACTION_SPEC.md`](./AI_REVIEW_INTERACTION_SPEC.md) |
| AI 改稿与编辑规约 | [`docs/AI_EDIT_AND_REVIEW_SPEC.md`](./AI_EDIT_AND_REVIEW_SPEC.md) |
| Diff Preview | [`docs/AI_DIFF_PREVIEW_SPEC.md`](./AI_DIFF_PREVIEW_SPEC.md) |
| Skill OS M1 评审 | [`docs/REVIEW_SKILL_OS_M1.md`](./REVIEW_SKILL_OS_M1.md) |
| Skill OS M1 handoff 节点（已过期，2026-06-18） | [`docs/handoff-skill-os-m1.md`](./handoff-skill-os-m1.md) |

### 编辑器子系统

| 主题 | 入口 |
|---|---|
| 编辑器分层 / CM6 / Vditor 残留 | `docs/ARCHITECTURE.md` "Core Shape" + "Editing Utilities" 段 |

### 导出（Word / HTML / PDF）

| 主题 | 入口 |
|---|---|
| 用户操作 | [`docs/USER_GUIDE.md`](./USER_GUIDE.md) §4 |
| PDF 导出规约 | [`docs/PDF_EXPORT_SPEC.md`](./PDF_EXPORT_SPEC.md) |
| Mermaid 渲染规约 | [`docs/MERMAID_SPEC.md`](./MERMAID_SPEC.md) |

### 图片与资源

| 主题 | 入口 |
|---|---|
| 图片显示规约 | [`docs/IMAGE_DISPLAY_SPEC.md`](./IMAGE_DISPLAY_SPEC.md) |
| 图片插入规约 | [`docs/IMAGE_INSERT_SPEC.md`](./IMAGE_INSERT_SPEC.md) |

### 工程协作

| 主题 | 入口 |
|---|---|
| GitHub issue / PR 工作流 | [`docs/agents/issue-tracker.md`](./agents/issue-tracker.md) |
| 领域建模约定 | [`docs/agents/domain.md`](./agents/domain.md) |
| Issue 标签分类 | [`docs/agents/triage-labels.md`](./agents/triage-labels.md) |
| ADR（架构决策记录） | [`docs/adr/0001-ai-workbench-opencode-cli-provider.md`](./adr/0001-ai-workbench-opencode-cli-provider.md) |

### 设计分享 / 思路

| 主题 | 入口 |
|---|---|
| AI R&D 方法分享（中文版） | [`docs/TYPOLA_AI_RND_METHODS_SHARE.md`](./TYPOLA_AI_RND_METHODS_SHARE.md) |
| AI R&D 方法分享（概念版） | [`docs/TYPOLA_AI_RND_METHODS_SHARE_CONCEPTUAL.md`](./TYPOLA_AI_RND_METHODS_SHARE_CONCEPTUAL.md) |
| Calm Workspace 设计 | [`docs/typola_calm_workspace_design.md`](./typola_calm_workspace_design.md) |

## 未登记的副产物（不要进 Index）

- `docs/changes/*.md` 13 篇历史变更记录：时间点快照，不属于当前项目知识
- 仓库根 `pr2*.txt` / `pr2*-review.md` / `plans/` / `review-173/` / `tasks/` / `lessons/` / `learning-records/` / `design-mockups/`：review 副产物与本地计划稿，不进知识库
- `.nimo/`：nimo 维护状态，由工具管理，不进知识库
