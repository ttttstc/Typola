# RESOURCES — Typola 教程权威资源清单

> 优先级 ★★★ = 写课时必须读懂的源码或文档;★ = 写完可对照;不评 = 用户读完即可。
> 教程面向终端用户,本清单服务于"教程自身的可信度":每一处断言都靠下面资源支撑。

## 1. 项目自身文档(终端用户用得到的部分)

| 路径 | 优先级 | 用于哪节课 |
|---|---|---|
| `README.md` | ★★ | 全局概念、第一次启动、第 10 节 |
| `docs/ARCHITECTURE.md` | ★★ | 第 1 节(产品形态)+ 第 8 节(产物中心原理)+ 第 10 节(降级能力) |
| `docs/AI_WORKBENCH_SKILL_OS.md` | ★★★ | 第 3、4、6、7 节 — AI 工作台、SkillHub、多会话、Pill 切换器 |
| `docs/AI_DIFF_PREVIEW_SPEC.md` | ★★★ | 第 1 节(浮条结果卡)、第 5 节(检视 → 内联审阅)、第 9 节(产物合并) |
| `docs/AI_EDIT_AND_REVIEW_SPEC.md` | ★★★ | 第 1 节(浮条)、第 5 节(检视模式本身) |
| `docs/PDF_EXPORT_SPEC.md` | ★ | 第 9 节(导出 PDF) |

## 2. 项目源码(逐节对应表)

> 写教程不引源码,但凡涉及「这个按钮在哪」「这次叫哪段路径」都要从源码确认,绝不能凭印象。

| 组件 / 类 | 路径 | 用于哪节课 |
|---|---|---|
| 选区浮条 | `src/components/SelectionFloatingBar.tsx` | 第 1 节 |
| 选区 AI 结果卡 | `src/components/SelectionResultCard.tsx` | 第 1 节 |
| 选中 AI 动作集(6 个) | `src/services/selection/selectionActions.ts` (`SELECTION_ACTIONS`) | 第 1 节 |
| AI 工作台会话面板 | `src/components/conversation/ConversationPanel.tsx` | 第 3 节 |
| Provider 切换器 | `src/components/conversation/ProviderSwitcher.tsx` | 第 3 节 |
| 上下文芯片 | `src/components/conversation/ContextChips.tsx` | 第 3 节 |
| SkillHub 服务 | `src/services/skillHubService.ts` | 第 4 节 |
| SkillHub UI | `src/components/SkillHub.tsx` / `SkillHubPanel.tsx` | 第 4 节 |
| 检视侧栏 + 段后卡 | `src/components/review/ReviewSidebarPanel.tsx` | 第 5 节 |
| 内联 diff 审阅态 | `src/components/diff/DiffReviewPane.tsx` | 第 5 节 |
| 文档模式切换 | `src/app/AppLayout.tsx` 文档模式 state | 第 5、6 节 |
| 产物中心 | `src/components/artifact/ProductArtifactPanel.tsx` | 第 6 节 |
| 会话 Pill 切换器 | `src/components/conversation/ConversationPill.tsx` | 第 7 节 |
| 会话 store | `src/store/conversationStore.ts` | 第 7 节 |
| 模式切换快捷键 | 全局键盘处理段 | 第 8 节 |
| 导出 PDF | `src/services/pdfExport.ts` + Rust `export_pdf` | 第 9 节 |
| 导出 Word | `src/services/wordExportService.ts` | 第 9 节 |
| 富文本复制 | `src/components/WechatPreviewPane.tsx` | 第 9 节 |

## 3. 关联阅读(用户读,但不要求写教程)

| 资源 | 何时推给用户 |
|---|---|
| `README.md` 快速开始节 | 第 0 节 |
| `CONTEXT.md`(命名约定) | 教程不涉及,但用户问"这个功能叫什么"时可引 |
| `docs/AI_WORKBENCH_OPENCODE_PRD.md` | 第 3 节提到 OpenCode Provider 时 |
| `docs/MERMAID_SPEC.md` | 第 8 节若提到 Mermaid |

## 4. 教程内引用规则(强制)

- 任何 UX 描述(按钮位置 / 快捷键 / 名称)**必须**先 `grep` 或 `read` 源码确认
- 引用代码示例时,只截取必要片段(原则 50 行内),绝不全文件粘贴
- 凡论及「为什么这么做」回引到 `docs/` 之一,标明 `path:line` 让用户自己点开
- 不引用 PR 号、commit hash(教程是讲现在,不是讲历史)

## 5. 不引用的内容

- ❌ `tasks/` 个人待办
- ❌ `.review-*` 审查文档
- ❌ 内部 PR 评审文档
- ❌ 未合入 main 的实验分支

只有进入 `main` 分支、且 README 或 docs 提到的能力才在教程范围内。
