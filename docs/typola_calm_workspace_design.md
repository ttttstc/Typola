# Typola Calm Workspace 完整设计方案

> 文档类型：体验设计方案 / Interaction & Motion Design Spec  
> 产品对象：Typola AI 文档工作台  
> 设计目标：优雅、简洁、有质感、解压、舒服、低维护  
> 技术原则：成熟库承担复杂交互，自研只做产品语义与视觉规范  
> 推荐依赖：`motion` + `@floating-ui/react` + `@formkit/auto-animate`  
> 不推荐：自研复杂动画框架、自研 tooltip 定位系统、自研共享元素布局系统

---

## 1. 背景

Typola 当前已经从普通 Markdown 编辑器逐步演进为 AI 文档工作台，具备本地 Markdown 编辑、阅读 / 心流 / 检视三态、Claude/OpenCode 本地 AI 执行、选区 AI、检视意见、AI 改稿、`.typola-output` 产物沉淀，以及 HTML / Word / PDF / 公众号 / PPT 等文档交付方向。

前期 issue #122 已经识别出若干动效缺口，包括文件树展开瞬切、tab 切换瞬切、左右栏 tab 状态直跳、状态栏字数直跳、保存状态缺少视觉反馈、搜索命中无 flash、AI 流式输出直贴、tooltip 仅 focus 可见、按钮按下反馈不足。

这些问题确实会影响 Typola 的高级感，但如果只修这些点，Typola 只会变成“更顺滑的编辑器”。

真正的目标应该是：

> **把 Typola 打磨成一个让人愿意长时间停留、低焦虑、低干扰、可信赖的 AI 文档工作台。**

因此，本方案将动效优化升级为完整体验系统：

```txt
Typola Calm Workspace
```

---

## 2. 设计愿景

### 2.1 一句话愿景

**Typola Calm Workspace 是一套面向 AI 文档工作台的安静、高级、低压交互体验系统，让用户在写作、AI 生成、检视修改和产物管理过程中始终感到清晰、可控、舒服。**

### 2.2 设计关键词

英文关键词：

```txt
Calm
Soft
Precise
Breathable
Trustworthy
Paper-like
Local-first
Crafted
Focused
Low-noise
```

中文关键词：

```txt
安静
柔和
克制
精准
有呼吸感
可信
纸感
本地
手作质感
专注
低噪声
```

### 2.3 产品气质

Typola 不应该像：

```txt
AI 聊天软件
炫技动效网站
复杂 IDE
视觉设计工具
信息密度爆炸的管理后台
```

Typola 应该像：

```txt
一张高级纸
一个安静书桌
一个有秩序的文档工坊
一个可信赖的 AI 产物工作间
```

---

## 3. 第一性原理

AI 文档工作台的体验压力和普通编辑器不同。

普通编辑器的压力来自：

```txt
我要写
我要改
我要找
我要保存
```

AI 文档工作台额外增加：

```txt
AI 现在在干嘛？
AI 会不会改坏？
AI 会不会覆盖我的原文？
AI 生成到哪里了？
AI 产物去哪了？
哪个版本可以采纳？
失败了是不是我配置错了？
产物能不能找回来？
```

因此，Typola 的体验设计不是为了“动起来”，而是为了降低不确定性。

解压感来自 4 个基础心理预期：

```txt
1. 我知道当前发生了什么。
2. 我知道下一步能做什么。
3. 我知道出错也不会丢东西。
4. 我知道界面不会突然打扰我。
```

所有交互和动效都必须服务这 4 件事。

---

## 4. 设计目标

### 4.1 总体目标

将 Typola 的体验从“功能可用”提升为“长时间使用舒服”。

核心目标：

```txt
内容优先
AI 可控
产物可追踪
状态可理解
动效低打扰
界面有呼吸感
性能稳定
```

### 4.2 用户体验目标

用户在 Typola 中应该感受到：

```txt
界面安静，不抢我的注意力。
主文档像一张清爽的纸。
AI 正在做什么，我能看懂。
AI 生成的东西不会丢。
修改不会直接覆盖原文。
失败也有退路。
工具栏和面板不会突然乱跳。
我可以长时间写作而不累。
```

### 4.3 设计约束

Typola 是生产力工具，因此必须避免：

```txt
过度弹跳
过强阴影
大面积 shimmer
强烈红黄提示
复杂背景动效
逐字符花哨动画
页面级大转场
阻塞输入的动效
影响滚动的动画
影响 IME 输入的动画
```

---

## 5. 设计原则

### 5.1 内容永远在最高层

主文档是第一主角。

所有面板、AI、产物、检视意见都只能辅助文档，不应抢夺正文注意力。

设计规则：

```txt
正文区域视觉权重最高
AI 面板不压迫主编辑区
产物卡片轻量陈列
工具栏默认弱化
hover/focus 时再增强
```

### 5.2 动效只表达状态，不做表演

动效必须回答一个问题：

```txt
刚刚发生了什么？
```

而不是：

```txt
看我多炫。
```

每个动效必须属于以下至少一类：

| 类型 | 作用 |
|---|---|
| 空间连续性 | 告诉用户元素从哪里来到哪里去 |
| 状态反馈 | 告诉用户操作已发生 |
| 注意力引导 | 让用户看到刚刚变化的地方 |
| 风险提示 | 温和提醒用户异常 |
| 节奏缓冲 | 避免界面突然跳变 |

### 5.3 降低 AI 不确定性

AI 工作台最核心的体验目标是降低不确定性。

因此必须明确展示：

```txt
当前使用哪个 Agent
当前使用哪个模型
当前工作区是什么
AI 可访问哪些上下文
AI 正在生成什么
产物写到了哪里
失败时原因是什么
是否产生了 partial artifact
```

### 5.4 所有状态都要有退路

尤其是 AI 改稿和产物操作。

规则：

```txt
AI 不直接覆盖原文
改稿先进入 revision artifact
可 diff 后采纳
删除产物必须确认
失败产物不隐藏
partial 输出可打开
保存失败可重试或另存
```

### 5.5 性能优先于华丽

性能边界：

```txt
优先 transform / opacity
避免频繁 layout animation
大列表不做逐项 stagger
长文本不做逐字符动画
CodeMirror 内只做必要 decoration
所有动画尊重 prefers-reduced-motion
支持低配 Windows 机器
不影响 IME
不影响滚动
```

---

## 6. 技术选型原则

### 6.1 最终结论

不要追求“零依赖”。

更合理的原则是：

```txt
复杂交互用成熟库；
业务状态自己定义；
视觉气质用 token 收敛；
不写长期维护成本高的底层动画框架。
```

### 6.2 推荐依赖

| 库 | 用途 | 是否引入 |
|---|---|---|
| `motion` | layout、共享元素、enter/exit、artifact card 动效 | 引入 |
| `@floating-ui/react` | tooltip、popover、dropdown 定位和可访问性 | 引入 |
| `@formkit/auto-animate` | 文件树、列表 reflow、tab 删除、产物列表重排 | 引入 |
| `react-spring` | 数字弹簧、物理动画 | 不引入 |
| `GSAP` | 时间轴、复杂 SVG、营销页动画 | 不引入 |
| `Lottie` | 装饰动画、onboarding 大动画 | 不引入 |
| `react-bits` | 现成动效组件合集 | 不引入 |

### 6.3 自研范围

只自研：

```txt
motion tokens
状态语义
AI streaming caret
CM6 search flash
少量 CSS utility
Typola 业务状态视觉
```

不自研：

```txt
复杂 tab indicator 测量系统
tooltip 定位系统
popover 碰撞系统
列表 enter/exit/reorder 系统
共享元素动画系统
复杂弹簧引擎
```

---

## 7. Motion Foundation

### 7.1 目标

建立全局动效基础，不让每个组件各写各的 duration/easing。

新增：

```txt
src/styles/motion.css
src/components/motion/MotionProvider.tsx
```

### 7.2 Motion Tokens

```css
:root {
  --motion-duration-instant: 80ms;
  --motion-duration-fast: 120ms;
  --motion-duration-base: 180ms;
  --motion-duration-slow: 260ms;
  --motion-duration-panel: 420ms;

  --motion-ease-out: cubic-bezier(0.2, 0, 0, 1);
  --motion-ease-standard: cubic-bezier(0.2, 0.8, 0.2, 1);
  --motion-ease-spring: cubic-bezier(0.32, 0.72, 0, 1);
  --motion-ease-pop: cubic-bezier(0.2, 0.9, 0.3, 1.1);

  --motion-distance-xs: 2px;
  --motion-distance-sm: 4px;
  --motion-distance-md: 8px;
}
```

### 7.3 标准节奏

| 类型 | 时长 | 说明 |
|---|---:|---|
| press | 80ms | 按下反馈 |
| hover | 120ms | hover 状态 |
| tooltip | 120ms + 400ms delay | 出现克制 |
| card enter | 160ms | 卡片进入 |
| panel content | 180ms | 面板内容切换 |
| search flash | 700-800ms | 命中提示 |
| mode switch | 360-420ms | 三态切换 |
| modal | 140-180ms | 弹窗进入 |

### 7.4 Reduced Motion

必须支持系统级 reduced motion。

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 1ms !important;
    scroll-behavior: auto !important;
  }
}
```

建议后续增加应用内设置：

```txt
动效级别
- 标准
- 减弱
- 关闭
```

---

## 8. 体验模块设计

## 8.1 Calm Surface：纸面层与布局呼吸感

### 8.1.1 目标

让主编辑区从“编辑区域”升级成“安静纸面”。

用户大部分时间都看着主编辑区。这里的质感决定 Typola 的整体气质。

### 8.1.2 三层结构

```txt
背景层：极浅环境背景
纸面层：主文档承载区域
内容层：Markdown 正文
```

### 8.1.3 视觉规范

```css
:root {
  --surface-app: oklch(97.5% 0.006 85);
  --surface-paper: oklch(99.2% 0.003 85);
  --surface-panel: oklch(98.2% 0.005 85);

  --shadow-paper:
    0 1px 2px rgba(20, 20, 20, 0.04),
    0 12px 40px rgba(20, 20, 20, 0.045);

  --radius-paper: 18px;
  --content-max-width: 820px;
  --content-line-height: 1.72;
}
```

### 8.1.4 交互规则

| 场景 | 体验 |
|---|---|
| 打开文档 | 纸面轻微 fade in |
| 切换文档 | 旧文档淡出 80ms，新文档淡入 140ms |
| 聚焦写作 | 工具栏弱化，纸面增强 |
| 鼠标离开编辑区 | 浮动控件淡出 |
| 长时间无操作 | 界面进入更安静的 idle 状态 |

### 8.1.5 不做

```txt
不做强纹理背景
不做大面积渐变
不做厚重玻璃拟态
不做强阴影
不做背景动效
不牺牲正文对比度
```

---

## 8.2 Mode Atmosphere：阅读 / 心流 / 检视三态体验

### 8.2.1 目标

阅读 / 心流 / 检视不是普通 tab，而是三种工作心境。

### 8.2.2 阅读模式

关键词：

```txt
清澈
安静
少控件
正文优先
```

设计：

```txt
左栏弱化
右栏默认收起或显示大纲
工具栏最小化
正文宽度舒适
悬浮控件低存在感
```

### 8.2.3 心流模式

关键词：

```txt
陪伴
生成
组织
产物
```

设计：

```txt
左侧 AI 任务台出现
右侧产物架出现
主文档仍保持中心
AI 输入框任务化
生成中状态柔和
```

### 8.2.4 检视模式

关键词：

```txt
精准
批注
差异
可信
```

设计：

```txt
右侧检视意见增强
正文选区锚点明确
AI 改稿产物自动聚合
Diff 有清晰层级
采纳动作可撤销
```

### 8.2.5 切换动效

使用 `motion`。

建议：

```txt
面板宽度：420ms spring
内容淡入：160ms ease-out
状态 indicator：layoutId
正文不剧烈移动
```

避免：

```txt
整页大位移
复杂转场
翻页动画
过强 scale
```

目标：

```txt
用户感觉工作环境调整好了，而不是页面在表演。
```

---

## 8.3 AI Task Bar：AI 输入体验任务化

### 8.3.1 目标

AI 入口不要像聊天框，而要像“文档任务台”。

### 8.3.2 结构

```txt
任务描述
上下文 chips
执行按钮
```

示例：

```txt
让 AI 帮我生成技术方案

上下文：
[当前文档 article.md] [STYLE.md 已启用] [Claude Code · sonnet]

[开始生成]
```

### 8.3.3 上下文 Chips

建议显示：

```txt
当前文档
选区
STYLE.md
Agent
Model
工作区
产物目标类型
```

Chip 规则：

```txt
默认显示 2-3 个关键 chip
更多上下文折叠
hover 展示详情
可移除非必要上下文
```

### 8.3.4 微交互

| 操作 | 反馈 |
|---|---|
| focus | 输入框边框轻微 accent |
| 输入中 | 高度自然增长 |
| 添加上下文 | chip 柔和进入 |
| 运行中 | 按钮变成“生成中”，不可重复点击 |
| 运行完成 | 产物卡进入右栏 |
| 失败 | 输入框不清空，显示可重试 |

### 8.3.5 设计原则

```txt
AI 入口要让用户感觉“我在发起一个文档任务”
而不是“我在和机器人闲聊”
```

---

## 8.4 AI Generating：安静加工中的 AI 生成体验

### 8.4.1 目标

AI 生成过程要有生命感，但不能焦躁。

### 8.4.2 推荐体验

```txt
AI 状态条：
Claude Code 正在生成 · sonnet · 当前文档

正文预览：
内容自然出现
尾部有轻微 caret
不要逐字跳动太明显

右栏：
生成中产物卡 skeleton
文件名逐渐确定
状态从 running 到 done
```

### 8.4.3 状态视觉

| 状态 | 体验 |
|---|---|
| starting | 轻微 pulse |
| running | 柔和流动线 / caret |
| writing_artifact | 产物卡 skeleton |
| done | 卡片 settle + 微弱成功 ring |
| partial | 温和 warning |
| failed | 克制 error，不大面积红色 |

### 8.4.4 Streaming Caret

轻量自研即可。

```css
.ai-streaming-caret {
  display: inline-block;
  width: 0.55em;
  height: 1em;
  margin-left: 1px;
  border-radius: 1px;
  background: var(--accent);
  animation: typola-caret-blink 1s steps(2, jump-none) infinite;
}

@keyframes typola-caret-blink {
  0%, 45% { opacity: 1; }
  46%, 100% { opacity: 0; }
}
```

### 8.4.5 不做

```txt
不做 token 逐字花式动画
不做 loading 满屏转圈
不做大面积 shimmer
不做高频闪烁
不让 AI 回复区域不断挤压主编辑区
```

---

## 8.5 Artifact Shelf：成果架体验

### 8.5.1 目标

Artifact Center 不应像文件列表，而应像“成果架”。

用户心理模型：

```txt
这是我的 AI 产物
这是我的工作结果
这是可以对比、采纳、归档、交付的成果
```

### 8.5.2 当前文档产物右栏

卡片示例：

```txt
┌──────────────────────────────┐
│ 技术方案草稿                  │
│ Markdown · Claude Code        │
│ 来自 article.md · 15:31       │
│                              │
│ [打开] [对比] [插入]          │
└──────────────────────────────┘
```

### 8.5.3 产物库页面

不要做成纯表格。

建议布局：

```txt
顶部：搜索 + 筛选
中间：按时间分组
右侧：产物详情预览
```

结构：

```txt
今天
  技术方案草稿       Markdown   Done
  公众号排版         HTML       Done
  检视修改版         Revision   Done

昨天
  项目周报           Markdown   Archived
```

### 8.5.4 卡片质感

```txt
卡片背景比面板略亮
边框非常轻
hover 只抬高 1px
操作按钮默认弱化
hover 后出现
状态 badge 小而清楚
```

### 8.5.5 动效

使用 `motion` + `AutoAnimate`。

| 场景 | 实现 |
|---|---|
| 新产物进入 | motion fade + translateY(4px) |
| 产物完成 | success ring |
| 产物失败 | shake 一次 + error badge |
| 产物删除 | AnimatePresence exit |
| 列表重排 | AutoAnimate |
| 筛选变化 | motion crossfade |

---

## 8.6 Review Calm：安全、可控的检视模式

### 8.6.1 目标

AI 改稿必须让用户有控制感。

用户不应感到：

```txt
AI 改了很多，但我不知道改了哪里。
AI 会不会覆盖原文？
我不知道该不该采纳。
```

用户应该感到：

```txt
我可以先检视，再决定是否采纳。
原文不会丢。
所有修改都可追踪。
```

### 8.6.2 结构

```txt
正文锚点
右侧意见
AI 改稿产物
Diff Review
采纳动作
撤销提示
```

### 8.6.3 交互

| 场景 | 体验 |
|---|---|
| 添加意见 | 选区边缘出现柔和批注锚点 |
| hover 意见 | 正文对应段落轻微高亮 |
| 点击意见 | 平滑滚动到段落 |
| 发 AI 改 | 生成 Revision artifact |
| 完成后 | 自动提示“可对比修改版” |
| 对比 | 不覆盖原文，进入 Diff |
| 采纳 | 明确确认，可撤销 |

### 8.6.4 动效

```txt
批注锚点：轻微 fade + scale 0.98 -> 1
hover 联动：背景淡入
滚动定位：smooth scroll，reduced-motion 下关闭
Diff 出现：fade in
采纳成功：轻量 toast，不弹大窗
```

---

## 8.7 Save & Trust：保存与失败状态

### 8.7.1 目标

保存状态是信任基础。

状态必须清楚，但不能焦虑。

### 8.7.2 状态

```txt
未修改：不强调
已修改：小点 + “未保存”
保存中：小 spinner + “保存中”
已保存：短暂 check + “已保存”
失败：小红点 + “保存失败”
```

### 8.7.3 动效

```txt
dirty：轻微呼吸
saving：低调旋转
saved：一次 ring-out
error：shake 一次
```

### 8.7.4 失败动作

保存失败时提供：

```txt
[重试保存] [另存为] [查看错误]
```

---

## 8.8 Empty State & Onboarding：温和空状态

### 8.8.1 目标

空状态不要冰冷，也不要像错误页。

空状态应该：

```txt
说明发生了什么
解释为什么这里为空
给出下一步动作
语气温和
```

### 8.8.2 典型空状态

#### 无产物

```txt
还没有 AI 产物

当你让 AI 生成文档、改稿或导出内容时，
结果会在这里沉淀，方便打开、对比和归档。

[让 AI 生成一份草稿]
```

#### 未配置 AI

```txt
还没有连接本机 AI Agent

Typola 默认使用你本机已安装的 Claude Code 或 OpenCode。
文档不会默认上传到云端。

[检测 Claude Code] [选择 Agent 路径]
```

#### 无检视意见

```txt
还没有检视意见

选中文档中的一段内容，就可以添加意见。
之后你可以导出 review.md，或让 AI 根据意见生成修改版。

[开始检视]
```

#### STYLE.md 未启用

```txt
还没有文档风格档案

STYLE.md 可以帮助 AI 按你的写作风格生成和修改文档。
你可以先从一个轻量模板开始。

[创建 STYLE.md]
```

---

## 8.9 Theme Calm：主题与环境氛围

### 8.9.1 目标

主题应增强长时间写作舒适度，而不是喧宾夺主。

### 8.9.2 推荐主题

| 主题 | 气质 | 适合 |
|---|---|---|
| Minimal Paper | 极简纸面 | 默认 |
| Warm Sand | 暖沙色 | 长时间写作 |
| Ink Basin | 黑白水墨 | 深度阅读 |
| Graphite Forest | 石墨绿灰 | 夜间工作 |
| Night Current | 深色静水 | 暗色环境 |

### 8.9.3 主题原则

```txt
正文永远最高可读
主题只影响环境，不影响内容判断
不要复杂动态背景
不要强制改变正文字体
不要高饱和色
不要让主题抢主编辑区注意力
```

---

## 9. 核心组件规范

### 9.1 Tooltip

使用：

```txt
@floating-ui/react
```

能力：

```txt
hover 600ms 出现
focus-visible 可触发
Escape 可关闭
自动 flip/shift
支持 portal
支持 aria-describedby
```

组件：

```txt
src/components/ui/Tooltip.tsx
src/components/ui/TooltipProvider.tsx
```

### 9.2 Tabs / Indicator

使用：

```txt
motion layoutId
```

适用：

```txt
editor tabs
left rail tabs
right rail tabs
settings section tabs
artifact filter tabs
document mode switcher
```

不要自研：

```txt
useLayoutEffect 测量 active rect
ResizeObserver 手写修正
scrollLeft 复杂计算
```

### 9.3 Lists / Reflow

使用：

```txt
@formkit/auto-animate
```

适用：

```txt
file tree folder children
artifact list
recent documents
tab remove
workspace files
```

规则：

```txt
列表超过 80 个节点时降级
reduced-motion 下关闭
不要全局挂在根节点
只挂在局部 children 容器
```

### 9.4 Artifact Card

使用：

```txt
motion
```

状态：

```txt
running
done
partial
failed
archived
```

行为：

```txt
enter
exit
status transition
hover action reveal
```

### 9.5 AI Streaming

实现：

```txt
CSS caret
motion status card
AutoAnimate artifact list
```

不要：

```txt
逐 token animation
逐字符 animation
长文 decoration 动画
```

---

## 10. 性能设计

### 10.1 性能原则

```txt
输入优先
滚动优先
IME 优先
长文优先
动画让路
```

### 10.2 动画白名单

优先使用：

```txt
transform
opacity
filter 少量使用
box-shadow 少量使用
```

谨慎使用：

```txt
width
height
top
left
margin
padding
background-position
```

避免：

```txt
大面积 blur
频繁 box-shadow 动画
逐字符 DOM 动画
大列表 stagger
```

### 10.3 大列表策略

| 场景 | 策略 |
|---|---|
| 文件树 > 80 节点 | 关闭 stagger，只保留 chevron |
| 产物列表 > 100 条 | 使用虚拟列表或分页，关闭复杂 enter |
| 搜索结果大量变化 | 只动画容器，不动画每项 |
| tab 数量很多 | 只动画 active indicator |

### 10.4 CodeMirror 策略

```txt
搜索 flash 使用 Decoration
Decoration 生命周期短
不在每次输入中创建大量 Decoration
AI streaming 不在 CM6 内逐 token 动画
IME composition 期间禁用非必要动画
```

### 10.5 性能验收

必须通过：

```txt
长文 10k 行滚动不卡顿
中文 IME 输入不受影响
文件树 500 节点展开不明显掉帧
AI 长文生成时主线程不阻塞
reduced-motion 开启后动效显著减少
Windows 低配机器可用
```

---

## 11. 信息架构调整建议

### 11.1 右栏

建议从功能堆叠变成明确 tabs：

```txt
产物
预览
检视
大纲
```

或按模式动态显示：

```txt
阅读模式：
  大纲 / 预览 / 产物

心流模式：
  AI 工作台 / 产物

检视模式：
  检视意见 / AI 改稿产物
```

### 11.2 AI 工作台

建议结构：

```txt
AI Task Bar
上下文 chips
运行状态
结果 / 产物
历史任务
```

### 11.3 Artifact Center

建议结构：

```txt
当前文档产物右栏
工作区产物库页面
产物详情预览
产物操作菜单
```

---

## 12. 推荐 PR 拆分

### PR1：Motion Foundation 与依赖引入

内容：

```txt
引入 motion
引入 @floating-ui/react
引入 @formkit/auto-animate
新增 motion tokens
新增 reduced-motion 策略
新增基础 CSS utility
```

验收：

```txt
依赖安装成功
React 19 + Tauri 构建通过
reduced-motion 生效
无业务行为变化
```

### PR2：Tooltip / Popover 基础设施

内容：

```txt
Tooltip
TooltipProvider
IconButtonWithTooltip
toolbar tooltip 替换
settings tooltip 替换
dialog icon tooltip 替换
```

验收：

```txt
hover 可用
focus-visible 可用
靠边自动 flip/shift
滚动容器内定位正确
Escape 可关闭
键盘可访问
```

### PR3：Navigation Continuity

内容：

```txt
motion layoutId active indicator
editor tab indicator
left rail tab indicator
right rail tab indicator
settings section indicator
artifact filter indicator
document mode switcher 统一 motion token
```

验收：

```txt
tab 切换不再直跳
indicator 滑动自然
窗口 resize 后正常
右栏折叠展开后正常
reduced-motion 下不做复杂滑动
```

### PR4：Calm Surface 纸面层

内容：

```txt
主编辑区纸面层
环境背景
面板层级
留白体系
阴影与边框
focus mode 弱化工具栏
```

验收：

```txt
主文档更像纸面
长时间阅读不刺眼
工具栏不抢注意力
浅色/深色主题可用
不影响现有编辑器布局
```

### PR5：Editor Feedback

内容：

```txt
save state visual
search hit flash
button press feedback
error shake
success ring
status bar subtle pulse
file tree chevron rotate
file tree AutoAnimate
```

验收：

```txt
dirty/saving/saved/error 可区分
搜索跳转有反馈
文件树展开有连续性
状态栏不焦躁
大目录展开不卡顿
```

### PR6：AI Task Bar 与 Streaming

内容：

```txt
AI 输入框任务化
上下文 chips
AI run status bar
streaming caret
生成中状态
失败/partial 状态
```

验收：

```txt
AI 入口像任务台，不像普通聊天框
用户能看到当前 Agent/Model/Context
AI 生成不焦躁
失败后可重试
输入内容不丢
```

### PR7：Artifact Shelf 成果架

内容：

```txt
右栏产物卡片质感
Artifact card motion
Artifact list AutoAnimate
running/done/partial/failed 状态
产物库时间分组
产物详情预览
```

验收：

```txt
产物像成果，不像临时文件
新产物进入自然
失败产物不隐藏
操作按钮克制但可见
产物库可长时间管理
```

### PR8：Review Calm 检视体验

内容：

```txt
批注锚点
hover 联动正文高亮
点击意见平滑定位
AI 改稿产物提示
Diff 引导
采纳/撤销提示
```

验收：

```txt
用户知道意见对应正文哪里
AI 改稿不覆盖原文
Diff 入口清晰
采纳动作可信
检视模式不焦虑
```

### PR9：Empty State 与 Onboarding

内容：

```txt
未配置 AI 空状态
无产物空状态
无检视意见空状态
无工作区空状态
STYLE.md 未启用空状态
温和文案与下一步动作
```

验收：

```txt
空状态不冰冷
用户知道下一步
语气温和
本地优先信任感明确
```

### PR10：Theme Calm 基础主题

内容：

```txt
Minimal Paper
Warm Sand
Ink Basin
Graphite Forest
Night Current
主题 token
正文可读性校验
```

验收：

```txt
主题不影响正文阅读
无强动态背景
可长时间使用
浅色/深色过渡自然
```

---

## 13. 优先级

### 13.1 P0

立刻做：

```txt
PR1 Motion Foundation 与依赖引入
PR2 Tooltip / Popover 基础设施
PR3 Navigation Continuity
PR4 Calm Surface 纸面层
PR6 AI Task Bar 与 Streaming
PR7 Artifact Shelf 成果架
```

理由：

```txt
这几项直接决定高级感、舒服感和 AI 文档工作台差异化。
```

### 13.2 P1

第二阶段做：

```txt
PR5 Editor Feedback
PR8 Review Calm 检视体验
PR9 Empty State 与 Onboarding
```

理由：

```txt
这些提升完整性和可信度。
```

### 13.3 P2

后续做：

```txt
PR10 Theme Calm 基础主题
更多主题
Artifact timeline
STYLE.md 风格 badge
更多 onboarding
```

理由：

```txt
这些提升氛围，但不应早于核心工作流。
```

---

## 14. GitHub Issue 建议

可以新建总 issue：

```txt
design: Typola Calm Workspace 体验系统优化
```

正文摘要：

```txt
目标：将 Typola 从“功能可用的 AI Markdown 编辑器”打磨为“优雅、简洁、有质感、解压且舒服的 AI 文档工作台”。

原则：
- 内容优先
- AI 可控
- 产物可追踪
- 状态可理解
- 动效低打扰
- 成熟库承担复杂交互
- 自研只做产品语义和视觉规范

推荐依赖：
- motion
- @floating-ui/react
- @formkit/auto-animate

不引入：
- react-spring
- GSAP
- Lottie
- react-bits
```

Labels：

```txt
area/design
area/motion
area/ux
area/editor
area/ai-workbench
area/artifact
priority/p0
```

---

## 15. Codex 实施提示词

```txt
你正在实现 Typola Calm Workspace 体验系统。请遵守：

1. Typola 是 AI 文档工作台，不是动效展示网站。
2. 所有动效必须服务内容、状态、空间连续性和用户控制感。
3. 引入成熟库承担复杂交互：
   - motion：layout / enter-exit / shared indicator
   - @floating-ui/react：tooltip / popover
   - @formkit/auto-animate：列表 reflow
4. 不自研复杂动画框架。
5. 不自研 tooltip 定位系统。
6. 不自研 tab indicator 测量系统。
7. 不做逐字符花式动画。
8. 不做大面积 shimmer。
9. 必须尊重 prefers-reduced-motion。
10. 必须不影响 CodeMirror 输入、滚动和中文 IME。
11. 所有新增组件必须保持 Typola 的安静、克制、纸感、低噪声气质。
12. 完成后请运行 TypeScript check、lint、Rust check 和现有测试；如项目无对应脚本，请说明。
13. PR 描述中说明：
    - 本次体验目标
    - 使用了哪些库
    - 是否影响性能
    - reduced-motion 验证结果
    - 已验证交互路径
```

---

## 16. 验收标准总表

| 维度 | 验收标准 |
|---|---|
| 视觉气质 | 主编辑区更像纸面，整体更安静 |
| AI 体验 | AI 输入像任务台，生成过程清晰低噪 |
| 产物体验 | 产物像成果架，可追踪、可操作 |
| 检视体验 | AI 改稿不焦虑，可 diff、可撤销 |
| 动效一致性 | duration/easing 统一 |
| 交互维护 | 复杂交互由 motion/Floating UI/AutoAnimate 承担 |
| 性能 | 不影响长文、滚动、IME、低配 Windows |
| 可访问性 | tooltip/focus/reduced-motion 可用 |
| 空状态 | 温和、有下一步动作 |
| 本地信任 | AI 执行和产物状态可理解 |

---

## 17. 最终结论

Typola 的体验优化不应该停留在“补几个动画”。

真正要做的是：

```txt
建立一个安静、可信、低噪声的 AI 文档工作环境。
```

最终路线：

```txt
先建立 Motion Foundation 和低维护交互基础设施；
再打磨纸面层、AI 任务台和产物成果架；
再增强检视、安全状态、空状态和主题氛围。
```

设计判断：

```txt
issue #122 解决的是动效缺口。
Calm Workspace 解决的是心理体验。
```

产品目标：

> **让用户打开 Typola 时，感觉自己进入了一个安静、柔和、有秩序的文档工坊；AI 在旁边可靠地工作，产物有序沉淀，所有变化都清楚、克制、可控。**
