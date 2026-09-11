# 检视意见与 Diff 改稿

用户可以在正文选区添加人工意见，运行 AI 检视，逐处审阅候选稿差异，并在确认后应用、另存或恢复历史版本。

## 子功能

- `manual-comment` 为选区添加、编辑、定位、忽略和恢复人工意见。
- `ai-review` 使用规则文件、Skill 和手工规则生成可定位的 AI 意见。
- `diff-review` 在修改前/候选稿之间逐处采纳或拒绝，继续修改并自检。
- `apply-history` 在应用前保存历史，支持另存、应用、撤销和导出检视版。

## 用户视角入口

- 文档模式切换器的 `检视模式`。
- 选区浮条 `加检视意见`、右栏检视列表和 `AI 检视`。
- 右栏底部 `AI 改稿`，Diff 中的 `上一处 / 下一处`、`采纳 / 拒绝`、`应用` 和 `另存为`。
- `导出检视版`、改稿历史和外部变更冲突栏。

## 用 exe-CDP harness 驱动

- 直接 exe 套件点击 `检视模式`，确认 `aside[aria-label="检视意见"]` 及筛选/导出/AI 改稿入口可见；当前运行已完成这一步。
- 完整配方必须打开一次性已保存 Markdown，真实选择正文、保存人工意见、运行 AI 检视，再核对意见锚点和行号；AI 请求需有用户已配置的 Provider。
- Diff 配方要证明应用前 source 不变，逐处采纳/拒绝后只把用户确认的候选稿写回，并从编辑器、磁盘和历史快照三处核对；源文档修订变化时应阻止旧候选稿直接应用。

## 陷阱

- 右栏存在不等于意见已附着到正确 source 范围；必须回读原文片段、位置和意见来源。
- AI 候选稿在点击 `应用` 前不能改写正式文档；候选稿和源文档必须分别保存与读取。
- 运行中的 Provider 切换、跨文档切换和重复点击可能改变候选稿归属，harness 要记录文档路径与修订版本。
- 忽略或已应用意见不能被静默删除；导出、历史、撤销和清理只能作用于本次夹具。

维护信息：相关入口在 `src/components/review/ReviewSidebarPanel.tsx`、`src/components/selection/ReviewCommentEditor.tsx`、`src/hooks/useReviewState.ts`、`src/hooks/useDiffReview.ts`、`src/services/diff/markdownDiff.ts` 和 `src/app/AppLayout.tsx`；最近核对日期为 2026-09-11，真实 exe 已执行检视入口，意见/AI/Diff 应用未执行。
