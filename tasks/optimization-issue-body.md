## 背景

M2.5 SkillHub 三 PR(#148 / #149 / #150)合并后,用 `/impeccable critique` 视角审视
PR #150 的 UI 改动,挑出 7 个可优化项。本 issue 跟踪全部修复。

> 来源:`/impeccable` critique;原始 PR 设计 3 stacked PR 干净,但 UI 上同时撞了
> PRODUCT.md「沉静·编辑·在场」的反模式 + 一些 affordance 歧义。

## 优化项(按 criticality)

### 🚨 P0:builtin 三连矛盾(`SkillHubPanel.tsx`)

UI 上 builtin card 同时显示:
- 「内置」badge(用户读:不需要安装)
- 「未安装」badge(`installed: Boolean(local)` 永远 false)
- 「让 Claude 安装」按钮(语义上不需要)

按 PR 2 review 口径:click 仍走 `onInstallSkill`。修复方法:**builtin card 隐藏「让 Claude 安装」按钮**,因为整个 card 已是 activation affordance。装态映射:

| 状态 | badge | 按钮 |
|---|---|---|
| builtin | 内置 | 无(card 即激活) |
| regular installed | 已安装 | 无 |
| regular uninstalled | 未安装 | 让 Claude 安装 |

UX 上的 affordance 不再矛盾,click 行为不变。

### 🟡 P1:`.skill-hub-category-title` 撞 AI 2023 kicker 禁令

当前:
```css
font-size: 11px;
text-transform: uppercase;
letter-spacing: 0.05em;
color: var(--muted);
```

这是 SKILL.md 明确禁令的「uppercase + tracking + 11px」AI scaffold;且不符
Typola「沉静·编辑·在场」品牌。改:

```css
font-size: 12.5px;
font-weight: 600;
color: var(--fg);  /* 不再用 muted */
margin: 0;
```

JSX 加 count:`<h3>推荐 skill · 6 个</h3>`(已有章节计数信息,但目前用 toolbar 区段另外显示)。

### 🟡 P1:`.skill-hub-output` 英文 ALL CAPS chip 不符中文写作者用户

产品定位是「中文写作者」(`PRODUCT.md` Users)。当前渲染 `[HTML]` `[MARKDOWN]` `[PDF]`
全大写英文 mono chip,跟「沉静·编辑·在场」品牌对冲。**方案**:完全删 chip,降级到 summary 下方的 `<small class="skill-hub-item-meta">` 一行轻量元数据:

```tsx
<small className="skill-hub-item-meta">
  {skill.builtin && <span>内置 prompt-only</span>}
  {skill.output && <span>产物 {skill.output}</span>}
  {sourceUrl && <a>来源 GitHub</a>}
</small>
```

`.skill-hub-item-meta` 新加 CSS:11px muted 行内 gap 4px,符合 Typola「克制元数据」。

### 🟡 P1:CSS hardcoded OKLCH 抽 token

`.skill-hub-badge.builtin` 和 `.skill-hub-badge.installed` 用了三组 hardcoded OKLCH。
抽到 `:root`:

```css
:root {
  --status-positive-fg: oklch(46% 0.12 150);
  --status-positive-bg: oklch(75% 0.13 150 / 0.14);
  --status-positive-border: oklch(62% 0.12 150 / 0.28);

  --status-info-fg: oklch(46% 0.12 240);
  --status-info-bg: oklch(75% 0.13 240 / 0.14);
  --status-info-border: oklch(62% 0.12 240 / 0.28);
}
```

让两个 badge 风格一致,以后改主题不用一对一追。

### 🟠 P2:empty state 弱化,该 teach

```tsx
// 当前:
<p className="skill-hub-category-empty">
  还没有自定义 {capabilityLabel},点击右上角添加本机已有 {capabilityLabel}。
</p>
```

`font-style: italic + 12px + muted` 是「弱化」,不是「教学」。改成 inline hint 卡 + 「去添加」按钮:

```tsx
<div className="skill-hub-empty-hint" role="status">
  <span>把本机已安装的 {capabilityLabel} 加进来,场景里就能直接看到。</span>
  <button type="button" onClick={() => setAddDialogOpen(true)}>
    <Plus size={11} /> 添加
  </button>
</div>
```

调用 `setAddDialogOpen(true)` 需要把 `setAddDialogOpen` 从 useState 提到外面
(或改成 prop 回调)。现有 `setAddDialogOpen` 已在 SkillHubPanel 主函数里,直接引用即可。

### 🟠 P2:card 头部 chip 拥挤

P1 #3 删掉 output chip 后,剩下的「内置」+「source github icon」+「△missing-source」已经分散在 topline。一个简洁方案:
- 「内置」badge 移到 topline(类似现在)
- 来源 url + missing-source warning 放回原位

如果上面 P1 #3 也落地,topline 只剩 `[name] [内置] [github|△]`,3 个元素,可接受。

### 🟡 P1:`className` 三元链 helper

```tsx
className={`skill-hub-item ${skill.installed ? '' : 'is-disabled'}`}
```

后续如果加更多 state(updating、error…),会乱。抽 helper:

```ts
function skillItemClassName(skill: SkillCard): string {
  const classes = ['skill-hub-item'];
  if (!skill.installed) classes.push('is-disabled');
  return classes.join(' ');
}
```

## 不在本 issue 范围

- PR 4 范围仅 SkillHubPanel.tsx + `app.css` `.skill-hub-*` 段
- 不动 `skillHub.ts`(数据契约已定)
- 不动 `AppLayout.tsx`(PR 2 已 wiring)
- 不改测试的 `activeProvider="claude"` 模式(这是 product 现状,不是 PR 引入的)

## 验证

- typecheck ✓
- test ✓ 78+ 文件,所有现有 SkillHubPanel 测试必须通过 + 新加对应测试
- lint ✓ 0 errors

## 验收口径

PR 完成后:
- builtin card 上**没有**「让 Claude 安装」按钮
- section title 不再 uppercase + tracked
- output chip 消失,出现在 `<small class="skill-hub-item-meta">` 一行
- empty state 是带「去添加」按钮的卡,不是 italic paragraph

Refs: PR #150 (M2.5 UI section 拆分)
Refs: #75 (M2.5 parent)