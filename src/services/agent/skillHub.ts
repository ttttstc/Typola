import { invoke } from '@tauri-apps/api/core';
import type { AgentProvider } from './provider';

export type SkillRef = {
  name: string;
  description?: string;
  supportedProviders?: AgentProvider[];
};

export type SkillSceneId =
  | 'common'
  | 'daily'
  | 'report'
  | 'ppt'
  | 'html'
  | 'longform'
  | 'knowledge'
  | 'research';

/**
 * 系统预置 skill 模板。
 *
 * - `label/summary` UI 展示用的中文名和简介
 * - `installSource` GitHub 来源 URL（"让 Claude 安装" 提示、UI GitHub 跳转）
 * - `expectedPath` 本机已安装 skill 的绝对路径（扫描时匹配）
 * - `prefill` builtin skill 的场景化增强 prompt,点击后注入 Composer
 * - `output` 产物类型,仅用于 UI 标识产物类型,不参与执行
 * - `builtin` true 表示 Typola 内置 prompt-only skill,不依赖本机 Claude,
 *   执行完全靠自然语言 prompt;UI 显示「内置」badge 且不走「让 Claude 安装」
 */
export type SkillTemplateRef = SkillRef & {
  label: string;
  summary: string;
  expectedPath?: string;
  installSource?: string;
  system: true;
  prefill?: string;
  output?: 'markdown' | 'html' | 'pdf' | 'ppt' | 'png' | 'org' | 'mixed';
  builtin?: boolean;
};

export type SkillSceneTemplate = {
  id: SkillSceneId;
  label: string;
  description: string;
  /** lucide 图标名，SkillHubPanel 的 SCENE_ICONS 映射到组件 */
  icon: string;
  /** 主题强调色(oklch)。8 场景统一明度/饱和、只转色相 → 可辨识又跟暖奶油调性和谐 */
  accent: string;
  skills: SkillTemplateRef[];
};

export type SkillHubUserData = {
  version: 2;
  sceneAdditions: Record<string, SkillRef[]>;
  hiddenSystemSkills: Record<string, string[]>;
};

export type SkillHub = SkillHubUserData;

export type LoadSkillHubResult = {
  hub: SkillHub;
  error?: string;
};

/**
 * SkillHubPanel → AppLayout 的点击契约。
 * scene 用于 prefill fallback goal,skill.template 用于 builtin/prefill 派生。
 */
export type SkillPickPayload = {
  scene: SkillSceneTemplate;
  skill: {
    name: string;
    label?: string;
    template?: SkillTemplateRef;
  };
};

const DEFAULT_SYSTEM_SKILL_PROVIDERS: AgentProvider[] = ['claude'];

export const SYSTEM_SKILL_SCENES: SkillSceneTemplate[] = [
  {
    id: 'common',
    label: '常用工具',
    description: '最高频的文档处理入口:导入 Markdown、URL 导入、去 AI 味、翻译、Markdown 转 PDF。',
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
        summary: '基于 blader/humanizer,将英文 / 通用文本改得更自然,减少 AI 味、模板腔和过度总结感。',
        installSource: 'https://github.com/blader/humanizer',
        output: 'markdown',
        system: true,
      },
      {
        name: 'humanizer-zh',
        label: '中文去 AI 味',
        summary: '基于 op7418/Humanizer-zh,针对中文写作去 AI 味、模板腔、翻译腔和不自然表达。',
        installSource: 'https://github.com/op7418/Humanizer-zh',
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
        prefill: `请基于当前文档、表格、事项列表或项目材料,生成一份可独立浏览的数据报表 HTML。

适用场景:周报 / 月报 / 项目进展 / 数据指标汇报,需要在一页 HTML 里读全。

执行步骤:
1. 梳理输入:从材料中识别可用数据项(事项、状态、负责人、时间、风险、进展、关键指标、表格)。
2. 分类归桶:把每条信息放进对应分区——摘要、关键指标、事项明细、风险、下一步。
3. 表格转写:材料中的表格保留列结构,转成 HTML <table>;松散字段按上下文合并或拆分。
4. 不确定性处理:缺失或无法确认的字段统一标记为「待确认」,不编造数据、时间、负责人。

格式要求:
- 单文件 HTML,CSS 内联或 <style> 块,不依赖外部资源
- 配色克制、信息密度高、可读优先于装饰
- 标题层级清晰(H1 总览 → H2 分区 → H3 子项)

输出:
- 保存为单文件 HTML 到当前会话产物目录
- 文件名带场景与日期标签(如 report-2025-01-15.html)`,
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
        prefill: `请基于当前文档、附件或工作区材料,生成一份可直接交付的结构化总结报告。

输入:
- 当前文档(必读)
- 当前选中文本(若有,优先围绕它展开)
- 当前工作区相关材料(按需引用)

执行步骤:
1. 通读材料,列出所有可用的事实条目(项目名、时间、负责人、数据、结论、关键事件)。
2. 先提炼 3-5 条核心结论,再展开。
3. 按以下结构组织:
   - 核心结论:开门见山,给决策者直接读的判断
   - 背景与上下文:必要的环境信息,不要铺垫过多
   - 关键进展:已完成 / 进行中 / 卡住 三段式
   - 问题与风险:明确分级(已识别 / 待观察),不混入决策建议
   - 建议与下一步:可执行项 + 责任人 + 时间(材料里能拿到才写)

写作规范:
- 保留原文关键术语和数据,不改写为同义表达
- 删除空话、套话、重复句
- 对不确定的信息统一标记「待确认」
- 不编造材料中没有的事实、人名、时间、数据

输出:
- Markdown 文档,可以直接编辑
- 保存到当前会话产物目录
- 文件名带场景与日期标签`,
      },
      {
        name: 'project-retro-report',
        label: '项目复盘报告',
        summary: '从项目材料中提炼背景、目标、进展、问题、复盘结论和改进建议。',
        builtin: true,
        output: 'markdown',
        system: true,
        prefill: `请基于当前项目材料,生成一份适合项目管理和团队复盘的结构化复盘报告。

执行步骤:
1. 通读材料,按时间轴提取关键节点(启动 / 里程碑 / 决策点 / 卡点 / 收尾)。
2. 把所有可获取的数据、决策、问题归类到以下结构:
   - 背景与目标:项目缘起、设定目标、衡量指标
   - 关键时间线:按日期或阶段列出关键事件
   - 完成情况:对照原目标评估(达成 / 部分达成 / 未达成)
   - 问题与风险:发生的问题 + 触发条件 + 影响范围
   - 原因分析:区分表象原因和根因,至少做一层根因追问
   - 经验教训:可复用的判断 / 决策模式,不写成口号
   - 改进建议:可执行的下一阶段动作,每条带责任归属建议
   - 下一步计划:3-6 个月内可推进的事项

写作规范:
- 尽量从材料提取事实,对无法确认的事项标「待确认」
- 不编造人名、时间、数据、责任归属
- 语言克制、具体、可证伪
- 避免「反思不足」「沟通不到位」类空泛表达,换成具体场景描述

输出:
- Markdown
- 保存到当前会话产物目录`,
      },
      {
        name: 'executive-summary',
        label: '高管摘要',
        summary: '将长材料压缩成一页式摘要，突出结论、风险、决策点和下一步。',
        builtin: true,
        output: 'markdown',
        system: true,
        prefill: `请将当前材料压缩成一页式高管摘要(500-800 字以内),让读者 60 秒内能拿到决策所需信息。

执行步骤:
1. 通读材料,识别:
   - 3 条核心结论(按重要性排序,开门见山)
   - 关键决策点(需要管理层立即拍板的事项)
   - 主要风险(影响范围 + 严重性)
   - 收益 / 成本要点
   - 后续可执行的下一步
2. 按以下结构组织(每段控制在 3-5 行):
   - 核心结论:3 条,按重要性降序
   - 当前进展:1-2 段,状态快照
   - 关键风险:分级(高 / 中 / 低)+ 影响范围
   - 需要决策:列出 2-4 个待决事项,每条标注建议倾向
   - 下一步建议:3-5 条具体行动

写作规范:
- 不展开过程细节,不铺垫
- 保留关键数据、人名、时间、金额等具体事实
- 不编造材料中没有的信息,对不确定项标「待确认」
- 一段一意,不用连接词堆砌

输出:
- Markdown
- 一页可读(不超过 800 字)
- 保存到当前会话产物目录`,
      },
      {
        name: 'editorial-card-screenshot',
        label: '编辑风信息卡',
        summary: '将文章、笔记或材料生成 editorial-style 信息卡，支持 HTML 和 PNG 输出。',
        installSource: 'https://github.com/shaom/infocard-skills/tree/main/skills/editorial-card-screenshot',
        output: 'mixed',
        system: true,
        prefill: `请基于当前文档或选中文本生成一张信息卡。

要求:
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

要求:
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
        label: '归藏 PPT(HTML 模板)',
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

export const EMPTY_SKILL_HUB: SkillHub = {
  version: 2,
  sceneAdditions: {},
  hiddenSystemSkills: {},
};

export function supportsSkillProvider(skill: SkillTemplateRef, provider: AgentProvider): boolean {
  return (skill.supportedProviders ?? DEFAULT_SYSTEM_SKILL_PROVIDERS).includes(provider);
}

export function getSystemSkillScenesForProvider(provider: AgentProvider): SkillSceneTemplate[] {
  return SYSTEM_SKILL_SCENES.map((scene) => ({
    ...scene,
    skills: scene.skills.filter((skill) => supportsSkillProvider(skill, provider)),
  }));
}

export function getSceneAdditionsForProvider(hub: SkillHub, sceneId: string, provider: AgentProvider): SkillRef[] {
  return (hub.sceneAdditions[sceneId] ?? []).filter((skill) => (
    skill.supportedProviders ?? DEFAULT_SYSTEM_SKILL_PROVIDERS
  ).includes(provider));
}

export function skillCapabilityLabel(provider: AgentProvider): string {
  return provider === 'opencode' ? 'OpenCode command' : 'Claude skill';
}

/**
 * 点击 skill 时注入左侧 AI Composer 的增强 prefill。
 *
 * 三种情况:
 * 1. builtin skill: 仅注入 prefill 文本,不生成 `/name` slash command,
 *    因为 builtin 不依赖本机 Claude(执行完全靠自然语言)。
 * 2. 有 prefill 模板的 skill: `/name` (claude) 或 `请使用 name:` (opencode) + 增强 prefill。
 * 3. 无 prefill 模板的 skill: 用 scene 派生默认目标作为 fallback,避免空白。
 *
 * scene 可选;当 UI 拿不到 scene 时也能用,fallback 会降级到不带场景名的通用目标。
 */
export function buildSkillPrefill(
  provider: AgentProvider,
  skill: SkillTemplateRef | SkillRef,
  scene?: SkillSceneTemplate,
): string {
  const name = skill.name.trim().replace(/^\/+/u, '');
  if (!name) return '';

  const template = 'prefill' in skill ? skill.prefill?.trim() : undefined;
  const builtin = 'builtin' in skill ? Boolean(skill.builtin) : false;

  if (builtin) {
    return template ?? '';
  }

  if (template) {
    return provider === 'opencode'
      ? `请使用 ${name}：\n\n${template}`
      : `/${name}\n\n${template}`;
  }

  const label = 'label' in skill && skill.label ? skill.label : name;
  const fallbackGoal = scene
    ? `请基于当前文档执行「${scene.label}」场景下的「${label}」任务。`
    : `请使用 ${name} 完成当前任务。`;

  return provider === 'opencode'
    ? `请使用 ${name}：\n\n${fallbackGoal}`
    : `/${name}\n\n${fallbackGoal}`;
}

function normalizeSkill(raw: unknown): SkillRef | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.name !== 'string') return null;
  const name = obj.name.trim().replace(/^\/+/u, '');
  if (!name) return null;
  return {
    name,
    description: typeof obj.description === 'string' && obj.description.trim()
      ? obj.description.trim()
      : undefined,
    supportedProviders: normalizeSupportedProviders(obj.supportedProviders),
  };
}

function normalizeSupportedProviders(raw: unknown): AgentProvider[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const providers = raw.filter((value): value is AgentProvider => value === 'claude' || value === 'opencode');
  return providers.length > 0 ? [...new Set(providers)] : undefined;
}

function uniqueSkills(skills: SkillRef[]): SkillRef[] {
  const merged = new Map<string, SkillRef>();
  for (const skill of skills) {
    const key = skill.name.toLowerCase();
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, skill);
      continue;
    }
    const providers = new Set<AgentProvider>([
      ...(existing.supportedProviders ?? []),
      ...(skill.supportedProviders ?? []),
    ]);
    merged.set(key, {
      ...existing,
      description: existing.description ?? skill.description,
      supportedProviders: providers.size > 0 ? [...providers] : undefined,
    });
  }
  return [...merged.values()];
}

function normalizeSceneAdditions(raw: unknown): Record<string, SkillRef[]> {
  if (!raw || typeof raw !== 'object') return {};
  const additions: Record<string, SkillRef[]> = {};
  for (const [sceneId, entries] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(entries)) continue;
    additions[sceneId] = uniqueSkills(entries.flatMap((entry) => {
      const skill = normalizeSkill(entry);
      return skill ? [skill] : [];
    }));
  }
  return additions;
}

function normalizeHiddenSystemSkills(raw: unknown): Record<string, string[]> {
  if (!raw || typeof raw !== 'object') return {};
  const hidden: Record<string, string[]> = {};
  for (const [sceneId, entries] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(entries)) continue;
    hidden[sceneId] = entries.flatMap((entry) => (
      typeof entry === 'string' && entry.trim() ? [entry.trim().replace(/^\/+/u, '')] : []
    ));
  }
  return hidden;
}

export function parseSkillHubJson(raw: unknown): LoadSkillHubResult {
  if (typeof raw !== 'string' || !raw.trim()) return { hub: { ...EMPTY_SKILL_HUB } };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return { hub: { ...EMPTY_SKILL_HUB }, error: `JSON 解析失败: ${(error as Error).message}` };
  }
  if (!parsed || typeof parsed !== 'object') {
    return { hub: { ...EMPTY_SKILL_HUB }, error: 'skill-hub.json 必须是 JSON 对象' };
  }
  return {
    hub: {
      version: 2,
      sceneAdditions: normalizeSceneAdditions((parsed as Record<string, unknown>).sceneAdditions),
      hiddenSystemSkills: normalizeHiddenSystemSkills((parsed as Record<string, unknown>).hiddenSystemSkills),
    },
  };
}

export function serializeSkillHub(hub: SkillHub): string {
  return JSON.stringify({
    version: 2,
    sceneAdditions: normalizeSceneAdditions(hub.sceneAdditions),
    hiddenSystemSkills: normalizeHiddenSystemSkills(hub.hiddenSystemSkills),
  }, null, 2);
}

export function addSkillToScene(hub: SkillHub, sceneId: string, skill: SkillRef): SkillHub {
  const normalized = normalizeSkill(skill);
  if (!normalized) return hub;
  return {
    ...hub,
    sceneAdditions: {
      ...hub.sceneAdditions,
      [sceneId]: uniqueSkills([...(hub.sceneAdditions[sceneId] ?? []), normalized]),
    },
  };
}

export function removeCustomSkillFromScene(hub: SkillHub, sceneId: string, skillName: string): SkillHub {
  return {
    ...hub,
    sceneAdditions: {
      ...hub.sceneAdditions,
      [sceneId]: (hub.sceneAdditions[sceneId] ?? []).filter((skill) => skill.name !== skillName),
    },
  };
}

export function buildSkillInstallPrompt(skill: SkillTemplateRef, provider: AgentProvider = 'claude'): string {
  // builtin prompt-only skill:依赖 prefill 文本作为该 skill 的执行说明,
  // 必须把 prefill 原文喂给 Claude,并明确要求 Claude 在本机创建 SKILL.md,
  // 否则安装流程只能拿到一个名字 + 用途,无法产出可用的本地 skill。
  if (skill.builtin && skill.prefill) {
    if (provider === 'opencode') {
      return [
        `请帮我把内置 Typola skill「${skill.name}」安装为本地 OpenCode command。`,
        `用途:${skill.summary}`,
        ``,
        `该 skill 的执行说明(请完整写入 command 文件作为核心指令):`,
        ``,
        skill.prefill,
        ``,
        `步骤:`,
        `1. 在合适的目录创建 .opencode/commands/${skill.name}.md(项目级),或全局 ~/.config/opencode/commands/${skill.name}.md(Windows: %USERPROFILE%\\.config\\opencode\\commands\\${skill.name}.md)`,
        `2. 把上面「执行说明」完整写入该文件`,
        `3. 文件顶部加 YAML frontmatter:`,
        `   name: ${skill.name}`,
        `   description: ${skill.summary}`,
        `4. 安装后确认可以通过 opencode run --command ${skill.name} 调用`,
      ].join('\n');
    }
    return [
      `请帮我把内置 Typola skill「${skill.name}」安装为本地 Claude skill。`,
      `用途:${skill.summary}`,
      ``,
      `该 skill 的执行说明(请完整写入 SKILL.md 作为核心指令):`,
      ``,
      skill.prefill,
      ``,
      `步骤:`,
      `1. 在本机 Claude skills 目录创建 ${skill.name}/SKILL.md(默认 ~/.claude/skills/${skill.name}/SKILL.md)`,
      `2. 把上面「执行说明」完整写入该文件`,
      `3. 文件顶部加 YAML frontmatter:`,
      `   name: ${skill.name}`,
      `   description: ${skill.summary}`,
      `4. 安装后确认可以通过 /${skill.name} 调用`,
    ].join('\n');
  }

  if (provider === 'opencode') {
    const source = skill.installSource ?? '未提供来源，请根据用途创建 command 内容';
    return [
      `请帮我创建或安装 OpenCode command：${skill.name}。`,
      `用途：${skill.summary}`,
      `来源：${source}`,
      `请优先安装到当前工作区 .opencode/commands/${skill.name}.md；如果不适合项目级安装，则安装到全局 ~/.config/opencode/commands/${skill.name}.md(Windows: %USERPROFILE%\\.config\\opencode\\commands\\${skill.name}.md),或写入 opencode.jsonc 的 command.${skill.name} 配置。`,
      `安装后请确认该 command 可以通过 opencode run --command ${skill.name} 调用。`,
    ].join('\n');
  }
  const source = skill.installSource ?? skill.expectedPath ?? skill.name;
  return [
    `请帮我安装 Claude skill：${skill.name}。`,
    `用途：${skill.summary}`,
    `来源：${source}`,
    skill.expectedPath ? `建议安装路径：${skill.expectedPath}` : undefined,
    `安装后请确认该 skill 可以通过 /${skill.name} 调用。`,
  ].filter(Boolean).join('\n');
}

export async function loadSkillHub(): Promise<LoadSkillHubResult> {
  try {
    const raw = await invoke<string>('read_skill_hub');
    return parseSkillHubJson(raw);
  } catch (error) {
    console.warn('Failed to read skill-hub:', error);
    return { hub: { ...EMPTY_SKILL_HUB }, error: `读 skill-hub.json 失败: ${String(error)}` };
  }
}

export async function saveSkillHub(hub: SkillHub): Promise<void> {
  await invoke('write_skill_hub', { content: serializeSkillHub(hub) });
}
