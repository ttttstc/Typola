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
 * 系统预置 skill 模板。`label/summary` 是 UI 展示用的中文名和简介，
 * `installSource` 是该 skill 在 GitHub 的来源 URL（用于"让 Claude 安装"
 * 提示里给来源、UI 里展示 GitHub 跳转）。
 * `expectedPath` 是本机已安装 skill 的绝对路径（如有），用于扫描时匹配。
 *
 * builtin / prefill / output 字段属于 UI 与交互层（PR 2、PR 3），
 * PR 1 数据底座不引入，避免引入无消费者的字段。
 */
export type SkillTemplateRef = SkillRef & {
  label: string;
  summary: string;
  expectedPath?: string;
  installSource?: string;
  system: true;
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
        system: true,
      },
      {
        name: 'baoyu-url-to-markdown',
        label: 'URL 导入',
        summary: '将网页 URL 转换为 Markdown，适合资料摘录和知识入库。',
        installSource: 'https://github.com/JimLiu/baoyu-skills/tree/main/skills/baoyu-url-to-markdown',
        system: true,
      },
      {
        name: 'humanizer',
        label: '去 AI 味',
        summary: '将文本改得更自然，减少 AI 味、模板腔和过度总结感。',
        system: true,
      },
      {
        name: 'huashu-proofreading',
        label: '文稿校对',
        summary: '对文稿进行校对、润色和表达优化，适合消除机器感和低质表达。',
        installSource: 'https://github.com/alchaincyf/huashu-skills/tree/master/huashu-proofreading',
        system: true,
      },
      {
        name: 'baoyu-translate',
        label: '翻译',
        summary: '进行中英或多语言翻译，保留原文结构并输出自然译文。',
        installSource: 'https://github.com/JimLiu/baoyu-skills/blob/main/skills/baoyu-translate',
        system: true,
      },
      {
        name: 'huashu-md-to-pdf',
        label: 'Markdown 转 PDF',
        summary: '将 Markdown 文档转换为 PDF，适合报告、长文和交付件导出。',
        installSource: 'https://github.com/alchaincyf/huashu-skills/tree/master/huashu-md-to-pdf',
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
        system: true,
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
        name: 'editorial-card-screenshot',
        label: '编辑风信息卡',
        summary: '将文章、笔记或材料生成 editorial-style 信息卡，支持 HTML 和 PNG 输出。',
        installSource: 'https://github.com/shaom/infocard-skills/tree/main/skills/editorial-card-screenshot',
        system: true,
      },
      {
        name: 'info-card-designer',
        label: '乔木信息卡',
        summary: '将文本或 URL 一键转成杂志质感信息卡，并自动截图输出 PNG。',
        installSource: 'https://github.com/joeseesun/qiaomu-info-card-designer',
        system: true,
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
        system: true,
      },
      {
        name: 'guizang-ppt-skill',
        label: '归藏 PPT',
        summary: '生成归藏风格或内容型 PPT，适合把长文档整理成叙事化演示稿。',
        installSource: 'https://github.com/op7418/guizang-ppt-skill',
        system: true,
      },
      {
        name: 'huashu-slides',
        label: '花叔 Slides',
        summary: '生成话术、销售或表达训练类 slides，适合将材料转成讲稿驱动的演示页。',
        installSource: 'https://github.com/alchaincyf/huashu-skills/tree/master/huashu-slides',
        system: true,
      },
      {
        name: 'baoyu-slide-deck',
        label: '宝玉 Slide Deck',
        summary: '生成面向传播和知识表达的 slide deck，适合文章、课程、观点型内容转演示。',
        installSource: 'https://github.com/JimLiu/baoyu-skills/tree/main/skills/baoyu-slide-deck',
        system: true,
      },
      {
        name: 'ppt-master',
        label: 'PPT Master',
        summary: '通用 PPT 生成器，支持多种风格和布局，适合将文档快速转成演示稿。',
        installSource: 'https://github.com/hugohe3/ppt-master',
        system: true,
      },
      {
        name: 'huashu-design',
        label: '花叔 Design',
        summary: '生成更有设计感的演示页或视觉化表达稿，适合汇报、发布和内容包装。',
        installSource: 'https://github.com/alchaincyf/huashu-skills/tree/master/huashu-design',
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
        system: true,
      },
      {
        name: 'guizang-ppt-skill',
        label: '归藏 PPT(HTML 模板)',
        summary: '生成电子杂志风或瑞士国际主义风的单 HTML 翻页 PPT。',
        installSource: 'https://github.com/op7418/guizang-ppt-skill',
        system: true,
      },
      {
        name: 'baoyu-markdown-to-html',
        label: '宝玉 Markdown → HTML',
        summary: '将 Markdown 转为样式化 HTML，适合文章、公众号或网页发布。',
        installSource: 'https://github.com/JimLiu/baoyu-skills/tree/main/skills/baoyu-markdown-to-html',
        system: true,
      },
      {
        name: 'html-ppt-skill',
        label: 'HTML PPT Studio',
        summary: '生成带主题、布局和动效的 HTML 演示稿。',
        installSource: 'https://github.com/lewislulu/html-ppt-skill',
        system: true,
      },
      {
        name: 'md2html',
        label: 'md2html 文档网页',
        summary: '把长文档、设计、RFC、复盘转成带目录、图表和卡片的自包含 HTML 网页。',
        installSource: 'https://github.com/haidang1810/md2html',
        system: true,
      },
      {
        name: 'huashu-md-html',
        label: '花叔 Markdown HTML',
        summary: '将 Markdown 转成结构化 HTML 页面，适合文档发布、展示和交付。',
        installSource: 'https://github.com/alchaincyf/huashu-skills/tree/master/huashu-md-html',
        system: true,
      },
      {
        name: 'huashu-design',
        label: '花叔 Design',
        summary: '生成更有设计感的 HTML 页面或视觉化内容交付物。',
        installSource: 'https://github.com/alchaincyf/huashu-skills/tree/master/huashu-design',
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
        system: true,
      },
      {
        name: 'ni-writer',
        label: 'Ni Writer',
        summary: '面向公众号和长文内容生产，从选题、结构到成稿处理写作流程。',
        installSource: 'https://github.com/ttttstc/ni-skill/tree/main/skills/ni-writer',
        system: true,
      },
      {
        name: 'ljg-writes',
        label: '深度观点文章',
        summary: '对准一个观点层层剖开，生成 1000–1500 字的批判性观点文章。',
        installSource: 'https://github.com/lijigang/ljg-skills/tree/master/skills/ljg-writes',
        system: true,
      },
      {
        name: 'ljg-plain',
        label: '白话重写',
        summary: '将内容改写成更容易理解的白话表达，让聪明的 12 岁孩子也能复述。',
        installSource: 'https://github.com/lijigang/ljg-skills/tree/master/skills/ljg-plain',
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
        system: true,
      },
      {
        name: 'ljg-paper',
        label: '论文解读',
        summary: '将论文讲成一个连续故事，输出速读卡、核心命题、论证和启发。',
        installSource: 'https://github.com/lijigang/ljg-skills/tree/master/skills/ljg-paper',
        system: true,
      },
      {
        name: 'ljg-think',
        label: '深度追问',
        summary: '对一个观点、现象或问题纵向下钻，追到不可再分的本质。',
        installSource: 'https://github.com/lijigang/ljg-skills/tree/master/skills/ljg-think',
        system: true,
      },
      {
        name: 'ljg-learn',
        label: '概念解剖',
        summary: '从历史、辩证、现象、语言、形式、存在、美感、元反思等维度解剖概念。',
        installSource: 'https://github.com/lijigang/ljg-skills/tree/master/skills/ljg-learn',
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

export function buildSkillPrefill(provider: AgentProvider, skillName: string): string {
  const name = skillName.trim().replace(/^\/+/u, '');
  if (!name) return '';
  return provider === 'opencode' ? `请使用 ${name}：` : `/${name} `;
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
