# Handoff — 产物回流 + Composer/消息体验(交给 mimo)

> 你(mimo)冷启动接手 Typola。本文件自包含,按它执行即可。**先读「0. 必读背景」和「1. 代码地图」建立全局认知,再动手。** 有歧义先问,别猜(Karpathy: Think before coding)。

---

## 0. 必读背景

**项目**:Typola —— Tauri v2(Rust)+ React 19 + TypeScript + Vite 桌面 Markdown 编辑器,正演进为「知识工作者的 Skill OS」文档驾驶舱:用户在工作台里调真实 `claude` CLI + 自己的 skill 产出文档。

**当前分支**:`codex/skill-os`。**工作区有大量未提交改动(M2 在途),基于现状继续改,不要 `git commit`、不要 `git revert/restore` 别人的改动、不要 `git checkout` 切分支。**

**用户是盲人** —— 看不到 UI,视觉验证只能靠他截图反馈。所以:① 你不能靠"我看一眼界面"验证,必须靠代码正确性 + 类型 + 测试 + 构建通过;② 交互文案/aria-label/title 要齐全(他可能用读屏)。

**三条护城河红线(任何改动不得违反)**:
1. **文档成品在中心,对话不喧宾夺主** —— 新增 UI 要克制、轻量,不能盖过中间编辑器。
2. **AI 产物进中间编辑器,不进右栏** —— "打开产物" = 在中间主编辑器打开,绝不在右侧面板内联预览。
3. **会话是草稿纸不是资产库** —— 对话/产物是耗材(重启可丢),可暂存、可删。所以"删除产物"是合理操作,但删文件仍要二次确认。

**编码规范(强制)**:
- 注释、UI 文案、交付说明一律**中文**。
- **简洁优先**:用最少代码解决,不加投机性抽象/配置项/未被要求的灵活性。200 行能压到 50 行就压。
- **精准修改(surgical)**:只碰必须改的文件/行,匹配现有风格,不顺手重构相邻代码、不动 skillHub 场景卡(刚做完)、不动 M2 多会话/`resumeAgentSession` 逻辑。
- 改动产生的孤儿 import/变量要清掉;但不要删预先存在的死代码。

**每个任务完成后必跑验证套件**(全绿才算完成):
```bash
npm run typecheck
npm test -- --run
cd src-tauri && cargo check && cd ..
```
**全部任务做完**再跑一次构建,产出给用户截图测试的 exe:
```bash
npm run tauri:build:local
# 成功后覆盖到用户安装位:
cp src-tauri/target/release/typola.exe /d/soft/typola/typola.exe
```
> 命令在 Git Bash 下写。涉及新增 Rust 命令时 cargo check 必过。

---

## 1. 代码地图(动手前先 Read 这些)

| 文件 | 职责 | 关键锚点 |
|---|---|---|
| `src/app/AppLayout.tsx` | 顶层装配。持有 `agentChangedPaths: Map<string,number>`(产物路径→时间戳)、`transientMessage` state、`useArtifactState` 调用 | :139 `transientMessage` / :291 `agentChangedPaths` / :683 `useArtifactState({...})` / :959 渲染 `<ArtifactPreview>` |
| `src/hooks/useArtifactState.ts` | 把 `agentChangedPaths` 派生成 `artifactItems`,封装 `handleArchiveArtifact`(归档到工作区) | 全文 62 行,已读懂即可 |
| `src/components/ArtifactPreview.tsx` | 右栏「AI 产物」chip 列表。chip 已有「打开」(点 chip)+「归档」(FolderInput 按钮) | `ArtifactItem` 类型在 :3;chip row 在 :39-61 |
| `src/components/conversation/ConversationPanel.tsx` | 左侧对话面板:消息流 + 底部 `<Composer>`。`UserMessage` 内联组件在 :48 | :48 `UserMessage` / :217 渲染 `<UserMessage>` |
| `src/components/conversation/AssistantMessage.tsx` | 助手消息渲染。代码块抽取 + 每块复用 `MessageActions`(复制/插入/替换选区) | `extractCodeBlocks` :19 / 代码块渲染 :118-137 |
| `src/components/conversation/Composer.tsx` | 输入框。用 `useComposerContextState` 管理附件 | :104 `<div className="conversation-composer">` 根节点 |
| `src/components/conversation/useComposerContextState.ts` | 附件状态:`attachedFiles` + `handleAttachFiles`(走 dialog.open)+ `appendContext` | :61 `handleAttachFiles` / :23 `attachedFiles` state |
| `src/services/dialogService.ts` | 可靠对话框封装:`confirmDialog` / `messageDialog`(WebView2 下 window.confirm 不可靠,必须用这个) | 全文 54 行 |
| `src/services/agent/types.ts` | `AgentMessage`(user/assistant 都有 `createdAt: number`)、`AgentEvent` | :16 `AgentMessage` |
| `src-tauri/src/lib.rs` | Rust 命令。已有:`write_opened_document`(**有扩展名白名单** `is_writable_document_path`)、`archive_artifact_to_workspace`、`write_attachment_file`。**没有 delete 命令** | :273 write_opened_document / :358 archive_artifact_to_workspace |

**关键既有事实(别踩坑)**:
- 产物落盘后,数据已经在 `agentChangedPaths`,右栏 `ArtifactPreview` 已显示 chip。回调 `onOpenPath(path)`(中间编辑器打开)、`handleArchiveArtifact(path)`(归档)、`onForgetArtifact(path)`(从 Map 移除)**全部已存在**于 AppLayout / useArtifactState。下面多数任务是复用这些回调接 UI,不要重造。
- `write_opened_document` 只接受文档类扩展名(白名单),**不能**用它存任意语言代码块。

---

## 2. 任务清单

> 5 个任务,分两组。每组做完跑验证套件。**逐个交付,不要一次性堆完才验证。**

### 组 A:产物回流(2A / 2B / 2C)

#### 2A — 产物落盘即时 toast 通知

**目标**:产物刚落盘时,在左侧对话面板的 **Composer 上方**弹一条轻量 toast,让用户立刻知道并能一键处理。验收:生成 HTML/MD 产物后,对话框上方出现「✨ 生成了 `xxx.html`」+ 三个操作 →「打开」「保存到工作区」「忽略」。

**为什么**:产物 chip 现在只在右栏,用户视线常在中间编辑器/左侧对话,会错过。toast 是即时提醒,与右栏 chip 列表并存(不冲突)。

**实现要点**:
- 数据源用现成的:AppLayout 的 `agentChangedPaths` / `artifactItems`(最新一条 = `artifactItems[0]`,已按 ts 倒序)。
- 新增一个轻量 toast 组件(如 `src/components/conversation/ArtifactToast.tsx`),渲染在 `ConversationPanel` 内、`<Composer>` 之上。把"最新落盘产物 + 回调"从 AppLayout 往下传(沿现有 props 链;`onOpenPath`、`handleArchiveArtifact` 已在 AppLayout)。
- 三个操作:
  - 「打开」→ `onOpenPath(path)`(中间编辑器,**护城河②**)。
  - 「保存到工作区」→ `handleArchiveArtifact(path)`(已有)。
  - 「忽略」→ 仅关闭 toast,**不删文件**(chip 仍在右栏)。
- toast 只提示"本次新落盘且未被处理过"的产物。需要一个"已提醒过的路径集合"(组件内 `useRef<Set>` 即可),避免同一产物反复弹。
- 自动消失:可选(如 8s 后淡出),但用户没点时别太快消失。保持克制(**护城河①**),单条、不堆叠;多产物连续落盘时只显示最新一条或显示"等 N 个产物"。

**验收标准**:typecheck/test/cargo 全绿;生成产物后对话框上方出现 toast;三个按钮行为正确(打开走中间编辑器、保存调归档、忽略只关闭)。

---

#### 2B — 产物 chip hover 三按钮(打开 / 归档 / 删除)

**目标**:右栏 `ArtifactPreview` 的每个 chip,hover 时露出三个操作:打开、归档到工作区、**删除**。现状已有「打开」「归档」,**缺「删除」**。

**实现要点**:
- 文件:`ArtifactPreview.tsx`。给 chip row 加第三个按钮(删除,`Trash2` 图标),hover 时显示(平时可隐藏/淡,hover 显形 —— 用 CSS,在 `src/styles/app.css` 找 `.artifact-chip-row` 相关样式补)。
- 「删除」语义:删掉**暂存目录(`.typola-output`)里的产物文件**,并从列表移除(调已有的 `onForgetArtifact(path)`)。删除前用 `confirmDialog`(dialogService)二次确认(**护城河③**:产物是耗材但删文件仍是破坏操作)。
- **需要新增 Rust 命令** `delete_artifact_file(path)`(在 `src-tauri/src/lib.rs`),因为目前没有删除命令。**安全约束**:Rust 端必须校验目标路径在 `.typola-output` 暂存目录内(参照 `archive_artifact_to_workspace` 的路径处理风格),拒绝删除暂存目录之外的任何文件,防止误删工作区/系统文件。给该命令加一个 Rust 单测(删暂存内文件成功 / 删暂存外文件被拒)。
- 新增命令记得在 `tauri::generate_handler!` 列表注册。
- `ArtifactPreview` 加 `onDeleteFile?: (path) => void` prop;AppLayout 接线:确认删除 → `invoke('delete_artifact_file', { path })` → `onForgetArtifact(path)` → `onTransientMessage('已删除 xxx')`。

**验收标准**:typecheck/test/cargo(含新 Rust 单测)全绿;hover chip 出现三按钮;删除有确认弹窗;确认后文件消失且 chip 移除;删暂存目录外路径被 Rust 拒绝。

---

#### 2C — 代码块/长文本「另存为新文件」

**目标**:助手消息里的代码块,加一个「另存为」按钮 → 弹保存对话框选路径/文件名 → 写盘。验收:点某代码块「另存为」→ 系统保存框 → 存成功。

**实现要点**:
- 文件:`AssistantMessage.tsx`,代码块渲染区(:118-137,每块那行)。在代码块的操作区加「另存为」按钮(只给**代码块**加,普通消息文末的 MessageActions 不加,避免噪音)。
- 保存框:用 `@tauri-apps/plugin-dialog` 的 `save({ defaultPath })`。在 `dialogService.ts` 加一个封装 `saveFileDialog(defaultName): Promise<string|null>`,风格与现有 `confirmDialog`/`messageDialog` 一致(Tauri 运行时用 plugin,否则返回 null)。
- **写盘别用 `write_opened_document`**(它有扩展名白名单,挡掉 `.py/.css/.js` 等)。改用 `@tauri-apps/plugin-fs` 的 `writeTextFile(path, content)`。**前置确认**:检查 `src-tauri/capabilities/*.json` 是否已授予 `fs:allow-write-text-file`(或等价权限);若没有,需补 capability。先确认再写代码(Think before coding)。
- 默认文件名按代码块 `lang` 推断扩展名:`html→.html`、`python→.py`、`javascript/js→.js`、`css→.css`、`json→.json`、`markdown/md→.md`、其他/空→`.txt`。默认名如 `snippet.{ext}`。
- 写成功后给个轻提示(可复用 `messageDialog` 或沿 transientMessage,择简)。失败 catch 后 `messageDialog` 报错。

**验收标准**:typecheck/test/cargo 全绿;代码块出现「另存为」;点击弹保存框;存 `.py`/`.html` 都成功(不被扩展名白名单挡)。

---

### 组 B:Composer / 消息体验(6-1 / 6-3)

#### 6-1 — 拖拽文件进 Composer 当附件

**目标**:从系统资源管理器把文件拖进 Composer(或对话面板)→ 自动加为附件,等同点「+」选文件。

**关键大坑(必读)**:Tauri/WebView2 里 **HTML5 的 `onDrop` 事件拿不到本地文件真实路径**(浏览器安全限制,`file.path` 为空)。**必须用 Tauri 的拖拽事件**:`getCurrentWebview().onDragDropEvent(cb)`(来自 `@tauri-apps/api/webview`),它的 `event.payload`(type `'over' | 'drop' | 'leave'`)在 `drop` 时给 `paths: string[]`(真实路径)。
- **前置确认**:Tauri v2 下窗口需 `dragDropEnabled`(默认 true)才有此事件;若 `tauri.conf.json` 里 window 显式关了 `dragDropEnabled`,要打开。先确认。
- 注册时机:Composer mount 时 `onDragDropEvent` 注册,返回的 unlisten 在 unmount 调用。
- 事件是**全窗口**的。简化策略:整个左侧对话面板都接受 drop 即可(不必精确判断落在 Composer 矩形内);可选地在 `drop`/`over` 时给对话面板加一个高亮态 class 作视觉反馈。
- `useComposerContextState` 现在只有内部 `handleAttachFiles`(走 dialog),**需要暴露一个 `addAttachments(paths: string[])` 方法**(复用现有去重逻辑),供拖拽回调调用。
- 路径去重沿用现有 `attachedFiles` 的 Set 逻辑。

**验收标准**:typecheck/test/cargo 全绿;从资源管理器拖一个/多个文件到对话面板 → 出现对应附件 chip(与点「+」选文件结果一致)。

---

#### 6-3 — 消息时间戳(相对 + hover 绝对)

**目标**:每条消息(用户 + 助手)显示相对时间(如「刚刚 / 3 分钟前 / 14:23」),hover 显示绝对时间(`2026-06-20 14:23:05`)。

**实现要点**:
- 数据已就绪:`AgentMessage` 两种 role 都有 `createdAt: number`(types.ts:16)。
- 加一个工具函数 `formatRelativeTime(ts: number): string`(可放 `src/app/appLayoutUtils.ts` 或新建 `src/services/timeFormat.ts`,就近择简),配 `title={绝对时间}`。
- 渲染位置:`UserMessage`(ConversationPanel:48)和 `AssistantMessage`(AssistantMessage.tsx)各加一个小的时间角标。**克制**(护城河①):小字号、低对比、不占显眼位置。
- 相对时间刷新:**做简化版**,渲染时计算即可,不加定时器(新消息到来会自然 re-render)。别为这个引入 setInterval 全局刷新(过度工程)。
- 给工具函数写个小单测(刚刚 / N 分钟前 / 今天 HH:mm / 跨天日期 的边界)。

**验收标准**:typecheck/test(含新单测)/cargo 全绿;每条消息有相对时间;hover 出绝对时间。

---

## 3. 交付方式

- 每组(A、B)完成后跑验证套件,把结果(typecheck/test/cargo 是否全绿)报给用户。
- 两组都完成后跑 `npm run tauri:build:local` 并覆盖到 `/d/soft/typola/typola.exe`,告诉用户可以启动截图测试。
- 报告里逐条对应验收标准说明完成情况;**不要**自行 `git commit`。
- 任何与现有护城河/M2 逻辑冲突的地方,先停下问用户,别硬改。
