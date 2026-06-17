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
  if (typeof candidate.description !== 'string') return null;
  return {
    id: candidate.id,
    label: candidate.label,
    icon: typeof candidate.icon === 'string' ? candidate.icon : undefined,
    description: candidate.description,
    guidance: typeof candidate.guidance === 'string' ? candidate.guidance : undefined,
    promptTemplate: candidate.promptTemplate,
    skillHint: typeof candidate.skillHint === 'string' ? candidate.skillHint : undefined,
  };
}

export function parseFlowScenariosJson(raw: string): FlowScenario[] {
  if (!raw.trim()) return [...FLOW_SCENARIO_DEFAULT_SEED];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...FLOW_SCENARIO_DEFAULT_SEED];
    const normalized = parsed
      .map((entry) => normalizeScenario(entry))
      .filter((entry): entry is FlowScenario => entry !== null);
    return normalized.length > 0 ? normalized : [...FLOW_SCENARIO_DEFAULT_SEED];
  } catch {
    return [...FLOW_SCENARIO_DEFAULT_SEED];
  }
}

export function serializeFlowScenarios(scenarios: FlowScenario[]): string {
  return JSON.stringify(scenarios, null, 2);
}

export async function readFlowScenarios(): Promise<FlowScenario[]> {
  try {
    const raw = await invoke<string>('read_flow_scenarios');
    return parseFlowScenariosJson(raw);
  } catch (error) {
    console.warn('Failed to read flow scenarios:', error);
    return [...FLOW_SCENARIO_DEFAULT_SEED];
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
