# AI 制品体验改版：临时原料定位下的展示、升格与清理

## Context

用户反馈三个制品相关问题：①制品只在生成时弹 toast，关掉后找不到；②落盘目录 conv-N 无语义，违背一站式工作台初衷；③会话下拉宽度不一、长标题挤掉按钮、控件粗糙。

调研结论：制品中心（ArtifactCenterPanel）已存在但入口可发现性差；`.typola-output` 在文件树已隐藏但关闭会话不清理导致无限残留；会话首条消息自动命名钩子存在但只覆盖「自由对话」一类标题。

**产品定位（用户已确认）**：制品 = 会话绑定的临时原料，默认临时、显式升格为工作区资产。四个已拍板决策：
1. 升格命名：弹输入框 + 内容推导默认值
2. 生成制品后自动打开右侧制品面板 + 设置项可关（默认开）
3. 关闭会话时提示后清理 conv-N 目录
4. 归档成功后卡片保留 + 标记「已归档」

## P0 会话下拉修复（独立先行）

1. **CSS 根因修复** [app.css:5491-5496](file:///d:/暂存/Typola/src/styles/app.css#L5491-L5496)：标题 span 加 `min-width:0`（flex 子项默认 min-width:auto 导致长文本撑破 300px 容器）；:5388-5563 区间 radius 4/6/10 统一 8px、间距对齐 token。
2. **占位对齐** [ConversationPill.tsx:85,99-108](file:///d:/暂存/Typola/src/components/conversation/ConversationPill.tsx)：关闭按钮常驻渲染，无关闭能力时 `visibility:hidden` 占位；running 圆点同样固定占位宽度——消除逐行宽度参差。
3. **自动命名覆盖** [useAgentSession.ts:501-506](file:///d:/暂存/Typola/src/hooks/useAgentSession.ts#L501-L506)：条件 `conv.title === '自由对话'` 放宽为默认标题集合（含「{provider} 对话」），已手动改名不覆盖。skill 会话保持不动。
4. 条目次级信息：用现成 `conv.messages.length` 显示消息数（零成本）。相对时间需 conversationStore 加 updatedAt，列为可选增量，本期不做。

## P1 制品展示 IA

5. **新设置项 `autoOpenArtifactPanel`（默认 true）**：完整链路 [settingsService.ts](file:///d:/暂存/Typola/src/services/settingsService.ts)（类型 :222 / 默认值 :311 / 归一化 :940）→ [GeneralSection.tsx:38-48](file:///d:/暂存/Typola/src/components/settings/GeneralSection.tsx#L38-L48) settings-row + SettingsToggle → [i18n.ts](file:///d:/暂存/Typola/src/services/i18n.ts) 三词典同加（I18nKey=keyof zhCN，:262）。
6. **生成后自动打开**：[AppLayout.tsx:635](file:///d:/暂存/Typola/src/app/AppLayout.tsx#L635) onArtifactFile 回调内按设置项 `setRightPanelMode('artifacts')`（先例 :2989 review 自动打开）。风险：顶掉用户正在看的 review/word 面板——由设置项兜底，且仅在制品落库时触发，频率低。
7. **未读角标**：settings 加 `artifactSeenCount: number`；切到 artifacts 模式时写回当前扫描总数；[Toolbar.tsx:510-518](file:///d:/暂存/Typola/src/components/Toolbar.tsx#L510-L518) 按 total−seen 渲染 badge，删除导致倒挂时 clamp 到 0。落 settings 而非内存：制品跨重启仍在，内存态重启后角标全量复活更烦人。总数复用制品中心扫描结果（useArtifactLibrary），不新增扫盘。
8. **语义标题推导**：[manifest.ts](file:///d:/暂存/Typola/src/services/artifacts/manifest.ts) 新增 `deriveArtifactTitle(path, content?)`（HTML 取 `<title>`→首个 h1；MD 取首个 `^# `；截断 40 字符），ensureArtifactManifest 创建分支调用，content 缺失时读文件头 8KB。存量 manifest 不回填（避免全量扫描 IO），仅新制品受益。卡片展示用推导后的 title 替代裸文件名。

## P2 升格与清理

9. **新建 PromptDialog 组件**：项目无文本输入弹窗（dialogService 只有 confirm/message/save，Tauri 原生无输入能力）。新建 `src/components/PromptDialog.tsx`：受控输入框 + 默认值 + 确认/取消，样式对齐现有 modal token（radius 8px、settings-row 体系）。
10. **归档链路**：
    - 卡片主按钮「归档」改「存为文件」并前置 → PromptDialog 默认值 = manifest.title（P1-8 推导）。
    - Rust [lib.rs:1007](file:///d:/暂存/Typola/src-tauri/src/lib.rs#L1007) ArchiveArtifactRequest 加 `target_name: Option<String>`：sanitize 去路径分隔符、保留原扩展名、走既有 unique_file_path（:2217-2238）去重。
    - 归档成功后前端写回 manifest：`title=新名、archived=true、primaryFile=新工作区路径`（顺带修复现状 archive 后 primaryFile 悬空问题）。卡片保留并显示「已归档」徽标，点击可打开工作区文件。
    - 「插入文档」按钮：manifest.ts:81 有 action 标志但无 UI；若 chips 的「合并到当前文档」链路（ArtifactPreview.tsx:64-74 diff 审阅）可复用则补，否则标注后续项，不阻塞本期。
11. **关闭会话清理**：
    - Rust 新增两个命令：`conversation_output_status`（返回该 conv-N 制品数/备份数）、`cleanup_conversation_output`（删目录，删除前复查存在性）。
    - [AppLayout.tsx:2710](file:///d:/暂存/Typola/src/app/AppLayout.tsx#L2710) 包一层 handler：`runState==='running'` 禁止并提示先停止（防竞态）→ 查 status → 有内容则 confirmDialog（现成组件）明示「N 个未归档制品、M 个覆盖备份将删除，删除后撤销覆盖不可用」→ 确认后 cleanup → closeConversation。
12. **conv-N 目录名不改**：改名将牵动 outputCwdForConversation 与持久化会话映射，收益仅目录可读性；卡片不暴露目录名、文件树已隐藏，最小改动。

## P3 文档与测试

13. CHANGELOG.md Unreleased 区记录全部用户可见变更；[ARCHITECTURE.md:181-183](file:///d:/暂存/Typola/docs/ARCHITECTURE.md#L181-L183) 制品章节同步（升格命名流、两个新 Rust 命令、autoOpenArtifactPanel、归档后 manifest 语义、关闭会话清理）。
14. 单测：deriveArtifactTitle 用例（title / h1 / 无标题回落 / MD heading / 40 字截断）；关闭清理分支逻辑（status 解析、running 拦截）；PromptDialog 交互。
15. exe 场景（.nimo/verification/scripts/）：生成制品自动开面板、归档命名落盘且卡片标记已归档、关闭含制品会话确认后 conv-N 消失。

## 验证

- 每步 `npm run typecheck`
- P1/P2 完成后 `npm test`（含新增单测）
- Rust 改动后 `cargo test --manifest-path src-tauri/Cargo.toml`
- P3 跑 exe 场景脚本（CDP 驱动 debug exe）
- 手动走查：生成制品 → 面板自动滑出 → 存为文件（改名字）→ 工作区出现语义命名文件 + 卡片标记已归档 → 关闭会话 → 确认提示 → conv-N 消失

## 实施顺序

P0（独立，先行）→ P1（5→6→7→8）→ P2（9→10→11）→ P3。P0 与 P1/P2 无耦合，可单独提交。
