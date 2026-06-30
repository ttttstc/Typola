# Typola AI 工作台 CLI 复用方案 — Codex 评审 Handoff

> 分支：`codex/cm6-ai-workbench-cli-reuse`(基于合并后 main `d3fe4dd`,base 1 个 commit `d3fe4dd`)
> 方案文档：`D:\暂存\Typola\docs\changes\2026-06-30-ai-workbench-cli-reuse-plan.md`(已 commit,3 个 commit)
> 参考仓库：`D:\AI\workspace\open-design`(Apache-2.0,Typola 已通过 `Adapted from nexu-io/open-design` 头部引用)
> 你的角色：**评审方案**,不评审代码。读完文档后,给出一份"通过 / 需要修订 / 需要重新设计"结论。
> 评审原则:ponytail full —— 能复用不自研。如果方案里有"自研且无 open-design 对应"的部分,标出来。

---

## 项目背景(30 秒读懂)

Typola 是 Tauri v2 + React 19 桌面 Markdown 编辑器,左栏有 AI 工作台(Composer + ConversationPanel + ToolCard + ArtifactToast)。

左侧 AI 工作台**不支持对话选项**:Composer 没有 `/command` 解析;agent 全量输出(`tool_use / tool_result / thinking_delta / artifact_file / status / usage`)的 UI 渲染不全;**没有 protocol 化的能力清单**。

Typola 已经从 open-design 借走并标注 Apache-2.0 的 **8 个文件**:`claudeStream.ts / claudeDiagnostics.ts / redact.ts / roleMarkerGuard.ts / runtime/{types,registry}.ts / runtime/defs/{claude,opencode}.ts`。这是 ponytail 路径的现有成果。

---

## 评审范围

读 `D:\暂存\Typola\docs\changes\2026-06-30-ai-workbench-cli-reuse-plan.md`(256 行,**全文必读**)。

需要重点评审的章节:

- **§3 目标方案**:确认"协议层 / runtime 层 / UI 层"复用边界是否合理
- **§3.2 runtime 层**:补 2 个 def(codex/gemini)的搬运策略是否正确,3 个不做的(cursor-agent/qwen/grok)理由是否充分
- **§3.3 Slash Command**:抄 `apps/web/src/components/ChatComposer.tsx:736-815` 二分类拦截,命令清单是否覆盖 Typola 实际场景
- **§3.4 Tool Cards**:重写 AssistantMessage + 9 个 tool cards,事件分支映射是否漏
- **§3.5 Capability Detection**:抄 `runtimes/{capabilities.ts, detection.ts}`,flags 集合是否覆盖 Typola 后续需求
- **§3.6 Mock CLI**:搬 `mocks/{picker.mjs, bin/, lib/format-*.mjs, OD_MOCKS_*}` 模式,format-*.mjs 与 parser 镜像校验机制是否够
- **§4 文件改动清单**:8 个新增 + 5 个修改,有无遗漏或冗余
- **§5 验证策略**:red spec → 实现 → green 闭环是否完整
- **§6 风险与对策**:有无漏掉的风险
- **§7 PR 拆分**:6 个 PR 的依赖顺序是否合理,合并粒度是否合适
- **§8 对齐决策**:用户决策是否合理

---

## 关键决策点(请逐项表态)

1. **Agent def 收窄到 2 个**:做 codex + gemini,**不做** cursor-agent(qwen)(grok)。理由:cursor-agent stream-json 格式未稳定;qwen Windows PATH/认证差异大;grok 尚未发布稳定二进制。是否同意?
2. **不搬 open-design 的 sidecar / AG-UI / HTTP daemon / 外部 od CLI**:Typola 用 Tauri IPC + 单进程 GUI,这些边界外。是否漏掉什么需要搬的?
3. **完整 9 个 tool cards 一次做**:不分批(PR3+PR4 合并)。是否过度?建议拆分?
4. **slash 只 `/` 前缀拦截,不引入 Cmd+K 弹层**:Typola 是键盘+按钮混合,够不够?
5. **mocks 系统本 PR 做基础**:2-3 条 trace + golden tests。后续 feature 是否需要更多?
6. **`artifact_file → 产物中心` 推送**:Typola 已有 `ArtifactToast` + `useArtifactState`,但事件未被订阅。是补订阅还是重写?
7. **PR1 范围**:只 2 个 def + union 扩展。是否过度最小化?要不要把 capability 检测也合并到 PR1?

---

## 评审标准

按优先级:

**P0(必须修正才能启动实现)**:
- 方案里有自研且无 open-design 对应、且不符合 ponytail 原则
- 文件改动清单漏掉关键改动或包含冗余改动
- PR 拆分有循环依赖
- 验证策略无法验证关键行为

**P1(应该修订,否则后续会返工)**:
- 风险与对策漏掉关键风险
- Slash 命令清单不全
- Tool card 事件分支遗漏
- Mock CLI format-*.mjs 与 parser 镜像校验不够

**P2(优化建议,接受实现后 follow-up)**:
- 文件命名 / 目录结构建议
- PR 粒度细分建议
- 测试覆盖补充

---

## 期望输出格式

请按以下格式输出评审报告(纯 markdown,可直接 commit 到 `docs/changes/2026-06-30-codex-review.md`):

```markdown
# Codex 评审:Typola AI 工作台 CLI 复用方案

> 评审对象:docs/changes/2026-06-30-ai-workbench-cli-reuse-plan.md
> 评审日期:2026-06-30
> 评审结论:[通过 / 通过(小修订) / 需大改 / 拒绝]

## 总体结论

<2-3 句总结>

## 关键决策逐项表态

### 决策 1:Agent def 收窄到 2 个
- 同意 / 不同意 / 部分同意
- 理由:

### 决策 2:不搬 sidecar / AG-UI / HTTP daemon / 外部 od CLI
- ...

### 决策 3-7 同上

## P0 问题

<若无,写"无">

## P1 问题

## P2 建议

## 评审补充

<如果方案有你认为值得加的内容,在这里提>

## 推荐的修订顺序

<如果需要修订,给一个修订清单,每条 1-2 句话>
```

---

## 评审环境信息

- Typola 工作目录:`D:\暂存\Typola`
- 参考仓库:`D:\AI\workspace\open-design`
- 分支:`codex/cm6-ai-workbench-cli-reuse`
- 评审用 commit:HEAD = `08d79db docs: AI 工作台 CLI 复用方案收窄 PR1 到 2 个 def`
- 评审用时建议:≤ 25 分钟

评审完成后,把报告写到 `docs/changes/2026-06-30-codex-review.md` 并 commit;如果方案需要修订,我会改完后请你二审。

---

## 注意事项

- **不要评审代码** — 这次只评审方案。代码还没写
- **不要扩展 scope** — 6 个 PR 边界已定,如有额外需求放进 P2 建议
- **不要改 ponytail 原则** — 如果你认为方案违反 ponytail 原则(自研且无 OD 对应),P0 标出
- **直接评判** — 不要写"还可以" / "看情况",要么同意要么不同意,给理由