# Typola SkillHub 预置场景与增强 Prefill 实施方案

## 1. 背景

Typola 的 SkillHub 第一阶段定位为右侧栏的「场景模板启动器」，不是工具市场，也不是参数配置器。

最终交互原则：

> 右侧选择场景和 skill，左侧 AI 工作台负责确认与执行，中间编辑器承接产物，产物中心负责暂存、打开、归档和回流。

本方案基于当前已确认的产品边界和已选 skill 清单，设计 SkillHub 的预置场景、数据结构、UI 调整、增强 prefill 机制和实施任务。

---

## 2. 实施目标

本阶段目标是完成 SkillHub M2.5 的收敛实现：

1. 一级场景全部为系统预置。
2. 一级场景不分类。
3. 不支持用户自定义一级场景。
4. 一级场景卡平铺展示。
5. PPT 生成和 HTML 生成是两个独立场景。
6. 「看板生成」不再作为一级场景。
7. 原看板生成诉求收敛为「数据报表 HTML」，放入「日报周报」场景。
8. 二级页面展示：

   * 场景说明
   * 推荐 skill
   * 自定义 skill
9. 支持用户向预置场景添加本机已有 skill。
10. 点击 skill 后不立即执行，而是打开左侧 AI 工作台，并注入增强 prefill。
11. 不做参数 Chips。
12. 不做四步表单。
13. 不做自然语言自动路由。
14. 不展示全量本机 skill 市场。
15. 当前没有正式用户，不做历史数据迁移和兼容逻辑。

---

## 3. 非目标

本阶段不做以下能力：

1. 不支持新增、删除、隐藏、排序一级场景。
2. 不支持复杂参数面板。
3. 不支持自然语言自动选择场景。
4. 不支持全量 skill marketplace。
5. 不做 skill 运行前的多步向导。
6. 不做一级场景自定义。
7. 不做旧版本 `skill-hub.json` 迁移。
8. 不做联网深度调研闭环。
9. 不做 Excel / 项目管理系统深度集成。
10. 不直接在 Typola 内自动安装第三方 skill，只生成安装请求交给 AI 工作台处理。

---

## 4. 最终一级场景

一级场景共 8 个，全部为系统预置。

```text
常用工具
日报周报
报告总结
PPT 生成
HTML 生成
长文写作
知识沉淀
研究分析
```

建议显示顺序：

```text
1. 常用工具
2. 日报周报
3. 报告总结
4. PPT 生成
5. HTML 生成
6. 长文写作
7. 知识沉淀
8. 研究分析
```

---

## 5. 右侧 SkillHub 信息架构

### 5.1 一级页面

```text
场景
[搜索场景 / skill] [刷新]

[常用工具]
导入 Markdown、URL 导入、去 AI 味、翻译、Markdown 转 PDF

[日报周报]
日报、周报、月报、工作同步、数据报表 HTML

[报告总结]
报告生成、复盘总结、高管摘要、信息卡生成

[PPT 生成]
把文档转成 PPT、演示稿或 slide deck

[HTML 生成]
把文档转成 HTML 页面、网页稿或可浏览产物

[长文写作]
从资料、大纲和观点生成长文、公众号文章或观点稿

[知识沉淀]
生成 Wiki、FAQ、术语表、知识索引和 llms.txt

[研究分析]
拆书、论文解读、概念分析、深度追问和洞察分析
```

### 5.2 二级页面

以「日报周报」为例：

```text
← 日报周报

把工作记录、本地笔记、事项数据整理成日报、周报、月报、同步材料或数据报表 HTML。

推荐 skill

[本地笔记周报]
基于本地 nb 笔记和工作记录整理日报、周报、月报素材
状态：已安装 / 未安装
[使用] / [让 Claude 安装]

[数据报表 HTML]
基于事项、表格、周报或项目材料生成可浏览的数据报表 HTML 页面
状态：内置
[使用]

自定义 skill [+ 添加]

[我的 report-builder]
用户添加
状态：已安装
[使用] [移除]
```

---

## 6. 场景与 skill 清单

### 6.1 常用工具

| 模板名            | skill name              | 来源                                                                              | 说明              |
| -------------- | ----------------------- | ------------------------------------------------------------------------------- | --------------- |
| 导入 Markdown    | `markitdown`            | `https://github.com/microsoft/markitdown`                                       | 文件转 Markdown    |
| URL 导入         | `baoyu-url-to-markdown` | `https://github.com/JimLiu/baoyu-skills/tree/main/skills/baoyu-url-to-markdown` | URL 转 Markdown  |
| 去 AI 味         | `humanizer`             | 暂无 installSource                                                                | 文本自然化           |
| 文稿校对           | `huashu-proofreading`   | `https://github.com/alchaincyf/huashu-skills/tree/master/huashu-proofreading`   | 校对、润色、降低机器感     |
| 翻译             | `baoyu-translate`       | `https://github.com/JimLiu/baoyu-skills/blob/main/skills/baoyu-translate`       | 中英 / 多语言翻译      |
| Markdown 转 PDF | `huashu-md-to-pdf`      | `https://github.com/alchaincyf/huashu-skills/tree/master/huashu-md-to-pdf`      | Markdown 导出 PDF |

---

### 6.2 日报周报

| 模板名       | skill name         | 来源                           | 说明                                |
| --------- | ------------------ | ---------------------------- | --------------------------------- |
| 本地笔记周报    | `nb`               | `https://github.com/xwmx/nb` | 基于本地 nb 笔记整理日报 / 周报 / 月报素材        |
| 数据报表 HTML | `data-report-html` | Typola 内置 prompt-only skill  | 基于事项、表格、周报或项目材料生成可浏览的数据报表 HTML 页面 |

---

### 6.3 报告总结

| 模板名    | skill name                  | 来源                                                                                    | 说明                    |
| ------ | --------------------------- | ------------------------------------------------------------------------------------- | --------------------- |
| 综合报告生成 | `report-summary`            | Typola 内置 prompt-only skill                                                           | 基于当前文档 / 附件生成结构化报告    |
| 项目复盘报告 | `project-retro-report`      | Typola 内置 prompt-only skill                                                           | 生成项目背景、目标、进展、问题、复盘、建议 |
| 高管摘要   | `executive-summary`         | Typola 内置 prompt-only skill                                                           | 把长材料压缩成一页式摘要          |
| 编辑风信息卡 | `editorial-card-screenshot` | `https://github.com/shaom/infocard-skills/tree/main/skills/editorial-card-screenshot` | 信息卡 HTML / PNG 输出     |
| 乔木信息卡  | `info-card-designer`        | `https://github.com/joeseesun/qiaomu-info-card-designer`                              | 杂志质感信息卡，支持 URL / 文本输入 |

---

### 6.4 PPT 生成

| 模板名           | skill name               | 来源                                                                         | 说明                     |
| ------------- | ------------------------ | -------------------------------------------------------------------------- | ---------------------- |
| 华为风格 PPT      | `huawei-style-ppt-skill` | `https://github.com/zuiho-kai/huawei-style-ppt-skill`                      | 商务汇报、层级标题、稳重版式         |
| 归藏 PPT        | `guizang-ppt-skill`      | `https://github.com/op7418/guizang-ppt-skill`                              | 内容型 / 叙事化演示稿           |
| 花叔 Slides     | `huashu-slides`          | `https://github.com/alchaincyf/huashu-skills/tree/master/huashu-slides`    | 讲稿驱动的 slides           |
| 宝玉 Slide Deck | `baoyu-slide-deck`       | `https://github.com/JimLiu/baoyu-skills/tree/main/skills/baoyu-slide-deck` | 传播型 / 知识表达型 slide deck |
| PPT Master    | `ppt-master`             | `https://github.com/hugohe3/ppt-master`                                    | 通用 PPT 生成器             |
| 花叔 Design     | `huashu-design`          | `https://github.com/alchaincyf/huashu-skills/tree/master/huashu-design`    | 更有设计感的视觉化表达稿           |

---

### 6.5 HTML 生成

| 模板名                | skill name               | 来源                                                                               | 说明                    |
| ------------------ | ------------------------ | -------------------------------------------------------------------------------- | --------------------- |
| Frontend Slides    | `frontend-slides`        | `https://github.com/zarazhangrui/frontend-slides`                                | HTML/CSS/前端形式 slides  |
| 归藏 PPT HTML 模板     | `guizang-ppt-skill`      | `https://github.com/op7418/guizang-ppt-skill`                                    | 电子杂志风 / HTML 翻页 PPT   |
| 宝玉 Markdown → HTML | `baoyu-markdown-to-html` | `https://github.com/JimLiu/baoyu-skills/tree/main/skills/baoyu-markdown-to-html` | Markdown 转样式化 HTML    |
| HTML PPT Studio    | `html-ppt-skill`         | `https://github.com/lewislulu/html-ppt-skill`                                    | HTML 演示稿              |
| md2html 文档网页       | `md2html`                | `https://github.com/haidang1810/md2html`                                         | 长文档转自包含 HTML 网页       |
| 花叔 Markdown HTML   | `huashu-md-html`         | `https://github.com/alchaincyf/huashu-skills/tree/master/huashu-md-html`         | Markdown 转结构化 HTML 页面 |
| 花叔 Design          | `huashu-design`          | `https://github.com/alchaincyf/huashu-skills/tree/master/huashu-design`          | 设计感 HTML 页面 / 视觉交付物   |

---

### 6.6 长文写作

| 模板名           | skill name      | 来源                                                                     | 说明                 |
| ------------- | --------------- | ---------------------------------------------------------------------- | ------------------ |
| Khazix Writer | `khazix-writer` | `https://github.com/KKKKhazix/khazix-skills/tree/main/khazix-writer`   | 长文写作               |
| Ni Writer     | `ni-writer`     | `https://github.com/ttttstc/ni-skill/tree/main/skills/ni-writer`       | 公众号 / 长文内容生产       |
| 深度观点文章        | `ljg-writes`    | `https://github.com/lijigang/ljg-skills/tree/master/skills/ljg-writes` | 1000–1500 字批判性观点文章 |
| 白话重写          | `ljg-plain`     | `https://github.com/lijigang/ljg-skills/tree/master/skills/ljg-plain`  | 把内容重写成更容易理解的白话表达   |

---

### 6.7 知识沉淀

当前暂不配置系统推荐 skill。

空态文案：

```text
系统推荐 skill 正在整理中。
后续将支持 Wiki、FAQ、术语表、知识索引和 llms.txt 生成。
```

---

### 6.8 研究分析

| 模板名  | skill name  | 来源                                                                    | 说明                         |
| ---- | ----------- | --------------------------------------------------------------------- | -------------------------- |
| 拆书分析 | `ljg-book`  | `https://github.com/lijigang/ljg-skills/tree/master/skills/ljg-book`  | 分析一本书在回答什么问题、用了什么框架、得出什么结论 |
| 论文解读 | `ljg-paper` | `https://github.com/lijigang/ljg-skills/tree/master/skills/ljg-paper` | 把论文讲成一个连续故事，适合非专业读者理解论文    |
| 深度追问 | `ljg-think` | `https://github.com/lijigang/ljg-skills/tree/master/skills/ljg-think` | 对观点、现象、问题纵向下钻到本质           |
| 概念解剖 | `ljg-learn` | `https://github.com/lijigang/ljg-skills/tree/master/skills/ljg-learn` | 从多维度解剖概念，生成概念理解报告          |

---

## 7. 数据结构设计

### 7.1 SkillSceneId

```ts
export type SkillSceneId =
  | 'common'
  | 'daily'
  | 'report'
  | 'ppt'
  | 'html'
  | 'longform'
  | 'knowledge'
  | 'research';
```

### 7.2 SkillTemplateRef

建议扩展当前结构：

```ts
export type SkillTemplateRef = SkillRef & {
  label: string;
  summary: string;
  expectedPath?: string;
  installSource?: string;
  system: true;

  /**
   * 场景化增强 prefill。
   * 如果存在，点击 skill 后会和 /skill-name 一起注入左侧 Composer。
   */
  prefill?: string;

  /**
   * 产物类型，用于 UI 说明，不参与执行。
   */
  output?: 'markdown' | 'html' | 'pdf' | 'ppt' | 'png' | 'org' | 'mixed';

  /**
   * 是否为 Typola 内置 prompt-only skill。
   * 这类 skill 不依赖本机扫描安装状态。
   */
  builtin?: boolean;

  /**
   * 可选：支持的 AI Provider。
   */
  supportedProviders?: AgentProvider[];
};
```

### 7.3 SkillSceneTemplate

```ts
export type SkillSceneTemplate = {
  id: SkillSceneId;
  label: string;
  description: string;
  icon: string;
  accent: string;
  skills: SkillTemplateRef[];
};
```

---

## 8. 系统场景配置建议

文件位置：

```text
src/services/agent/skillHub.ts
```

替换当前 `SYSTEM_SKILL_SCENES`。

```ts
export const SYSTEM_SKILL_SCENES: SkillSceneTemplate[] = [
  {
    id: 'common',
    label: '常用工具',
    description: '最高频的文档处理入口：导入 Markdown、URL 导入、去 AI 味、翻译、Markdown 转 PDF。',
    icon: 'Sparkles',
    accent: 'oklch(0.66 0.13 70)',
    skills: [
      {
        name: 'markitdown',
        label: '导入 Markdown',
        summary: '将 PDF、Word、PPT、Excel、网页等材料转换为可编辑 Markdown。',
        installSource: 'https://github.com/microsoft/markitdown',
        output: 'markdown',
        system: true,
      },
      {
        name: 'baoyu-url-to-markdown',
        label: 'URL 导入',
        summary: '将网页 URL 转换为 Markdown，适合资料摘录和知识入库。',
        installSource: 'https://github.com/JimLiu/baoyu-skills/tree/main/skills/baoyu-url-to-markdown',
        output: 'markdown',
        system: true,
      },
      {
        name: 'humanizer',
        label: '去 AI 味',
        summary: '将文本改得更自然，减少 AI 味、模板腔和过度总结感。',
        output: 'markdown',
        system: true,
      },
      {
        name: 'huashu-proofreading',
        label: '文稿校对',
        summary: '对文稿进行校对、润色和表达优化，适合消除机器感和低质表达。',
        installSource: 'https://github.com/alchaincyf/huashu-skills/tree/master/huashu-proofreading',
        output: 'markdown',
        system: true,
      },
      {
        name: 'baoyu-translate',
        label: '翻译',
        summary: '进行中英或多语言翻译，保留原文结构并输出自然译文。',
        installSource: 'https://github.com/JimLiu/baoyu-skills/blob/main/skills/baoyu-translate',
        output: 'markdown',
        system: true,
      },
      {
        name: 'huashu-md-to-pdf',
        label: 'Markdown 转 PDF',
        summary: '将 Markdown 文档转换为 PDF，适合报告、长文和交付件导出。',
        installSource: 'https://github.com/alchaincyf/huashu-skills/tree/master/huashu-md-to-pdf',
        output: 'pdf',
        system: true,
      },
    ],
  },

  {
    id: 'daily',
    label: '日报周报',
    description: '把工作记录、本地笔记、事项数据整理成日报、周报、月报或数据报表 HTML。',
    icon: 'CalendarDays',
    accent: 'oklch(0.66 0.13 70)',
    skills: [
      {
        name: 'nb',
        label: '本地笔记周报',
        summary: '基于本地 nb 笔记和工作记录整理日报、周报、月报素材。',
        installSource: 'https://github.com/xwmx/nb',
        output: 'markdown',
        system: true,
      },
      {
        name: 'data-report-html',
        label: '数据报表 HTML',
        summary: '基于事项、表格、周报或项目材料生成可浏览的数据报表 HTML 页面。',
        builtin: true,
        output: 'html',
        system: true,
        prefill: `请基于当前文档、表格、事项列表或项目材料生成一份数据报表 HTML。

要求：
- 自动识别其中的事项、状态、负责人、时间、风险、进展和关键指标
- 将内容整理成适合浏览的数据报表页面
- 页面应包含摘要区、关键指标区、事项明细区、风险区和下一步计划
- 如果材料中包含表格，请尽量保留表格结构并转成 HTML 展示
- 对缺失或不确定的信息标记"待确认"
- 不编造输入材料中没有的信息
- 输出为单文件 HTML，适合在浏览器中打开
- 生成后将 HTML 文件保存到当前会话产物目录`,
      },
    ],
  },

  {
    id: 'report',
    label: '报告总结',
    description: '把材料整理成结构化报告、复盘总结、摘要或信息卡。',
    icon: 'ClipboardList',
    accent: 'oklch(0.62 0.15 25)',
    skills: [
      {
        name: 'report-summary',
        label: '综合报告生成',
        summary: '基于当前文档、附件或工作区材料生成结构化总结报告。',
        builtin: true,
        output: 'markdown',
        system: true,
        prefill: `请基于当前文档、附件或工作区材料生成一份结构化总结报告。

输入：
- 当前文档
- 当前选中文本，如有
- 当前工作区相关材料，如需要

要求：
- 先提炼核心结论，再展开背景、关键进展、问题风险和建议
- 保留材料中的项目名、时间、负责人、数据、结论和关键事实
- 不编造输入材料中没有的信息
- 对不确定的信息标记"待确认"
- 删除空话、套话和重复表达
- 输出为可直接编辑的 Markdown 文档
- 生成后将报告保存到当前会话产物目录`,
      },
      {
        name: 'project-retro-report',
        label: '项目复盘报告',
        summary: '从项目材料中提炼背景、目标、进展、问题、复盘结论和改进建议。',
        builtin: true,
        output: 'markdown',
        system: true,
        prefill: `请基于当前项目材料生成一份项目复盘报告。

要求：
- 结构包括：背景目标、关键时间线、完成情况、问题与风险、原因分析、经验教训、改进建议、下一步计划
- 尽量从材料中提取事实，不凭空补充
- 对缺失的信息用"待确认"标记
- 语言正式、克制，适合项目管理和团队复盘
- 输出 Markdown
- 生成后将复盘报告保存到当前会话产物目录`,
      },
      {
        name: 'executive-summary',
        label: '高管摘要',
        summary: '将长材料压缩成一页式摘要，突出结论、风险、决策点和下一步。',
        builtin: true,
        output: 'markdown',
        system: true,
        prefill: `请将当前材料压缩成一页式高管摘要。

要求：
- 开头先给 3 条最重要结论
- 聚焦决策点、风险、收益、影响范围和下一步
- 不展开过多过程细节
- 不编造输入材料中没有的信息
- 语言简洁、正式、有信息密度
- 输出 Markdown

建议结构：
- 核心结论
- 当前进展
- 关键风险
- 需要决策
- 下一步建议`,
      },
      {
        name: 'editorial-card-screenshot',
        label: '编辑风信息卡',
        summary: '将文章、笔记或材料生成 editorial-style 信息卡，支持 HTML 和 PNG 输出。',
        installSource: 'https://github.com/shaom/infocard-skills/tree/main/skills/editorial-card-screenshot',
        output: 'mixed',
        system: true,
        prefill: `请基于当前文档或选中文本生成一张信息卡。

要求：
- 提炼核心观点和关键信息
- 信息密度高，但不要堆砌
- 适合分享和快速阅读
- 不编造材料中没有的信息
- 优先输出 HTML 信息卡，如支持截图则同时输出 PNG
- 生成后将 HTML / PNG 保存到当前会话产物目录`,
      },
      {
        name: 'info-card-designer',
        label: '乔木信息卡',
        summary: '将文本或 URL 一键转成杂志质感信息卡，并自动截图输出 PNG。',
        installSource: 'https://github.com/joeseesun/qiaomu-info-card-designer',
        output: 'png',
        system: true,
        prefill: `请将当前文本、URL 或文档内容生成一张杂志质感信息卡。

要求：
- 标题有冲击力，但不能标题党
- 默认使用适合移动端分享的宽度
- 保留原文核心事实
- 不编造材料中没有的信息
- 如内容过长，自动拆分多张卡片
- 输出 HTML 和 PNG，保存到当前会话产物目录`,
      },
    ],
  },

  {
    id: 'ppt',
    label: 'PPT 生成',
    description: '把 Markdown、长文或资料转成 PPT 汇报稿、演示稿或 slide deck。',
    icon: 'Presentation',
    accent: 'oklch(0.58 0.14 300)',
    skills: [
      {
        name: 'huawei-style-ppt-skill',
        label: '华为风格 PPT',
        summary: '生成偏华为汇报风格的结构化 PPT，强调商务汇报、层级标题、稳重版式。',
        installSource: 'https://github.com/zuiho-kai/huawei-style-ppt-skill',
        output: 'ppt',
        system: true,
      },
      {
        name: 'guizang-ppt-skill',
        label: '归藏 PPT',
        summary: '生成归藏风格或内容型 PPT，适合把长文档整理成叙事化演示稿。',
        installSource: 'https://github.com/op7418/guizang-ppt-skill',
        output: 'ppt',
        system: true,
      },
      {
        name: 'huashu-slides',
        label: '花叔 Slides',
        summary: '生成话术、销售或表达训练类 slides，适合将材料转成讲稿驱动的演示页。',
        installSource: 'https://github.com/alchaincyf/huashu-skills/tree/master/huashu-slides',
        output: 'ppt',
        system: true,
      },
      {
        name: 'baoyu-slide-deck',
        label: '宝玉 Slide Deck',
        summary: '生成面向传播和知识表达的 slide deck，适合文章、课程、观点型内容转演示。',
        installSource: 'https://github.com/JimLiu/baoyu-skills/tree/main/skills/baoyu-slide-deck',
        output: 'ppt',
        system: true,
      },
      {
        name: 'ppt-master',
        label: 'PPT Master',
        summary: '通用 PPT 生成器，支持多种风格和布局，适合将文档快速转成演示稿。',
        installSource: 'https://github.com/hugohe3/ppt-master',
        output: 'ppt',
        system: true,
      },
      {
        name: 'huashu-design',
        label: '花叔 Design',
        summary: '生成更有设计感的演示页或视觉化表达稿，适合汇报、发布和内容包装。',
        installSource: 'https://github.com/alchaincyf/huashu-skills/tree/master/huashu-design',
        output: 'mixed',
        system: true,
      },
    ],
  },

  {
    id: 'html',
    label: 'HTML 生成',
    description: '把 Markdown 文档转成 HTML 演示页、发布页、网页稿或可浏览产物。',
    icon: 'Globe',
    accent: 'oklch(0.63 0.10 195)',
    skills: [
      {
        name: 'frontend-slides',
        label: 'Frontend Slides',
        summary: '生成 HTML/CSS/前端形式的 slides 或演示页面，适合把文档转成可浏览的网页演示。',
        installSource: 'https://github.com/zarazhangrui/frontend-slides',
        output: 'html',
        system: true,
      },
      {
        name: 'guizang-ppt-skill',
        label: '归藏 PPT（HTML 模板）',
        summary: '生成电子杂志风或瑞士国际主义风的单 HTML 翻页 PPT。',
        installSource: 'https://github.com/op7418/guizang-ppt-skill',
        output: 'html',
        system: true,
      },
      {
        name: 'baoyu-markdown-to-html',
        label: '宝玉 Markdown → HTML',
        summary: '将 Markdown 转为样式化 HTML，适合文章、公众号或网页发布。',
        installSource: 'https://github.com/JimLiu/baoyu-skills/tree/main/skills/baoyu-markdown-to-html',
        output: 'html',
        system: true,
      },
      {
        name: 'html-ppt-skill',
        label: 'HTML PPT Studio',
        summary: '生成带主题、布局和动效的 HTML 演示稿。',
        installSource: 'https://github.com/lewislulu/html-ppt-skill',
        output: 'html',
        system: true,
      },
      {
        name: 'md2html',
        label: 'md2html 文档网页',
        summary: '把长文档、设计、RFC、复盘转成带目录、图表和卡片的自包含 HTML 网页。',
        installSource: 'https://github.com/haidang1810/md2html',
        output: 'html',
        system: true,
      },
      {
        name: 'huashu-md-html',
        label: '花叔 Markdown HTML',
        summary: '将 Markdown 转成结构化 HTML 页面，适合文档发布、展示和交付。',
        installSource: 'https://github.com/alchaincyf/huashu-skills/tree/master/huashu-md-html',
        output: 'html',
        system: true,
      },
      {
        name: 'huashu-design',
        label: '花叔 Design',
        summary: '生成更有设计感的 HTML 页面或视觉化内容交付物。',
        installSource: 'https://github.com/alchaincyf/huashu-skills/tree/master/huashu-design',
        output: 'html',
        system: true,
      },
    ],
  },

  {
    id: 'longform',
    label: '长文写作',
    description: '从大纲、资料和观点生成长文、技术文章、公众号文章或完整草稿。',
    icon: 'PenLine',
    accent: 'oklch(0.62 0.13 150)',
    skills: [
      {
        name: 'khazix-writer',
        label: 'Khazix Writer',
        summary: '面向长文写作的 skill，适合根据主题、资料和大纲生成完整文章。',
        installSource: 'https://github.com/KKKKhazix/khazix-skills/tree/main/khazix-writer',
        output: 'markdown',
        system: true,
      },
      {
        name: 'ni-writer',
        label: 'Ni Writer',
        summary: '面向公众号和长文内容生产，从选题、结构到成稿处理写作流程。',
        installSource: 'https://github.com/ttttstc/ni-skill/tree/main/skills/ni-writer',
        output: 'markdown',
        system: true,
      },
      {
        name: 'ljg-writes',
        label: '深度观点文章',
        summary: '对准一个观点层层剖开，生成 1000–1500 字的批判性观点文章。',
        installSource: 'https://github.com/lijigang/ljg-skills/tree/master/skills/ljg-writes',
        output: 'org',
        system: true,
      },
      {
        name: 'ljg-plain',
        label: '白话重写',
        summary: '将内容改写成更容易理解的白话表达，让聪明的 12 岁孩子也能复述。',
        installSource: 'https://github.com/lijigang/ljg-skills/tree/master/skills/ljg-plain',
        output: 'org',
        system: true,
      },
    ],
  },

  {
    id: 'knowledge',
    label: '知识沉淀',
    description: '生成 Wiki、FAQ、术语表、知识索引和 llms.txt。',
    icon: 'BookOpenText',
    accent: 'oklch(0.63 0.10 195)',
    skills: [],
  },

  {
    id: 'research',
    label: '研究分析',
    description: '基于资料生成洞察报告、书籍分析、论文解读、概念分析和深度思考。',
    icon: 'Search',
    accent: 'oklch(0.60 0.12 220)',
    skills: [
      {
        name: 'ljg-book',
        label: '拆书分析',
        summary: '分析一本书在回答什么问题、使用什么框架、得出什么结论。',
        installSource: 'https://github.com/lijigang/ljg-skills/tree/master/skills/ljg-book',
        output: 'org',
        system: true,
      },
      {
        name: 'ljg-paper',
        label: '论文解读',
        summary: '将论文讲成一个连续故事，输出速读卡、核心命题、论证和启发。',
        installSource: 'https://github.com/lijigang/ljg-skills/tree/master/skills/ljg-paper',
        output: 'org',
        system: true,
      },
      {
        name: 'ljg-think',
        label: '深度追问',
        summary: '对一个观点、现象或问题纵向下钻，追到不可再分的本质。',
        installSource: 'https://github.com/lijigang/ljg-skills/tree/master/skills/ljg-think',
        output: 'org',
        system: true,
      },
      {
        name: 'ljg-learn',
        label: '概念解剖',
        summary: '从历史、辩证、现象、语言、形式、存在、美感、元反思等维度解剖概念。',
        installSource: 'https://github.com/lijigang/ljg-skills/tree/master/skills/ljg-learn',
        output: 'org',
        system: true,
      },
    ],
  },
];
```

---

## 9. 内置 prompt-only skill 处理

以下 skill 为 Typola 内置 prompt-only skill：

```text
data-report-html
report-summary
project-retro-report
executive-summary
```

它们不依赖本机 skill 扫描，不显示「未安装」。

### 9.1 UI 表现

内置 skill 卡片状态显示：

```text
内置
```

而不是：

```text
已安装 / 未安装
```

按钮：

```text
[使用]
```

点击后直接创建 AI 会话并注入 prefill。

### 9.2 判定逻辑

在 SkillHub 卡片生成逻辑中：

```ts
installed: skill.builtin ? true : Boolean(local)
```

示意：

```ts
return {
  name: skill.name,
  label: skillTitle(skill, local),
  summary: skillSummary(skill, local),
  system: true,
  installed: skill.builtin ? true : Boolean(local),
  path: local?.path ?? skill.expectedPath,
  template: skill,
};
```

---

## 10. 增强 Prefill 设计

### 10.1 当前问题

当前点击 skill 后只注入：

```text
/skill-name
```

这会导致用户不知道该补什么任务，也不利于 Typola 做场景化体验。

### 10.2 改造目标

点击 skill 后注入：

```text
/skill-name

请基于当前文档完成：xxx

输入：
- 当前文档
- 当前选中文本，如有
- 当前工作区相关材料，如需要

要求：
- xxx
- xxx
- 不编造输入材料中没有的信息
- 生成后将产物保存到当前会话产物目录

输出：
- xxx
```

### 10.3 buildSkillPrefill 改造

当前函数：

```ts
export function buildSkillPrefill(provider: AgentProvider, skillName: string): string
```

建议改为：

```ts
export function buildSkillPrefill(
  provider: AgentProvider,
  skill: SkillTemplateRef | SkillRef,
  scene?: SkillSceneTemplate,
): string
```

实现逻辑：

```ts
export function buildSkillPrefill(
  provider: AgentProvider,
  skill: SkillTemplateRef | SkillRef,
  scene?: SkillSceneTemplate,
): string {
  const name = skill.name.trim().replace(/^\/+/u, '');
  if (!name) return '';

  const template = 'prefill' in skill ? skill.prefill : undefined;
  const builtin = 'builtin' in skill ? skill.builtin : false;

  if (builtin) {
    return template?.trim() || buildDefaultBuiltinPrefill(skill, scene);
  }

  if (template?.trim()) {
    if (provider === 'opencode') {
      return [
        `请使用 ${name}：`,
        '',
        template.trim(),
      ].join('\n');
    }

    return [
      `/${name}`,
      '',
      template.trim(),
    ].join('\n');
  }

  const fallbackGoal = scene
    ? `请基于当前文档执行「${scene.label}」场景下的「${'label' in skill ? skill.label : skill.name}」任务。`
    : `请使用 ${name} 完成当前任务。`;

  if (provider === 'opencode') {
    return `请使用 ${name}：\n\n${fallbackGoal}`;
  }

  return `/${name}\n\n${fallbackGoal}`;
}
```

---

## 11. SkillHubPanel UI 改造

文件：

```text
src/components/SkillHubPanel.tsx
```

### 11.1 一级页面

保持平铺场景卡，不分组。

```tsx
<div className="skill-hub-scene-list">
  {systemScenes.map((scene) => (
    <button
      type="button"
      key={scene.id}
      className="skill-hub-scene-card"
      onClick={() => setSelectedSceneId(scene.id)}
    >
      ...
    </button>
  ))}
</div>
```

### 11.2 二级页面拆分推荐 / 自定义

当前 `cards` 是 system + custom 混合列表，建议拆分：

```ts
const systemCards = cards.filter((card) => card.system);
const customCards = cards.filter((card) => !card.system);
```

渲染结构：

```tsx
<section className="skill-hub-section">
  <h3>推荐 skill</h3>
  <ul className="skill-hub-items">
    {systemCards.map(renderSkillCard)}
  </ul>
</section>

<section className="skill-hub-section">
  <div className="skill-hub-section-title">
    <h3>自定义 skill</h3>
    <button onClick={() => setAddDialogOpen(true)}>+ 添加</button>
  </div>

  {customCards.length === 0 ? (
    <p className="skill-hub-category-empty">
      还没有添加自定义 skill。
    </p>
  ) : (
    <ul className="skill-hub-items">
      {customCards.map(renderSkillCard)}
    </ul>
  )}
</section>
```

### 11.3 空场景文案

当 `systemCards.length === 0` 时，不显示工程化空态。

```ts
const SCENE_EMPTY_COPY: Record<string, string> = {
  knowledge: '系统推荐 skill 正在整理中。后续将支持 Wiki、FAQ、术语表、知识索引和 llms.txt 生成。',
};
```

### 11.4 状态 Badge

系统 skill 状态：

| 类型                  | Badge |
| ------------------- | ----- |
| builtin prompt-only | `内置`  |
| 本机已安装               | `已安装` |
| 未安装                 | `未安装` |

建议：

```tsx
<span className={`skill-hub-badge ${badgeKind}`}>
  {badgeText}
</span>
```

---

## 12. AppLayout 点击 skill 改造

当前：

```ts
const handlePickSkill = useCallback((skillName: string) => {
  const provider = convManager.activeProvider;
  convManager.createConversation(skillName, skillName, provider);
  setLeftRailMode('aiWorkbench');
  setSkillPrefill({ tick: Date.now(), text: buildSkillPrefill(provider, skillName) });
}, [convManager]);
```

建议改成：

```ts
const handlePickSkill = useCallback((payload: {
  scene: SkillSceneTemplate;
  skill: SkillCard;
}) => {
  const provider = convManager.activeProvider;
  const title = payload.skill.label || payload.skill.name;

  convManager.createConversation(title, payload.skill.name, provider);
  setLeftRailMode('aiWorkbench');

  setSkillPrefill({
    tick: Date.now(),
    text: buildSkillPrefill(provider, payload.skill.template ?? payload.skill, payload.scene),
  });
}, [convManager]);
```

对应 `SkillHubPanelProps`：

```ts
onPickSkill: (payload: {
  scene: SkillSceneTemplate;
  skill: SkillCard;
}) => void;
```

点击处：

```tsx
onClick={() => {
  if (skill.installed) {
    onPickSkill({ scene: selectedScene, skill });
  } else if (skill.template) {
    onInstallSkill(buildSkillInstallPrompt(skill.template, activeProvider));
  }
}}
```

---

## 13. 安装行为

### 13.1 未安装系统 skill

点击未安装 skill 时，不在 App 内直接安装。

当前行为保留：

```text
让 Claude 安装
```

发送到 AI 工作台当前会话：

```text
请帮我安装 Claude skill：<skillName>。

用途：<summary>
来源：<installSource 或 expectedPath 或 "未提供来源，仅提供安装名">

要求：
- 安装完整 skill 目录，而不是单个文件
- 安装后请确认该 skill 可以通过 /<skillName> 调用
```

### 13.2 内置 prompt-only skill

内置 skill 不走安装。

```text
状态：内置
按钮：使用
```

### 13.3 自定义 skill

自定义 skill 仍通过 `AddSkillDialog` 添加。

第一阶段限制：

1. 只能添加到预置场景。
2. 不能新增一级场景。
3. 系统推荐 skill 不可删除。
4. 自定义 skill 可删除。

---

## 14. 不做迁移

当前没有正式用户，因此不实现旧数据迁移。

处理原则：

1. 直接替换 `SYSTEM_SKILL_SCENES`。
2. 直接删除旧 scene id：

   * `summary`
   * `wechat`
   * `data`
   * `kanban`
   * `publish`
3. 不保留旧 `flow-scenarios.json` 兼容逻辑。
4. 不实现 `summary → report`。
5. 不实现 `wechat → longform`。
6. 不实现 `data → daily`。
7. 不实现 `data → kanban`。
8. 不实现 `ppt/html → publish`。
9. 不实现任何 scene id fallback。

如果开发环境中已有旧本地配置，允许手动清理：

```text
.typola/skill-hub.json
```

或对应用户配置目录中的 `skill-hub.json`。

---

## 15. 样式调整

### 15.1 一级场景卡

建议保持紧凑，避免右侧像市场页。

卡片内容：

```text
图标
场景名
一句话说明
N 个模板
```

示例：

```text
日报周报
日报、周报、月报、数据报表 HTML
2 个模板
```

### 15.2 二级 skill 卡

建议从工具视角改成模板视角。

卡片内容：

```text
模板名
summary
使用：/skill-name
状态 badge
[使用 / 让 Claude 安装]
```

不建议把 GitHub URL 直接显示在主区域，可以保留 GitHub icon。

### 15.3 内置 Badge

新增样式：

```css
.skill-hub-badge.builtin {
  color: var(--text-muted);
  background: var(--surface-subtle);
}
```

---

## 16. 任务拆解

### 阶段 A：数据结构与场景配置

| #  | 任务                                                | 文件                               |
| -- | ------------------------------------------------- | -------------------------------- |
| A1 | 修改 `SkillSceneId`，保留 8 个场景                        | `src/services/agent/skillHub.ts` |
| A2 | 扩展 `SkillTemplateRef`，增加 `builtin/output/prefill` | `src/services/agent/skillHub.ts` |
| A3 | 替换 `SYSTEM_SKILL_SCENES` 为 8 个预置场景                | `src/services/agent/skillHub.ts` |
| A4 | 删除旧 scene id 和旧兼容逻辑                               | `src/services/agent/skillHub.ts` |
| A5 | 增加知识沉淀空场景文案                                       | `SkillHubPanel.tsx` 或独立常量文件      |

### 阶段 B：增强 prefill

| #  | 任务                                              | 文件                                 |
| -- | ----------------------------------------------- | ---------------------------------- |
| B1 | 改造 `buildSkillPrefill(provider, skill, scene)`  | `src/services/agent/skillHub.ts`   |
| B2 | 对 builtin skill 走自然语言 prefill，不生成 slash command | `src/services/agent/skillHub.ts`   |
| B3 | 为核心内置 skill 增加默认 prefill                        | `src/services/agent/skillHub.ts`   |
| B4 | AppLayout 点击 skill 时传完整 scene/skill payload     | `src/app/AppLayout.tsx`            |
| B5 | SkillHubPanel 点击 skill 时传 scene/skill payload   | `src/components/SkillHubPanel.tsx` |

### 阶段 C：UI 调整

| #  | 任务                          | 文件                  |
| -- | --------------------------- | ------------------- |
| C1 | 二级页拆分「推荐 skill / 自定义 skill」 | `SkillHubPanel.tsx` |
| C2 | 自定义 skill 区域放置「+ 添加」按钮      | `SkillHubPanel.tsx` |
| C3 | 增加内置 / 已安装 / 未安装 badge      | `SkillHubPanel.tsx` |
| C4 | 空场景展示业务文案                   | `SkillHubPanel.tsx` |
| C5 | 调整卡片文案：从 skill 工具名转为模板名     | `SkillHubPanel.tsx` |
| C6 | CSS 调整                      | 对应样式文件              |

### 阶段 D：验证

| #   | 任务                                                                     |
| --- | ---------------------------------------------------------------------- |
| D1  | TypeScript typecheck                                                   |
| D2  | SkillHub 一级场景渲染验证                                                      |
| D3  | 二级推荐 skill / 自定义 skill 渲染验证                                            |
| D4  | 本机已安装 / 未安装 / 内置 skill 状态验证                                            |
| D5  | 点击内置 skill，左侧 Composer 注入自然语言 prefill                                  |
| D6  | 点击已安装 third-party skill，左侧 Composer 注入 slash command + prefill         |
| D7  | 点击未安装 skill，发送安装请求                                                     |
| D8  | 添加自定义 skill 到预置场景                                                      |
| D9  | 删除自定义 skill                                                            |
| D10 | `npm run typecheck` / `npm test` / `cargo check` / `tauri:build:local` |

---

## 17. 验收标准

### 17.1 一级场景

* [ ] 右侧 SkillHub 一级页面展示 8 个预置场景。
* [ ] 一级场景不分类。
* [ ] 不出现自定义一级场景入口。
* [ ] 不出现推荐场景分组。
* [ ] 不出现「看板生成」一级场景。
* [ ] PPT 生成和 HTML 生成是两个独立场景。
* [ ] 日报周报场景中包含「数据报表 HTML」。

### 17.2 二级页面

* [ ] 二级页面展示场景说明。
* [ ] 二级页面展示推荐 skill。
* [ ] 二级页面展示自定义 skill 区域。
* [ ] 自定义 skill 支持添加。
* [ ] 系统推荐 skill 不可删除。
* [ ] 用户添加的自定义 skill 可删除。
* [ ] 知识沉淀显示业务空态文案。

### 17.3 skill 状态

* [ ] builtin skill 显示「内置」。
* [ ] 已安装 skill 显示「已安装」。
* [ ] 未安装 skill 显示「未安装」。
* [ ] 未安装 skill 点击后发送安装请求。
* [ ] builtin skill 不走安装流程。

### 17.4 prefill

* [ ] 点击 builtin skill 注入自然语言任务。
* [ ] 点击 Claude skill 注入 `/skill-name + 增强 prefill`。
* [ ] 点击 OpenCode command 注入 provider 对应 prompt。
* [ ] prefill 包含输入、要求、输出、产物目录等信息。
* [ ] 用户仍需手动发送，不自动执行。

### 17.5 无迁移

* [ ] 不实现旧 scene id 迁移。
* [ ] 不保留 `summary`。
* [ ] 不保留 `wechat`。
* [ ] 不保留 `data`。
* [ ] 不保留 `kanban`。
* [ ] 不保留 `publish`。
* [ ] 本地开发旧配置允许手动清理。

---

## 18. 风险与处理

### 18.1 第三方 skill 安装结构不统一

风险：不同仓库的 skill 目录结构不同，有些是整个 repo，有些是 repo 内部子目录。

处理：

* `installSource` 填到精确 skill 目录。
* 安装请求里明确"安装完整 skill 目录，而不是单个文件"。
* 对信息卡等有依赖的 skill，在 summary 或后续详情中提示需要 Playwright / Python 等运行环境。

### 18.2 内置 prompt-only skill 与真实 slash skill 混淆

风险：用户以为 `data-report-html`、`report-summary` 是本机 Claude skill。

处理：

* UI 显示「内置」而不是「已安装」。
* prefill 不生成 `/data-report-html`、`/report-summary`。
* 内置 skill 的执行完全依赖自然语言 prompt。

### 18.3 场景过多导致右侧拥挤

风险：8 个一级场景在右侧可能偏多。

处理：

* 场景卡保持紧凑。
* 搜索框支持过滤。
* 场景说明控制在一行到两行。
* 后续如有必要再引入"最近使用"，但本阶段不做。

### 18.4 org-mode 输出与 Typola Markdown 工作流不一致

部分 `ljg-*` skill 输出 org-mode 文件。

处理：

* 短期接受，作为第三方 skill 原生行为。
* UI 的 output 标记为 `org`。
* 后续可考虑增加 org → Markdown 转换 skill 或预览能力。

### 18.5 知识沉淀暂时空

风险：一级场景存在空态。

处理：

* 空态文案表达"后续支持"，不要写"没有 skill"。
* 保留自定义 skill 区域，允许用户自行添加本机 skill。

---

## 19. 后续建议

### 19.1 数据报表 HTML 后续增强

当前 `data-report-html` 是 prompt-only skill。后续可以增强为真实 skill，支持：

```text
Excel / CSV 读取
事项状态统计
负责人维度统计
风险分布
里程碑进展
HTML 报表模板
ECharts 图表
可打印报表
```

### 19.2 知识沉淀后续方向

知识沉淀建议围绕：

```text
LLM-Wiki
FAQ
术语表
知识索引
llms.txt
代码仓知识包
```

### 19.3 常用工具保持克制

常用工具已经包含：

```text
导入 Markdown
URL 导入
去 AI 味
校对
翻译
Markdown 转 PDF
```

不建议继续扩成完整编辑工具箱，因为浮条已经承接选中文本即时操作。

---

## 20. 最终产品定义

```text
SkillHub 第一阶段采用预置场景卡模式。

右侧一级页面平铺展示系统预置场景，不分类、不支持自定义一级场景。用户点击场景后进入二级页面，二级页面展示场景说明、推荐 skill 和自定义 skill。系统推荐 skill 不可删除，用户可将本机已有 skill 添加到预置场景。

点击 skill 后，Typola 打开左侧 AI 工作台，创建独立会话，并将该场景和 skill 对应的增强 prefill 注入 Composer。用户可以修改后手动发送。系统不自动执行、不弹参数表单、不展示 Chips。生成产物进入 .typola-output，并通过产物中心回流到中间编辑器。

本阶段不做历史数据迁移，不保留旧 scene id，不兼容旧 SkillHub 场景结构。
```
