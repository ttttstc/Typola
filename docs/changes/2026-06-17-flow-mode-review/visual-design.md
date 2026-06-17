# 心流模式 MVP · 页面设计评审

## 评审人
subagent: visual-design · 2026-06-17

## 总评

整体视觉语言与 Typola 既有的「纸感暖米/克制深灰」系统高度一致 —— `--bg: oklch(97% 0.012 80)` 的暖白底色、`--accent: oklch(58% 0.16 35)` 的单色暖红强调、`--panel-bg/control-bg` 的半透明分层 —— 心流模式没有引入第二套色板,这点非常正确(参见 `src/styles/app.css:3-46`)。5 个区域(左文件树 / 中编辑器 / 右场景-预览切换 / 底 agent 终端 + 冲突条)的视觉重量基本守住了「编辑器是主角」的承诺:终端用 `--surface 92%` 偏暗面板 + 渐变背景 + `box-shadow 0 -10px 30px` 反向上浮(4044-4054),与编辑器纸面形成层次差;右栏 `--bg` + 16px 内边距(2083-2087)与编辑器背景对齐,避免抢戏。

**最大亮点**:产物 chips 的视觉语言 + sandbox iframe 灰底白卡片(`artifact-render { background: var(--surface); border: 1px solid var(--border-soft); }` 2440-2442)是 MVP 中最有「NotebookLM Studio 味」的一段 —— 与 spec §6.2 的对位意图完全一致。

**最大问题**:终端 tab 头部状态点是**单一维度**信号(只有颜色不同:success / accent / muted / danger),没有"运行中/空闲/退出"的呼吸动效或图标区分。fanbox 的标签圆点 + 终端边缘呼吸是 spec §5.2 的对位标杆,目前 4115-4138 只用了静态色块,在长任务跑起来时用户视觉上分不清"正在跑"还是"挂起"。其次,场景卡 `scenario-card-icon` 的 32×32 暖白底盒子(2189-2198)在 grid 单卡布局下偏厚重,与下方 12-14px 的标签/描述之间视觉密度断层明显(2189-2210 整体 gap=6px)。

---

## 7 项问题清单意见

### 1. 信息层级
**现状**:
- 编辑器 `--bg` 与右栏 `.flow-panel { background: var(--bg) }` 同色(2035),视觉权重等同 → 右栏开/关不打断中心
- 终端独立 `--surface 92%` 偏深 + 顶部 `--border` 1px + 反向 `box-shadow`(4044-4054) → 自然下沉的"抽屉"
- `flow-panel-tabs` 用 2px 下边线 + `--accent` 区分当前 tab(2065-2068)→ 经典 underline-tab 风,但**和右栏其他控件**(`word-preview-header` 1373-1376、`.editor-tabbar` 307-316)**都用 1px `--border-soft`** 区分,导致"tab 切换"和"分段控件"的视觉强度趋同

**问题**: **场景/预览分段和"上下文切换"层级相等** —— 用户在心流模式内切到「预览」时,视觉上感觉和切到「Word 预览/公众号预览」是同一档动作,但实际语义完全不同:右栏 tab 切换是「内容分区」,Word/公众号是「面板模式」。这是 MVP 一个**潜在的视觉欺骗**(不算 bug,但容易让用户忽略 tab 切换)。

**建议**: `.flow-panel-tabs button.active` 的 2px 下边线 + accent 颜色(2065-2068)已是正确方向,但**右栏顶部也要和 word-preview-header 在视觉权重上拉开距离** —— 给 `.flow-panel-tabs` 加一个稍粗的底边(比如 `border-bottom: 1px solid var(--border)` 而不是 `--border-soft`,或加个左侧 3px accent 竖条标识 AI 区域)。

### 2. 节奏与留白
**现状**:
- 场景卡 grid `gap: 10px` 2161,卡片内 padding `14px` 2169 → 单卡体积 ≈ 174×96px,呼吸适中
- chips 间距 `gap: 6px` 2377,chip 内 `padding: 4px 10px` 2384 → 密度合适
- `flow-panel-content` padding `16px` 2086 → 与 word-preview 一致
- 场景卡 detail 区 padding `12px` 2215 + guidance 内 padding `12px` 2223,**两层 12px 嵌套**(detail 外 + guidance 内)→ 实际内部 padding 达 24px,在 320px 右栏下 guidance 实际可用宽度被吃掉 ~50px

**问题**: `scenario-detail > .scenario-guidance` 的双层 padding 是**显式冗余** —— 外框 12px + 内框 12px 把内容逼成窄列;而且 guidance 用的 `var(--font-mono)` 12px 行高 1.5(2225-2232),在 280px 可用宽下中文每行只能放 ~14 字,读起来比 spec.md 还挤。

**建议**: 把 `.scenario-guidance` 的 padding 砍到 `8px 10px`(或干脆去掉内框,用 `.scenario-detail` 的 12px 单层),同时 guidance 区改用 `--font-reading` 14px 行高 1.6(匹配正文阅读密度,不是代码字体)。

### 3. 配色与主题
**现状**:
- accent 全身统一(`--accent: oklch(58% 0.16 35)` 12 行,深色变体 55 行)→ 没有第二套强调色
- `scenario-card-icon` 32×32 用 `--surface` 底 + `--accent` 图标(2189-2198)→ 单卡图标在白卡片里跳出来
- `scenario-apply-btn` 用纯 `--accent` 底 + `white` 字(2267-2270)→ 唯一实色填充按钮,成功抢到主操作
- 终端用独立灰底(`#fffdfa` / 深色 `#1f1d1a` 4225-4230)→ 与编辑器纸面区分,**故意脱离 oklch 主题变量**

**问题**: 终端背景硬编码 `#fffdfa` / `#1f1d1a`(4225-4230)是**反主题系统的一笔**。其他面板全部走 oklch 变量,唯独终端用 hex —— 这意味着未来想换"皮肤"时,终端会是个漏网之鱼。同时 `terminal-body` 用了 `radial-gradient(circle at 0 0, accent 8%, ...)`(4215-4216)做左上角 accent 晕染,**亮色模式下几乎不可见**(8% accent 透明度 + 暖白底 = 没差),在深色模式又有点突兀。

**建议**:
1. 终端 session 背景换成 `color-mix(in oklch, var(--surface) 90%, var(--bg))` 这样的变量,跟主题走
2. `terminal-body` 的 radial-gradient 改成 `circle at 0 0, accent 4%, transparent 28%`,亮色暗色都压低强度,**克制使用 accent**

### 4. 视觉反馈
**现状**:
- 文件树 `agent-changed` 用 `border-left: 2px solid --accent` + 1.5s `agent-changed-pulse` 关键帧(2473-2482)→ **有动画**,1.5s 后停
- chips active 用 `--accent` 边框 + `--accent` 字 + active 背景(2400-2404)→ 三重视觉提示
- 终端 tab status 用 6×6 圆点 + 颜色(4115-4138)→ **静态色块**
- `external-change-conflict` 用 accent 12% 底 + accent 30% 边框 + 主文字 + 三个按钮(2314-2345)→ **视觉重量足够**
- artifact loading 居中 "加载中..." 文字(2464-2469)→ **无 spinner,无骨架屏**

**问题**:
1. **artifact loading 没有进度反馈** —— `invoke('read_opened_document')` 异步读 HTML 可能要 100-500ms,这期间只有 "加载中..." 静态文字,在 1.5MB 的 HTML 下用户会以为卡住(2464-2469)
2. **终端 connecting/ready 区分太弱** —— 4115-4138 的 6px 圆点只有颜色差异(绿/橙/灰/红),且圆点周围没有脉冲动画。"connecting" 和 "exited" 在视觉上都像"静止"
3. **artifact chip 没有"刚刚落盘"的脉冲动效** —— spec §6.2 明确要求"落盘瞬间:对应 chip / 树节点脉冲一下"(2449 行 spec:164),**文件树做了 `@keyframes agent-changed-pulse`(2479-2482),但 chips 完全没动画**

**建议**:
1. 加 `.artifact-loading::before { content: ''; animation: typola-spin 0.9s linear infinite; }` 或骨架条
2. `.terminal-tab.connecting::before` 加 `@keyframes` 呼吸(类似 `agent-changed-pulse` 但 1s 循环不止)
3. `.artifact-chip` 加 `:not(.active).just-changed` 状态,落盘时套同款 1.5s 脉冲(可复用 `@keyframes agent-changed-pulse`)

### 5. 可发现性 affordance
**现状**:
- 「应用到终端」按钮:实色 accent 底 + white 字(2267-2270)→ 视觉重量 ✓
- 「编辑场景」按钮:`scenario-edit-link`(2139-2156)用透明底 + 1px `--border-soft` + `--muted` 字 → **典型 "link-like" 弱 affordance**
- artifact chips 是"单击切预览 / 双击在主编辑器打开"(88-91 行,`onClick` 单击 setActivePath,`onDoubleClick` 调 onOpenFile)→ **没有任何文字提示**
- terminal-actions 区 6 个图标按钮:`+` / `Copy` / `Paste` / `Maximize2`(实际是全选)/ `Eraser` / `Stop`(438-456)→ **全选按钮用了 Maximize2 图标是误导**,Maximize2 在 IDE 习惯里是"最大化终端"而非"全选文本"
- flow-panel-close 用裸 `×` 字符(1493)→ 与 `.editor-tab-close`(1657)、`.unsaved-dialog-actions` 关闭按钮风格一致,**整应用统一**

**问题**:
1. **`复制命令` vs `应用到终端` 的按钮权重对比**:`scenario-apply-btn` flex:1 占满,`scenario-copy-btn` flex:0 0 auto(2256-2265)→ 二级按钮视觉轻;但 button 文案"复制命令"看起来像主要动作(同尺寸字号),用户第一眼可能犹豫
2. **artifact chip 单击 vs 双击无任何 hint**(ArtifactPreview.tsx:87-92)—— 只有 title 提示"双击在主编辑器打开",鼠标悬停才看得到。spec §6.2 也明确说"点 chip 切预览",但产品语义模糊:用户期望单/双击哪个打开编辑器?
3. **terminal-actions 的 Maximize2 图标语义错位** —— 全选在 xterm 里有标准约定是 `⌃A` 或专门一个 `Select All` 图标(类似 checklist / mouse-pointer-square),Maximize2 让用户以为是"把终端拉到全屏"

**建议**:
1. `scenario-copy-btn` 加 `font-size: 12px` 或换成 icon-only + title,让主次更分明
2. artifact chip 加一个 `aria-label="单击预览,双击在主编辑器打开"` + 视觉上的小箭头/外链图标(比如 chip 右侧 8×8 的 `ExternalLink` 图标暗示"双击打开外部")
3. terminal-actions 全选按钮换图标,改成 `MousePointerSquare` 或 `ListChecks`(lucide-react 自带)

### 6. 响应式退化
**现状**:
- 右栏 clamp `320px ~ calc(100% - 620px - 9px)`(404-410)→ 主编辑器最低 620px,右栏最窄 320px
- 终端高度 `min-height: 180px; max-height: 520px`(4048-4049)→ 用户可拖动到 180-520
- 场景卡 grid `repeat(auto-fill, minmax(160px, 1fr))`(2160)→ 320px 宽最多 2 列
- @media (max-width: 950px) 的右栏 flex-basis 调整(437-446)→ 只动了右栏宽度,**没动终端**

**问题**:
1. **没有针对终端高度的自适应断点** —— 720p 屏幕(高度 720,扣掉 toolbar 44 + 状态栏 22 = 654),终端开 300px 时编辑器剩 330px,在 WYSIWYG(Vditor)模式下渲染宽屏文章会**纵向变窄**触发大量滚动。spec §11 验收"中文宽字符正确"但**没说纵向密度**
2. **场景卡 grid 在 320px 宽度下变 2 列,在只有 1 张卡时显得空** —— 右栏顶部 16px padding + grid 10px gap,单卡右上角"编辑场景"小按钮(2139-2156)会跟卡片标题抢视觉焦点
3. **scenario-card-label 14px + scenario-card-desc 12px**(2200-2209)在 320px 减去 14px*2 padding + 32px icon = **描述文字可用宽度约 220px**,每行 12px 中文约 14-16 字,2-3 行截断
4. **artifact-chip max-width: 200px**(2392)+ chips-wrap 容器,在右栏 320px 下**单行最多 1 个 chip**(剩下 120px 不够第二个 chip),长产物列表视觉上像垂直堆叠

**建议**:
1. 终端默认高度根据窗口高度算:`height = clamp(180, (windowHeight - 400) * 0.4, 520)`,类似 `getDefaultRightPanelWidth` 的做法
2. 场景卡 grid 改成单卡时 `grid-template-columns: 1fr`,多卡时 `repeat(auto-fill, minmax(160px, 1fr))`
3. artifact-chip `max-width: 180px`(在小右栏下更紧凑),或允许 chip `flex: 1 1 auto` 让多个 chip 平分宽度

### 7. 视觉对位竞品
**现状对位**:
- **NotebookLM Studio 卡** → 场景卡 grid + 详情卡 + 主操作按钮,Typola 实现程度 **80%**(2164-2198 + 2250-2292),差距在 Notion 风 hover 阴影 / 卡片点击时的微浮起 (`scenario-card:hover` 只有底色变化,2180-2182)
- **fanbox 终端嵌入** → 终端作为底栏 + tab 切换 + 状态色点,Typola 实现 **90%**(4044-4054 + 4096-4138),差距在状态点的脉冲动效和终端边缘呼吸(竞品强项,fanbox README §3.1 列出)
- **tolaria 卡片** → 注册表驱动 JSON + 单场景卡 MVP,Typola 实现 **70%**(ScenarioPanel.tsx 整个文件),差距在卡片"插画/视觉锚点"(tolaria 给每个 agent 一张封面图),MVP 1 张卡时不强求

**问题**: **整体克制度 ✓,但场景卡 hover 反馈偏弱** —— NotebookLM 的 Studio 卡 hover 时会有 2-4px 上浮 + 阴影加深,Typola 的 `scenario-card:hover` 只有 `background + border-color` 变化(2180-2182),没动 `transform` 或 `box-shadow`,**触觉感不强**。另外 `.scenario-card.active` 也只是边框换色(2184-2187),没有"已选中"的加强重量。

**没有"为了像而像"的痕迹** —— 没看到 NotebookLM 那种大色块 hero、没看到 fanbox 那种强色实体图标(用 --surface 中性底)、没看到 tolaria 那种发光按钮。视觉语言忠实于 Typola 自己的克制调性,这一点**很好**。

**建议**:
1. `.scenario-card:hover { transform: translateY(-1px); box-shadow: 0 4px 12px var(--paper-shadow); }` 给出 1px 上浮,补足 NotebookLM 的卡片物理感
2. `.scenario-card.active { box-shadow: 0 0 0 2px color-mix(in oklch, var(--accent) 20%, transparent); }` 让选中态有"圈选感"
3. 在 `scenario-guidance` 顶部加 1px accent 竖条(`border-left: 3px solid var(--accent); padding-left: 12px`),让 guidance 区成为视觉锚点(spec §5.3 要求"选中后内联展开")

---

## 优(视觉上值得保留)

1. **`--bg / --surface / --panel-bg / --control-bg` 的 4 层半透明分层** —— app.css:5-25 一套完整层级,亮色暗色变量对称,心流模式 5 个面板都在这套变量上构建,**没有第二套色板**(这是我见过的扩展性最强的克制做法)
2. **`agent-changed-pulse` 1.5s ease-out 关键帧** —— app.css:2479-2482 的 `@keyframes` 用 oklch 18% → 8% 衰减,加上 `border-left: 2px solid accent`,**单条规则同时给出"位置 + 强度 + 时间"三维信号**,值得复用
3. **`terminal-body` 的 radial-gradient 左上角晕染** —— app.css:4214-4216 试图给终端"一点生气",思路对(终端是心流模式的灵魂,要"活"起来),只是强度需要再压(见问题 3)
4. **`artifact-render` 的灰底白卡片 iframe 容器** —— app.css:2435-2450 的两层结构(`surface` 边框 + iframe `background: white`)是少见的**容器和内容异色**设计,既保留了"这是 agent 产物,跟我的文档不是一回事"的语境,又不抢焦点
5. **`scenario-panel` 的 `<h3 class="scenario-title">` 用 `text-transform: uppercase; letter-spacing: 0.05em`** —— app.css:2130-2137 的"小标题"样式,跟 word-preview 和 wechat-preview 的 `h2` 标题统一,**全应用的"分组标题"语言一致**

## 问题(按优先级)

### P0(必修)
无阻塞性视觉 bug,以下是**必改的"视觉欺骗"**:

- **artifact chip 缺少落盘脉冲动效** —— spec §6.2 明文要求"落盘瞬间:对应 chip / 树节点脉冲一下",文件树做了(2479-2482),chips 完全没动画,违反 spec

### P1(重要修)

- **终端 tab 状态点无脉冲** —— TerminalPanel.tsx:4115-4138 的 6px 圆点只有静态颜色,长任务跑起来用户分不清"在跑"还是"挂起"
  - 建议:`.terminal-tab.ready::before { animation: typola-pulse 2s ease-in-out infinite; }`
- **artifact loading 文字无 spinner** —— ArtifactPreview.tsx:106 静态文字,invoke 100-500ms 期间无视觉反馈
  - 建议:加 `.spinning` 类(已有 `@keyframes typola-spin` 3972-3974,直接复用)
- **`scenario-guidance` 双层 12px padding** —— CSS 2222-2232 的外 detail 12px + 内 guidance 12px 嵌套,把内容挤到 220px 宽以下,中文阅读密度太差
  - 建议:内 padding 砍到 8px 10px,或干脆砍掉外层 detail 的 padding
- **`terminal-actions` 的 Maximize2 图标语义错位** —— TerminalPanel.tsx:447-449 全选用了 Maximize2,IDE 习惯是"最大化终端"
  - 建议:换 lucide `MousePointerSquare` 或 `ListChecks`
- **artifact chip 双击打开无视觉提示** —— ArtifactPreview.tsx:88-91 的双击行为没有 on-screen hint
  - 建议:chip 右侧加 8×8 `ExternalLink` 图标暗示"会跳出去"

### P2(可优化)

- **场景卡 hover 缺物理感** —— app.css:2179-2182 只有底色变化,NotebookLM 风应该有 1px 上浮 + 阴影
- **场景卡 active 态加强圈选** —— app.css:2184-2187 边框换色但没阴影,选中感弱
- **终端 hex 硬编码 `#fffdfa / #1f1d1a`** —— TerminalPanel.tsx:133-135 + app.css:4225-4230 与主题变量系统脱节,未来扩展三套皮肤时会成漏网之鱼
- **`terminal-body` radial-gradient accent 8% 在亮色下几乎不可见** —— app.css:4214-4216,8% 暖红 + 暖白底 ≈ 没差,改成 4% + 缩小范围到 28%
- **右栏 tab 切换与 Word/公众号切换的视觉强度趋同** —— flow-panel-tabs(2065-2068)和 word-preview-header(1373-1376)都用 1-2px 细线,用户分不清"内容分区"和"面板模式"
- **artifact-chip max-width 200px 在 320px 右栏下挤** —— app.css:2392,改成 180px 或 `flex: 1 1 auto`
- **artifact-markdown 和 artifact-text 用 `--font-mono` 12px** —— app.css:2452-2462,markdown 预览用 mono 字读起来像代码,应该用 `--font-reading` 14px(预览的本质是阅读)

## 评分
⭐⭐⭐⭐ / 5

视觉语言与既有系统 100% 兼容、信息层级基本守住、accent 单一克制,够 MVP 标准;扣 1 分因为**终端状态反馈静态 + chips 缺落盘脉冲**是两个直接违反 spec §6.2 的视觉债,且 chips 单/双击 affordance 模糊是潜在的"用户疑惑点"。

## 5 条 actionable 建议

1. **加 `.artifact-chip.just-changed` 脉冲动效**:复用 `@keyframes agent-changed-pulse`(app.css:2479-2482),AppLayout 在 `agentChangedPaths` 新增条目时给对应 chip 加 1.5s `just-changed` 类,1.5s 后移除。这是 spec §6.2 闭环的关键 UX 承诺。
2. **改 `.terminal-tab.ready::before` 加呼吸脉冲**:用 `@keyframes typola-pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.4 } }` 2s 循环,只有 `ready` 状态脉冲(connecting 不脉冲因为本就是中间态),让用户远距离能看出"正在跑"。
3. **修 `.scenario-card:hover` 加 1px 上浮**:改成 `transform: translateY(-1px); box-shadow: 0 4px 12px var(--paper-shadow); transition: transform 0.15s, box-shadow 0.15s;`(app.css:2176 起),补足 NotebookLM 风的物理感。
4. **改 artifact chip 右上加 8×8 `ExternalLink` 图标**:在 `<span class="artifact-chip-name">` 后面加 `<span class="artifact-chip-ext"><ExternalLink size={10} /></span>`,CSS `.artifact-chip-ext { opacity: 0; } .artifact-chip:hover .artifact-chip-ext { opacity: 0.7; }`,hover 才出现,**视觉暗示"这个 chip 还能跳出去"**,解决单/双击 affordance 模糊。
5. **把 `terminal-actions` 全选按钮的 Maximize2 图标换成 `MousePointerSquare` 或 `TextCursor`**:TerminalPanel.tsx:448 的 `Maximize2 size={15}` 改成 `MousePointerSquare size={15}`,1 行代码消除最严重的图标语义误导。
