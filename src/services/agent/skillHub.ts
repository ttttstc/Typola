import { invoke } from '@tauri-apps/api/core';
import type { AgentProvider } from './provider';

export type SkillRef = {
  name: string;
  description?: string;
  supportedProviders?: AgentProvider[];
};

export type SkillTemplateRef = SkillRef & {
  label: string;
  summary: string;
  expectedPath?: string;
  installSource?: string;
  system: true;
};

export type SkillSceneTemplate = {
  id: 'daily' | 'summary' | 'ppt' | 'html' | 'wechat' | 'data';
  label: string;
  description: string;
  /** lucide 图标名,SkillHubPanel 的 SCENE_ICONS 映射到组件 */
  icon: string;
  /** 主题强调色(oklch)。6 场景统一明度/饱和、只转色相 → 可辨识又跟暖奶油调性和谐 */
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

export const SYSTEM_SKILL_SCENES: SkillSceneTemplate[] = [
  {
    id: 'daily',
    label: '日报周报',
    description: '把工作区材料整理成日报、周报、站会同步。',
    icon: 'CalendarDays',
    accent: 'oklch(0.66 0.13 70)',
    skills: [],
  },
  {
    id: 'summary',
    label: '总结报告',
    description: '把长材料浓缩成复盘、项目总结、汇报文档。',
    icon: 'ClipboardList',
    accent: 'oklch(0.62 0.15 25)',
    skills: [],
  },
  {
    id: 'ppt',
    label: 'PPT 制作',
    description: '把文档、提纲和材料转成演示稿或 slide deck。',
    icon: 'Presentation',
    accent: 'oklch(0.58 0.14 300)',
    skills: [
      {
        name: 'huawei-style-ppt-skill',
        label: '华为风格 PPT',
        summary: '生成偏华为汇报风格的结构化 PPT，强调商务汇报、层级标题、稳重版式。',
        expectedPath: 'C:\\Users\\泥巴猪\\.claude\\skills\\huawei-style-ppt-skill',
        installSource: 'https://github.com/zuiho-kai/huawei-style-ppt-skill',
        system: true,
      },
      {
        name: 'guizang-ppt-skill',
        label: '归藏 PPT',
        summary: '生成归藏风格/内容型 PPT，适合把长文档整理成叙事化演示稿。',
        expectedPath: 'C:\\Users\\泥巴猪\\.claude\\skills\\guizang-ppt-skill',
        installSource: 'https://github.com/op7418/guizang-ppt-skill',
        system: true,
      },
      {
        name: 'huashu-slides',
        label: '花叔 Slides',
        summary: '生成话术、销售或表达训练类 slides，适合将材料转成讲稿驱动的演示页。',
        expectedPath: 'C:\\Users\\泥巴猪\\.claude\\skills\\huashu-slides',
        installSource: 'https://github.com/alchaincyf/huashu-skills/tree/master/huashu-slides',
        system: true,
      },
      {
        name: 'baoyu-slide-deck',
        label: '宝玉 Slide Deck',
        summary: '生成面向传播和知识表达的 slide deck，适合文章、课程、观点型内容转演示。',
        expectedPath: 'C:\\Users\\泥巴猪\\.claude\\skills\\baoyu-slide-deck',
        installSource: 'https://github.com/JimLiu/baoyu-skills/tree/main/skills/baoyu-slide-deck',
        system: true,
      },
      {
        name: 'ppt-master',
        label: 'PPT Master',
        summary: '通用 PPT 生成器，支持多种风格和布局，适合将文档快速转成演示稿。',
        expectedPath: 'C:\\Users\\泥巴猪\\.claude\\skills\\ppt-master',
        installSource: 'https://github.com/hugohe3/ppt-master',
        system: true,
      },
    ],
  },
  {
    id: 'html',
    label: 'HTML 制作',
    description: '把文档转成 HTML/CSS 演示页、网页稿或可浏览产物。',
    icon: 'Globe',
    accent: 'oklch(0.63 0.10 195)',
    skills: [
      {
        name: 'frontend-slides',
        label: 'Frontend Slides',
        summary: '生成 HTML/CSS/前端形式的 slides 或演示页面，适合把文档转成可浏览的网页演示。',
        expectedPath: 'C:\\Users\\泥巴猪\\.claude\\skills\\frontend-slides',
        installSource: 'https://github.com/zarazhangrui/frontend-slides',
        system: true,
      },
      {
        name: 'guizang-ppt-skill',
        label: '归藏 PPT（HTML 模板）',
        summary: '生成电子杂志风或瑞士国际主义风的单 HTML 翻页 PPT，含 WebGL 背景、Motion One 动效。',
        expectedPath: 'C:\\Users\\泥巴猪\\.claude\\skills\\guizang-ppt-skill',
        installSource: 'https://github.com/op7418/guizang-ppt-skill',
        system: true,
      },
      {
        name: 'baoyu-markdown-to-html',
        label: '宝玉 Markdown → HTML',
        summary: '将 Markdown 转为带微信兼容主题的样式化 HTML，支持代码高亮、公式、Mermaid/PlantUML 图表。',
        expectedPath: 'C:\\Users\\泥巴猪\\.claude\\skills\\baoyu-markdown-to-html',
        installSource: 'https://github.com/JimLiu/baoyu-skills/tree/main/skills/baoyu-markdown-to-html',
        system: true,
      },
      {
        name: 'html-ppt-skill',
        label: 'HTML PPT Studio',
        summary: '24 套主题、31 种布局、20+ 动效的专业 HTML 演示生成器。',
        expectedPath: 'C:\\Users\\泥巴猪\\.claude\\skills\\html-ppt-skill',
        installSource: 'https://github.com/lewislulu/html-ppt-skill',
        system: true,
      },
    ],
  },
  {
    id: 'wechat',
    label: '公众号文章',
    description: '把素材和想法写成公众号文章，处理选题、结构、风格和排版。',
    icon: 'PenLine',
    accent: 'oklch(0.62 0.13 150)',
    skills: [
      {
        name: 'ni-writer',
        label: 'Ni Writer 公众号',
        summary: '面向公众号的写作 skill，从选题到成稿，处理结构、语气、风格化和排版。',
        expectedPath: 'C:\\Users\\泥巴猪\\.claude\\skills\\ni-writer',
        installSource: 'https://github.com/ttttstc/ni-skill/tree/main/skills/ni-writer',
        system: true,
      },
    ],
  },
  {
    id: 'data',
    label: '数据分析',
    description: '解读表格/日志/指标，生成分析结论与图表（即将支持，可先自行添加 skill）。',
    icon: 'BarChart3',
    accent: 'oklch(0.60 0.13 250)',
    skills: [],
  },
];

export const EMPTY_SKILL_HUB: SkillHub = {
  version: 2,
  sceneAdditions: {},
  hiddenSystemSkills: {},
};

const DEFAULT_SYSTEM_SKILL_PROVIDERS: AgentProvider[] = ['claude'];

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
  const seen = new Set<string>();
  return skills.filter((skill) => {
    const key = skill.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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

function parseLegacyV1(root: Record<string, unknown>): SkillHub {
  const sceneAdditions: Record<string, SkillRef[]> = {};
  if (Array.isArray(root.categories)) {
    for (const category of root.categories) {
      if (!category || typeof category !== 'object') continue;
      const obj = category as Record<string, unknown>;
      const sceneId = typeof obj.id === 'string' && obj.id.trim() ? obj.id.trim() : 'report';
      if (!Array.isArray(obj.skills)) continue;
      sceneAdditions[sceneId] = uniqueSkills(obj.skills.flatMap((entry) => {
        const skill = normalizeSkill(entry);
        return skill ? [skill] : [];
      }));
    }
  }
  return { version: 2, sceneAdditions, hiddenSystemSkills: {} };
}

export function parseSkillHubJson(raw: string): LoadSkillHubResult {
  if (!raw.trim()) return { hub: { ...EMPTY_SKILL_HUB } };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return { hub: { ...EMPTY_SKILL_HUB }, error: `JSON 解析失败: ${(error as Error).message}` };
  }
  if (!parsed || typeof parsed !== 'object') {
    return { hub: { ...EMPTY_SKILL_HUB }, error: 'skill-hub.json 必须是 JSON 对象' };
  }
  const root = parsed as Record<string, unknown>;
  if (root.version === 1 || Array.isArray(root.categories)) {
    return { hub: parseLegacyV1(root) };
  }
  return {
    hub: {
      version: 2,
      sceneAdditions: normalizeSceneAdditions(root.sceneAdditions),
      hiddenSystemSkills: normalizeHiddenSystemSkills(root.hiddenSystemSkills),
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

export function buildSkillInstallPrompt(skill: SkillTemplateRef): string {
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

// 一次性迁移:如果 skill-hub.json 为空,尝试从旧的 flow-scenarios.json 抽出 skillHint 作为用户增补。
// 系统模板始终由代码维护,迁移不会污染或覆盖模板。
export async function migrateFlowScenariosIfStale(): Promise<boolean> {
  let existingRaw = '';
  try {
    existingRaw = await invoke<string>('read_skill_hub');
  } catch {
    // ignore - treat as empty
  }
  if (existingRaw.trim()) {
    const parsed = parseSkillHubJson(existingRaw);
    const hasAdditions = Object.values(parsed.hub.sceneAdditions).some((skills) => skills.length > 0);
    if (!parsed.error && hasAdditions) return false;
  }

  let legacyRaw = '';
  try {
    legacyRaw = await invoke<string>('read_flow_scenarios');
  } catch {
    return false;
  }
  if (!legacyRaw.trim()) return false;

  let legacyParsed: unknown;
  try {
    legacyParsed = JSON.parse(legacyRaw);
  } catch {
    return false;
  }
  if (!Array.isArray(legacyParsed)) return false;

  const hub: SkillHub = { ...EMPTY_SKILL_HUB, sceneAdditions: {} };
  for (const entry of legacyParsed) {
    if (!entry || typeof entry !== 'object') continue;
    const obj = entry as Record<string, unknown>;
    if (typeof obj.skillHint !== 'string') continue;
    const skillName = obj.skillHint.trim().replace(/^\/+/u, '');
    if (!skillName) continue;
    const sceneId = typeof obj.id === 'string' && obj.id.trim() ? obj.id.trim() : 'report';
    hub.sceneAdditions[sceneId] = uniqueSkills([
      ...(hub.sceneAdditions[sceneId] ?? []),
      { name: skillName },
    ]);
  }
  if (!Object.values(hub.sceneAdditions).some((skills) => skills.length > 0)) return false;
  await saveSkillHub(hub);
  return true;
}
