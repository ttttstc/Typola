# Codex 评审:Typola AI 工作台 CLI 复用方案

> 评审对象:docs/changes/2026-06-30-ai-workbench-cli-reuse-plan.md
> 评审日期:2026-06-30
> 评审结论:需大改

## 总体结论

方向正确:继续复用 open-design 的 runtime / stream / composer 经验,不搬 sidecar、daemon、AG-UI,符合 Typola 的 Tauri 单进程边界。

但当前方案不能直接进入实现。两个核心问题会导致返工:一是计划引用了 open-design 并不存在的 `toolCards/<name>.tsx` 目录;二是 `capabilities.ts + detection.ts` 不能按 2 个文件搬运,它依赖 open-design daemon 的 launch / env / auth / models / invocation 等一串模块。按当前清单做,会变成“名义复用、实际自研”。

## 关键决策逐项表态

### 决策 1:Agent def 收窄到 2 个

- 部分同意
- 理由:只做 codex + gemini 是对的,不要把 cursor-agent / qwen / grok 拉进来。但 PR1 不能只是 union + 2 个 def。open-design 的 codex/gemini def 包含 `buildArgs / promptViaStdin / streamFormat / eventParser / fallbackModels` 等执行字段,而 Typola 当前 `AgentRuntimeDef` 只是轻量检测元数据。要么 PR1 明确只做“CLI 检测卡片 def”,不接执行;要么同时补 codex/gemini parser 与 headless spawn 接线。不能把“可检测”和“可执行”混在一个 def 名义下。

### 决策 2:不搬 sidecar / AG-UI / HTTP daemon / 外部 od CLI

- 同意
- 理由:Typola 是 Tauri GUI + Rust command/event,没有外部 daemon 或 AG-UI client。搬这些只会引入多进程协议、端口、安全边界和发布复杂度,没有当前收益。需要保留的是 open-design 的协议经验,不是进程形态。

### 决策 3:完整 9 个 tool cards 一次做

- 不同意
- 理由:open-design 没有 `apps/web/src/components/toolCards/<name>.tsx` 目录,实际是单文件 `ToolCard.tsx` 内置家族卡片 + extension renderer。拆 9 个组件不是“直接抄”,是 Typola 自己设计新结构。ponytail 路径应先复用单个 `ToolCard.tsx` 的分派模式,把 Typola 现有 `ToolCard.tsx` 增强到覆盖 Read/Write/Edit/Bash/Glob/Grep/WebFetch/WebSearch/TodoWrite/Generic。是否拆文件留到组件变大后再做。

### 决策 4:slash 只 `/` 前缀拦截,不引入 Cmd+K 弹层

- 同意
- 理由:Typola 已有按钮入口和选区浮条,再加 Cmd+K 会和现有编辑辅助/选区 AI 心智重叠。`/` 前缀是最低成本补足键盘入口。

### 决策 5:mocks 系统本 PR 做基础

- 部分同意
- 理由:需要 mock,但不应自建 `picker.mjs` 新形态。open-design 现有目录是 `mocks/mock-agent.mjs`、`lib/recording-picker.mjs`、`bin/{claude,codex,gemini,...}`、`golden/*.events.json`、`scripts/contract-check.sh`。方案里的 `picker.mjs` / `traces/` 命名和实际 open-design 不一致。建议直接沿用 open-design 目录命名,只裁剪到 Typola 需要的 bin + golden。

### 决策 6:`artifact_file → 产物中心` 推送

- 同意补订阅,不同意重写
- 理由:Typola 已有 `ArtifactToast`、`useArtifactState`、`.typola-output` watcher 和 manifest/scanner 底座。应在 `useConversationManager` 的 `artifact_file` 回调里补 manifest + refresh,然后复用现有浮窗/产物状态。不要为这件事重写产物中心。

### 决策 7:PR1 范围

- 不同意当前范围
- 理由:PR1 “只 2 个 def + union 扩展”过度最小化,会制造不可用 runtime。更懒的做法是先定义 PR1 为“检测层 def”:只扩 CLI 检测/设置可见,不承诺执行。若目标是可执行 provider,PR1 必须同时包含 parser 注册、headless request 参数、stdin/argv 策略和最小 mock golden。

## P0 问题

1. **Tool card 复用路径错误。** 方案声称新增 `toolCards/{Read,Write,Edit,...}.tsx` 并“抄 open-design 同名文件”,但 open-design 只有 `apps/web/src/components/ToolCard.tsx`,没有该目录。必须改成“复用单文件分派模式”,否则就是自研组件架构。

2. **Capability detection 文件清单不可实现。** open-design 的 `detection.ts` 依赖 `invocation / registry / models / launch / env / auth / metadata / diagnostics / integrations/vela` 等模块。只新增 `capabilities.ts + detection.ts` 会编不过或被迫重写大量 glue。要么删掉 PR5,先用已有 AI CLI 检测;要么把 PR5 改成“极简 help flag probe”,并明确不是直接搬 open-design detection。

3. **runtime def 语义不清。** Typola 当前 `runtime/defs/claude.ts` 是轻量检测元数据;open-design `codex.ts/gemini.ts` 是完整执行定义。方案要求“删 OD 私有字段(promptInputFormat / promptBudget / capabilities 等 Typola 用不上的)”,但 codex/gemini 的关键价值正是 `buildArgs / promptViaStdin / eventParser`。必须先决定:本轮只是检测 codex/gemini,还是真的能作为 AI 工作台 provider 执行。

4. **PR 拆分存在假依赖。** PR3/PR4 的 tool cards 依赖 agent stream 能产生对应事件;PR1 只扩 union 不会让 codex/gemini 产生事件,PR5 才做 capability 又太晚。需要先把“现有 claude/opencode 的 tool cards 完善”和“新增 codex/gemini provider”解耦。

## P1 问题

1. **Slash command 清单偏产品化,不够贴近 open-design。** open-design 片段主要是 `/mcp`、MCP server hint、`/search`、`/hatch` 这类少量命令;方案直接加 `/model /plugin /skill /exit /clear /compact /help`。这些可以做,但不是“抄 736-815”。建议 commandRegistry 标注每个命令来源:OD 原生 / Typola 现有按钮等价 / 新增。

2. **`/model` 与前序“设置页简化”冲突。** 用户之前已要求 AI 执行设置简化到“只保留检测 CLI”。如果 `/model` 打开模型选择,需要明确这是 Composer 局部选择,不是恢复设置页复杂模型配置。

3. **Mock CLI 与 parser 镜像校验描述不够具体。** 需要写清楚 golden 的输入输出边界:mock 生成 provider 原始 stdout JSONL,测试只喂 Typola parser,断言 AgentEvent 序列。不要让 `format-*.mjs` 直接生成 Typola 已解析事件,否则测不到 parser。

4. **Gemini parser 缺口未列入文件清单。** open-design `geminiAgentDef` 标注 `eventParser: 'gemini'`;Typola 现有代码只有 claude/opencode parser。若 gemini 本轮只是检测,要写明不进 send;若要执行,必须新增 gemini stream parser。

5. **Codex parser 缺口未列入文件清单。** open-design `codexAgentDef` 使用 `eventParser: 'codex'`;同理,没有 parser 就不能称为 provider 复用完成。

## P2 建议

1. PR2 slash commands 可以先做 3 个命令:`/clear`、`/mcp`、`/help`。`/model /plugin /skill /exit /compact` 等待真实使用反馈再补。

2. ToolCard 先增强现有 `src/components/conversation/ToolCard.tsx`,不要先建 9 个文件。单文件超过 400 行再拆,现在拆是预支架构。

3. Capability flags 建议第一版只保留 `supports_mcp / supports_resume_session / supports_images`。`supports_compact / supports_vision / supports_stream_json` 容易和 provider parser 能力混淆。

4. `artifact_file` 相关验收应追加“生成 sidecar manifest 后 legacy 文件不重复显示”。现在 Typola 已有 manifest/scanner,这是最容易回归的地方。

5. 文档里提到“新增 8 个文件”但列出的 `toolCards/{...}`、`mocks/` 都是目录级多文件,数字会误导排期。建议改成“新增模块”而不是文件数。

## 评审补充

最省事的实施路径不是先追求“全量 CLI 命令/输出”,而是拆成两条线:

1. **现有 provider 体验补齐:**slash 最小集 + ToolCard 单文件增强 + artifact_file 接现有产物中心。只服务 claude/opencode,风险小,马上改善 UI。
2. **新增 provider 探针:**codex/gemini 先作为“可检测 CLI”进入 registry,不承诺可执行。等 parser/mock golden 准备好,再打开为可发送 provider。

这样仍符合 open-design 复用,但不会把 runtime、UI、mock、capability 一次打结。

## 推荐的修订顺序

1. **先改 §3.4 / §4 ToolCard 复用描述。** 把 9 个 `toolCards/*.tsx` 改为复用 open-design 单文件 `ToolCard.tsx` 分派模式;第一版增强 Typola 现有 `ToolCard.tsx`。

2. **重写 §3.5 Capability Detection。** 不要写“直接搬 detection.ts”。改为二选一:暂缓 capability;或实现极简 help flag probe,并列出真实依赖边界。

3. **明确 codex/gemini 是检测还是执行。** 如果只是检测,PR1 名称和验收都写清楚“不出现在 Composer provider 发送列表”;如果执行,补 parser/headless/mock 文件清单。

4. **调整 PR 拆分。** PR1 做 runtime 检测 def;PR2 做 slash 最小集;PR3 做现有 provider tool card 增强 + artifact_file 接线;PR4 再考虑 codex/gemini parser/mock。

5. **修正 mock 目录命名。** 对齐 open-design 现有 `mock-agent.mjs / lib/recording-picker.mjs / golden/` 结构,不要新造 `picker.mjs / traces/`。
