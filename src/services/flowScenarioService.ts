import { invoke } from '@tauri-apps/api/core';
import { FLOW_SCENARIO_DEFAULT_SEED, type FlowScenario, type FlowScenarioContext } from '../types/flowScenario';

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function safeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

export function resolveFlowScenarioTemplate(template: string, ctx: FlowScenarioContext): string {
  return template
    .replace(/\{file\}/g, safeString(ctx.file, ''))
    .replace(/\{fileName\}/g, safeString(ctx.fileName, ''))
    .replace(/\{workspace\}/g, safeString(ctx.workspace, ''))
    .replace(/\{date\}/g, safeString(ctx.date, formatDate(new Date())));
}

function normalizeScenario(raw: unknown): FlowScenario | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Record<string, unknown>;
  if (typeof candidate.id !== 'string' || !candidate.id.trim()) return null;
  if (typeof candidate.label !== 'string' || !candidate.label.trim()) return null;
  if (typeof candidate.promptTemplate !== 'string' || !candidate.promptTemplate.trim()) return null;
  // description 不是渲染关键路径必填:用户写 JSON 时常省略,默认空串
  const description = typeof candidate.description === 'string' ? candidate.description : '';
  return {
    id: candidate.id,
    label: candidate.label,
    icon: typeof candidate.icon === 'string' ? candidate.icon : undefined,
    description,
    guidance: typeof candidate.guidance === 'string' ? candidate.guidance : undefined,
    promptTemplate: candidate.promptTemplate,
    skillHint: typeof candidate.skillHint === 'string' ? candidate.skillHint : undefined,
  };
}

export type ParseFlowScenariosResult = {
  scenarios: FlowScenario[];
  error?: string;
};

export function parseFlowScenariosJson(raw: string): ParseFlowScenariosResult {
  // 空文件:首次启动,文件未创建 — 静默用 seed,不算错误
  if (!raw.trim()) return { scenarios: [...FLOW_SCENARIO_DEFAULT_SEED] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    // P1-D:解析失败只读不覆盖,把错误透传给 UI 红条,不再用 seed 静默回退
    return { scenarios: [], error: `JSON 解析失败: ${(error as Error).message}` };
  }
  if (!Array.isArray(parsed)) {
    return { scenarios: [], error: '场景注册表必须为 JSON 数组' };
  }
  const normalized = parsed
    .map((entry) => normalizeScenario(entry))
    .filter((entry): entry is FlowScenario => entry !== null);
  if (normalized.length === 0) {
    return { scenarios: [], error: '所有场景都缺少必填字段(id / label / promptTemplate)' };
  }
  return { scenarios: normalized };
}

export function serializeFlowScenarios(scenarios: FlowScenario[]): string {
  return JSON.stringify(scenarios, null, 2);
}

export async function readFlowScenarios(): Promise<ParseFlowScenariosResult> {
  try {
    const raw = await invoke<string>('read_flow_scenarios');
    return parseFlowScenariosJson(raw);
  } catch (error) {
    // 读文件失败:Rust 端已经只读不覆盖,这里把 seed 当作"全新启动"状态用
    // 同时把 error 透传给 UI,让用户知道有 IO 异常
    console.warn('Failed to read flow scenarios:', error);
    return { scenarios: [...FLOW_SCENARIO_DEFAULT_SEED], error: `读场景注册表失败: ${String(error)}` };
  }
}

export async function writeFlowScenarios(scenarios: FlowScenario[]): Promise<void> {
  await invoke('write_flow_scenarios', { content: serializeFlowScenarios(scenarios) });
}

export async function openFlowScenariosFile(): Promise<string> {
  return invoke<string>('open_flow_scenarios_file');
}

export function buildContextFromFile(filePath: string, workspaceRoot?: string): FlowScenarioContext {
  const fileName = filePath
    .replace(/\\/g, '/')
    .split('/')
    .pop() ?? '';
  const dotIndex = fileName.lastIndexOf('.');
  const baseName = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
  let relative: string;
  if (workspaceRoot) {
    const normalizedRoot = workspaceRoot.replace(/\\/g, '/').replace(/\/$/, '');
    const normalizedFile = filePath.replace(/\\/g, '/');
    if (normalizedFile.toLowerCase().startsWith(normalizedRoot.toLowerCase() + '/')) {
      relative = normalizedFile.slice(normalizedRoot.length + 1);
    } else {
      relative = fileName;
    }
  } else {
    relative = fileName;
  }
  return {
    file: relative,
    fileName: baseName,
    workspace: workspaceRoot,
  };
}
