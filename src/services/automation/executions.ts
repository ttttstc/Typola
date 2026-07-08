import type { AutomationExecution } from './types';

const STORAGE_KEY = 'typola-automation-executions-demo';

export function loadAutomationExecutions(): AutomationExecution[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is AutomationExecution => (
      item && typeof item.id === 'string' && typeof item.templateId === 'string'
    )) : [];
  } catch {
    return [];
  }
}

export function saveAutomationExecution(execution: AutomationExecution): AutomationExecution[] {
  const current = loadAutomationExecutions();
  const next = [
    execution,
    ...current.filter((item) => item.id !== execution.id),
  ].slice(0, 20);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // 历史记录写入失败不影响自动化运行。
  }
  return next;
}
