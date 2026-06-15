# Plan Value Review — 商业价值评估

**日期**: 2026-06-14
**审查分支**: codex/ai-doc-workbench
**审查模式**: SELECTIVE EXPANSION

## 价值评估结论

**通过(进入 Design)。** Typola → 文档中心 AI 工作台是正确方向:问题真实、杠杆极高、可逆性高、风险集中且可控。以用户已钉死的「文档润色闭环·精简三件套」为基准做扎实,并就少数高杠杆扩展逐条呈报供用户择优。
**唯一必须钉死的警示:成功标准是闭环质量(贴合度),而非功能数量。**

## 第一性原则检查

- **问题正确性**: 正确,且比 fanbox 更锐。真问题不是"我要个 AI 工作台",而是"文档 + agent + 预览要在一个紧密闭环里,不再多窗口反复横跳"。fanbox 用产品形态印证了该框架("三个窗口来回跳");Typola 的"编辑器中心"框架对文档用户更贴。
- **实际业务结果**: 直接结果 = 单窗口完成 select→润色→看到结果,以"不切窗口 + 改动可见"度量。是最直接路径,非代理问题。
- **不做的后果**: 真实痛点(dogfood)。旧 headless 方案已被验证"效果很差";不做则维持多窗口割裂或劣质 headless。

## 现有代码利用

MVP 几乎全是**接线现有能力**,而非重建:
- `portable_pty`(Rust PTY)✅ / `@xterm/xterm` + addons ✅ / `TerminalPanel`(tab/resize/主题/复制粘贴)✅
- `FileTreePanel` + `workspaceService`(本分支已建)✅ / `notify` 文件监听 ✅ / `agent_detect`(claude 检测)✅ / 编辑器 + Word/HTML 预览(核心产品)✅
- 唯一被"重建"而避免的是 headless 自定义聊天 UI —— 正确地被废弃。

## 梦想状态映射

```
当前状态                    本计划(增量)                 12 个月理想
Markdown 编辑/阅读器    →   编辑器中心 agent 驾驶舱    →   文档工作台:PM/架构师/技术写作者
+ 集成终端              →   文档润色闭环打通          →   全流程闭环(产出/润色/html/ppt/
+ headless AI 实验(劣)  →  (放弃 headless)            →   日报/数据分析,皆走终端 skill)
                                                       →   深度 编辑器↔预览↔agent 联动
                                                       →   多引擎 + 会话记忆 + 模板
```
本计划是上述理想的**地基闭环**,方向一致(朝向,不背离)。

## 实施路径替代方案

**路径 A:复用现有终端,最小改造(最小可用)**
- 摘要:复用 `TerminalPanel`+`portable_pty` 起交互 `claude`;叠加三件套(选区 bracketed-paste 注入 / 复用 `notify` 刷新编辑器预览 / git diff 或变更高亮);心流布局复用 `FileTreePanel`(左)+ 编辑器预览(中)+ agent 终端(右/下);删 headless。
- Effort: M ｜ 风险: 低
- 优点:最小 diff、复用最大化、最快验证闭环、风险集中在 Windows claude-in-PTY
- 缺点:"改动可见"用 git diff 依赖 git 仓库,需非 git 降级
- 复用:TerminalPanel / portable_pty / FileTreePanel / notify / agent_detect

**路径 B:新建独立 AgentTerminal + agent 适配抽象(理想架构)**
- 摘要:不复用 TerminalPanel,新建专用 AgentTerminal + 多引擎适配层 + 独立会话/态势感知层。
- Effort: L ｜ 风险: 中
- 优点:长期多引擎可扩展、关注点分离干净
- 缺点:过早抽象(当前只有 claude 一个引擎,YAGNI)、与 TerminalPanel 重复、MVP 拉长
- 复用:少

**路径 C:保留 headless 作结构化动作 + 终端(混合)**
- 用户已否决(已评估)。终端为主已能覆盖 MVP;自动化/定时类需求待 Phase 2+ 再评估薄 headless 通道。

**推荐:路径 A** —— 与工程偏好对齐(最小 diff、复用优先、不过早抽象);多引擎抽象等真有第二引擎需求(Phase 2/3)再做。

## 深度审查结论(spark 高度;完整 Section 1–10 取证留待 Design 的 eng-review)

- **架构/可逆性**: 高度可逆(2-way door),心流模式为可切换布局,不破坏阅读器模式;回滚 = 关闭心流入口。速度默认快。
- **关键风险**:
  - R1(最高)Windows `claude.cmd` 在 PTY 内启动:复用 `agent_detect` 路径配置 + 必要时 `cmd /d /s /c` 包装;**建议 Design 首个 spike**。
  - R2 非 git 目录"改动可见":降级为文件监听标记被改动文件高亮 + 打开即看新内容;git diff 作为 git 项目增强。
  - R3 安全边界:不代为 `bypassPermissions`;跑真实交互 claude → 用户看到并使用原生权限提示(比旧 headless 的 bypass 更安全)。
  - R4 watcher ↔ 编辑器未保存改动竞态:复用现有外部改动提示 / 未保存守卫。
- **观测/测试**: MVP 需要终端启动失败、注入、写盘刷新的单测/集成测;Windows 启动路径建议 smoke。

## 扩展机会(呈报供用户择优,非 MVP)

- **E1 跟随模式(follow mode)**:预览实时跟踪 agent 正改文件——体验跃迁。Phase 2。
- **E2 拖文件进终端 + 可点击路径**:上下文注入。Phase 2。
- **E3 项目记忆(`claude --resume` 续接)**:会话连续性交给 CLI,低成本高价值。Phase 2。
- **E4 多引擎(codex/opencode)适配**:等真有需求。Phase 3。

## 决策

**是否进入 scope/Design 审查**: 是(待用户确认)

**理由**:
- 支持:问题正确、杠杆极高(接线 > 重建)、可逆性高、风险集中可控、dogfood 强信号。
- 风险/担忧:成功取决于闭环贴合度而非功能广度;Windows claude-in-PTY 为主要未知,需 spike 先验。

## 后续行动

- 通过后进入 Design;首个动作建议为 Windows「claude 在 PTY 内交互启动」spike。
- eng/design review 在 Design 末尾执行(完整 Section 1–10 取证审查在此进行)。
