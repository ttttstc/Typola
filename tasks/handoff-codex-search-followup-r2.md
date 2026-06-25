# Handoff R2 — codex/pdf-export 实测后回归问题(Codex 修复)

上一轮 codex commit `90a52a2` 修复了浮条干扰(✅)和锚点偏移到 `rd` 的具体场景(✅),但实测发现 3 个新 P0 + 删了 Bug 3 修复 + 单测覆盖大幅缩水。**两个 P0 会破坏用户文档,必须先修**。

实测环境:`codex/pdf-export` 分支 commit `90a52a2`,本地 build `src-tauri/target/release/typola.exe`(2026-06-25 ~10:00 build)。
测试文档:
```md
# Search Test

foo bar foo bar baz

_alpha_ _beta_ _gamma_

foo first foo second foo third beta last
```

行为标准:对齐 Typora。

---

## P0-A:Ctrl+F 第二次打开焦点不切到输入框 → type 注入文档(数据破坏!)

**复现**:
1. Ctrl+F 打开搜索,输入 `beta`,Enter 跳转。
2. **Esc** 关闭搜索。
3. 再 Ctrl+F 打开搜索 —— 输入框里上次的 `beta` 还在,但**焦点不在输入框**。
4. 键盘输入 `foo` —— **`foo` 被打到文档里**,光标停在哪就插哪;搜索框依然显示 0/0(在搜旧 `beta`,但文档里 `beta` 已被替换成 `foo`)。

实测截图证据:测试文档原本第 4 段是 `foo first foo second foo third beta last`,操作后变成 `foo first foo second foo third foo last`(`beta` 被替换为 `foo`)。

**对比 Typora 行为**:每次 Ctrl+F 打开搜索都:聚焦输入框 + 全选输入框现有文本(方便覆盖输入新词)+ 阻止键盘事件冒泡到编辑器。

**怀疑路径**:`src/components/FindReplacePanel.tsx`(本轮也改了 9 行)的焦点逻辑。或者 `AppLayout.tsx` 里 `findVisible` 切 true→false→true 时,FindReplacePanel 没拿到「重新打开」事件因而不抢焦点。

**修复要点**:
- Ctrl+F 触发时,**强制**让搜索输入框 `.focus()` + `.select()`(选中现有文本)
- 如果搜索框本来就开着再次按 Ctrl+F,仍然抢焦点 + 选中
- 给搜索输入框加 `onKeyDown` `stopPropagation`,防止键事件漏到编辑器

**验收**:
1. Ctrl+F → 输入 → Esc → 再 Ctrl+F → 直接输入新词,新词进搜索框,文档不动
2. 输入框里有词时再 Ctrl+F,词被全选,可直接 type 覆盖

---

## P0-B:WYSIWYG 搜索漏匹配 — IR 斜体里的 `_beta_` 找不到

**现象**:测试文档搜 `beta`,显示 `1/1`,**只找到末段那个 beta**。`_alpha_ _beta_ _gamma_` 行里的斜体 `beta` 漏了 —— 应该是 `2/2`,跳第一次是斜体 beta,跳第二次是末段 beta。

**根因**:codex 改用 `findTextNodeRange(root, text, occurrenceIndex)` 在 IR DOM 里走 textNode TreeWalker 找第 N 个匹配 —— 这依赖 IR DOM 里 textContent 完整包含搜索词。但 `_beta_` 在 IR 里被 Vditor 渲染成另一种结构(见 P0-C),text 没有 `beta` 直接出现 → walker 找不到。

更深一层:`getSearchMatchOccurrenceIndex` / `findTextNodeRange` 的实现只看 IR text,**应该回退到 source 全文匹配 + 拿到 source 偏移再映射回 IR**,而不是只在 IR text 里找。或者让 IR 在 `_beta_` 的真实 textNode 里仍然包含 `beta` 子串。

**修复要点**(二选一,看哪个改动小):
- 方案 1:`findTextNodeRange` 失败时,fallback 到旧的 source→IR 映射(documentSearchService 里那块大刀阔斧删掉的逻辑,可以挑核心保留)
- 方案 2:在 IR 渲染稳定的前提下,搜索词分别在「source 文本」和「IR textContent」匹配,取并集再去重

**验收**:
1. 上述测试文档搜 `beta` 显示 `2/2`
2. 跳第一次选中斜体 beta(在 `<em>` 节点内),第二次选中末段 beta

---

## P0-C:Vditor IR 渲染 `_alpha_ _beta_ _gamma_` 损坏(`_beta_` 视觉消失)

**现象**:新建文档输入 `_alpha_ _beta_ _gamma_`,IR 显示为两行:
- `alpha _`
- `_ gamma`

`_beta_` 这一段(包括前后空格)整段消失。原 build(`951b53c`)同样输入渲染正确(一整行斜体 `alpha beta gamma`)。

**怀疑**:codex 本轮可能动了 WysiwygEditorPane 里 IR collapse/expand markers 或 Vditor 输入处理的逻辑(本轮 WysiwygEditorPane 改了 +119/-? 行)。

**排查**:
1. 跟 commit `951b53c` 的 WysiwygEditorPane.tsx diff,看本轮是否动到 `collapseExpandedMarkers` / `scheduleCollapseIdle` / `silenceCodeBlockAssist` 这些
2. 重现:在新文档里**一次性 type**(或粘贴)`_alpha_ _beta_ _gamma_\n`,观察 IR
3. 对比旧 `951b53c` build 同样操作的 IR

**验收**:
1. 新建文档,输入 `_alpha_ _beta_ _gamma_` 回车,显示 `alpha beta gamma`(整行斜体,正常 IR 折叠)
2. 与 commit `951b53c` 的渲染一致

---

## P0-D:Bug 3 修复被误删,需恢复

**问题**:codex 本轮删了

- `src-tauri/tauri.conf.json` 的 `"visible": true`
- `src-tauri/src/lib.rs` 单例回调里的 `unminimize+show+focus` 代码块(13 行)
- `RunEvent::Opened` 的 cfg 守卫调整

`951b53c` 的 commit message 明确写「窗口不可见 三连修」是 PR 的核心目标之一。本轮 commit message 只说「搜索跳转和浮条干扰」,**不应该改 Tauri 启动代码**。

**实测**当前 build 启动可见(因为 `maximized: true` + 默认 visible 行为兜底),但:
- 单例场景(已运行时再双击 exe)失去恢复窗口的保护
- 非 maximized 状态下窗口可能再次出现 visibility 问题

**修复**:把删掉的恢复回去(可以直接 cherry-pick `951b53c` 的 tauri.conf.json / lib.rs 部分)。

---

## P1:单测覆盖大幅缩水(确认是否有意)

`src/services/documentSearchService.test.ts` 从 16+ 测删到 4 测(-100 行)。如果是因为重构后旧测的契约改变所以删了,需要**重新写覆盖新实现的边界用例**,至少:

- 同段多个匹配(`foo foo foo`)
- 跨段匹配(段一末尾 + 段二开头)
- IR inline token 内匹配(`_beta_` / `**beta**` / `` `beta` ``)
- IR inline token 边界匹配(`_alpha_beta_gamma_` 紧邻)
- 大小写不敏感开关
- 空 query / 单字符 query

请补回来。否则下次回归无人接住。

---

## 验收清单

`npm run tauri:build:local` 后,**手动**实测:

```
测试文档:
# Search Test
foo bar foo bar baz
_alpha_ _beta_ _gamma_
foo first foo second foo third beta last
```

- [ ] **P0-A**:Ctrl+F → "beta" → Enter → Esc → 再 Ctrl+F → 直接 type "foo" → "foo" 进搜索框,**文档完全不动**
- [ ] **P0-B**:Ctrl+F → "beta" → 显示 `2/2`,Enter 跳斜体 beta,再 Enter 跳末段 beta
- [ ] **P0-B 续**:无浮条弹出(Bug 2 回归保护)
- [ ] **P0-C**:文档 `_alpha_ _beta_ _gamma_` 显示成完整一行斜体 `alpha beta gamma`
- [ ] **P0-D**:`tauri.conf.json` 有 `"visible": true`,`lib.rs` 单例回调有 unminimize+show+focus
- [ ] **P1**:`documentSearchService.test.ts` 至少 10 个 test,覆盖以上 6 类边界
- [ ] 启动 typola.exe 仍然窗口可见(回归保护)
- [ ] `dist/assets/` 仍然有独立 `DiffReviewPane-xxxx.js` chunk(P0-3 不能丢)

全部通过提交到 `codex/pdf-export` 同一分支(或新分支),报告上来。
