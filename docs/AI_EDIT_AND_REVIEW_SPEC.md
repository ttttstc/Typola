# 选区浮条 + 文档检视 设计 SPEC

- **日期**:2026-06-21
- **定位**:这两个功能合起来 = **AI 辅助修改的完整光谱**。选区浮条管「微观即时」(选一处改一处),文档检视管「宏观批量」(通读攒一批意见再整篇改)。都在护城河内(文档为中心 + AI 协作 + 产物回流),且别人没有这个组合。
- **用户画像(重要)**:用户**不是盲人**,明眼人 + 主力用所见即所得视图(Vditor)。交互可用浮条 / 高亮 / 视觉卡片 / 鼠标。
- **已砍**:slash 命令(本期不做);浮条塞 skill;检视 round-trip;气泡式批注。

---

## 一、选区浮条(先做)

### 设计决策

| 大块 | 决策 |
|---|---|
| **流向** | **C 混合**:润色/改写/缩写/扩写 → **原地闭环**(选区处出「新版 vs 原文」对比 → 采纳替换,不离开文档);解释术语 + 自定义 → **贴对话框**(解释输出不是替换;自定义要用户输入意图) |
| **放什么** | 只放现有 6 个选区动作(`SELECTION_ACTIONS`),**不塞 skill**(浮条保持轻;skill 留给场景卡) |
| **与右键** | 浮条「选中即现」为主入口,右键菜单**保留**,两者共用同一份 `SELECTION_ACTIONS` |
| **技术地基** | Vditor 选区屏幕坐标 ✅ 现成(`WysiwygEditorPane` 已有 `range.getBoundingClientRect()`) |

### 落地拆解

1. **`SelectionFloatingBar`(新)** — 选中非空文本即现,`getBoundingClientRect` 定位到选区上方;选区消失/Esc/点外部隐藏。内容复用 `SELECTION_ACTIONS` 6 动作。
2. **`runSkillOneshot(prompt) → Promise<string>`(新,核心工程)** — 静默一次性 AI 调用:抽取 `useAgentSession` 的 stream-json 解析逻辑 + 起一个**隐藏临时会话**(不渲染到对话面板),`startAgentSession` → 收集该 conversationId 的 `agent-stdout` 累积 assistant 文本 → `agent-exit` 时 resolve 完整文本。可复用基础设施(以后任何后台 AI 处理都能用)。
3. **`SelectionResultCard`(新)** — 原地结果卡(overlay):loading → 显示「新版 vs 原文」对比 → [采纳替换][取消];采纳走现有 `handleReplaceEditorAnchor`(anchor 精确替换)。
4. **改 `handleEditorAIAction`(`useEditorSelectionBridge`)** — C 混合分流:`polish/rewrite/shorten/expand` → `runSkillOneshot` + 结果卡;`explain/custom` → 现有 `queueInjection`(贴对话框)。
5. **右键菜单保留** — `EditorPane`/`WysiwygEditorPane` 现有 `onContextMenu` 不动,共用动作集。

### 技术验证结论(已核实)

- 选区屏幕坐标:✅ 现成
- 选区精确替换:✅ 现成(`getSelection`/`replaceRange`/`validateAnchor` + prefixHint 唯一定位)
- AI 静默 oneshot 调用:⚠️ 底层支持(headless 流式接口已在),需新增封装(抽解析 + 隐藏会话)= **本期主要新增工程**

---

## 二、文档检视(后做,复用浮条地基)

### 设计决策

**A. 意见 = 叠加在文档上的一层,不污染原文**
- review 时给每段加意见,意见以「鲜明格式、每段后」呈现。
- 这一层有「脏」状态:想留存/外发 → 另存为一份 **review 版 md**;原文档保持干净,review 版是单独一份。
- 关闭时有未保存意见 → **复用现有脏文件提醒**(`confirmUnsavedChoice`:保存/放弃/取消)。
- **单向,不 round-trip**:导出的 review md 是快照,重新打开就是普通 md,Typola 不再解析回意见层(满足「给人看 / 喂 AI」两个用途,最省工)。

**B. UI:段后展开式意见卡(GitHub 行级 review 风格)**
- 被批注文字高亮;意见以一张卡贴在那段**下方**展开 → review 时所见即所得地看到 review 版长什么样。
- 右栏配意见汇总列表(总览 + 跳转)。
- 技术:段后卡在 Vditor(contenteditable)里定位,与选区浮条同源(overlay 定位),一起验证。

**C. 发 AI 改:全文 + 所有意见 → prompt → 产物回流**
- 不走浮条的 oneshot(全文改是大操作,要可见可控)。
- 改后的全文作为**新产物回编辑器**(复用 M2 产物回流)。

**D. 行内意见格式(每段后)**
```
> **检视意见，请处理**:<意见内容>
```
- 不带 emoji;`**检视意见，请处理**` 开头既是给协作者的标识,又是给 AI 的内嵌指令(发 review md 过去 AI 直接懂要改)。

### 两个外发用途(共用 review md)
1. 给协作者看 — 人类可读的 review 版 md。
2. 喂 AI 改 — 行内「请处理」即指令。

### 落地拆解

1. **检视状态层** — 当前文档的意见列表(锚点 + 原文片段 + 意见文本)+ 脏标记,内存维护。锚点复用 `findUniqueAnchor`/`prefixHint`。
2. **加意见入口** — 复用选区浮条,加一个「加检视意见」动作。
3. **段后意见卡 UI + 高亮 + 右栏汇总列表**。
4. **导出 review md** — 把意见按格式 D 合成进每段后,另存为新 md。
5. **发 AI 改** — 全文 + 意见拼 prompt → 产物回流。
6. **关闭脏提醒** — 复用 `confirmUnsavedChoice`。

---

## 三、复用的现有地基(工程量没想象大)

- anchor 机制:`findUniqueAnchor` / `prefixHint` / `validateAnchor` / `replaceRange`(选区定位 + 替换,浮条和检视都用)
- 产物回流(M2):AI 改完的全文作为新产物回编辑器
- 脏文件提醒:`confirmUnsavedChoice`(检视未保存复用)
- 选区浮条入口:检视的「加意见」复用

## 四、实施顺序

1. **选区浮条** — 先做,给检视铺好 anchor + overlay 定位地基。
   - 关键路径:`runSkillOneshot`(核心)→ `SelectionFloatingBar` → `SelectionResultCard` → `handleEditorAIAction` 分流。
   - 最小验证:先把 `runSkillOneshot` + 「润色」一个动作的原地闭环跑通。
2. **文档检视** — 后做,复用浮条的入口 + overlay + anchor。

## 五、范围红线(不做)

- slash 命令(本期砍)
- 浮条塞 skill
- review md round-trip(单向快照即可)
- 气泡式批注(用段后卡)
- 选区浮条的视觉「自动浮现」之外的花哨动效(保持克制,文档为中心)
