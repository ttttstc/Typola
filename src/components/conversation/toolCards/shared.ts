// ToolCard 共享工具 + TodoWrite 解析。
//
// 拆分原因:
// - truncate / describeInput 多个 card 复用,纯函数
// - parseTodoWriteInput / isTodoWriteToolName fork 自 OpenDesign runtime/todos.ts
//   (Typola 无独立 runtime/ 目录,直接挂在 toolCards 私有)
// - ResultShape 是 OpenDesign ToolCardProps.result 的本地再表达,
//   把上游 AgentToolCall.result (string) 适配为 OpenDesign 期望的 { content, isError }

export type ResultShape = {
  content: string;
  isError: boolean;
};

export type ToolFamily =
  | 'todo'
  | 'file-write'
  | 'file-edit'
  | 'file-read'
  | 'bash'
  | 'glob'
  | 'grep'
  | 'web-fetch'
  | 'web-search'
  | 'generic';

// 通用工具:超长文本截断
export function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + '…';
}

// 从 tool input 推断单行摘要(用于 GenericCard / head meta)
export function describeInput(input: unknown): string {
  if (input == null) return '';
  if (typeof input === 'string') return input;
  if (typeof input !== 'object') return String(input);
  const obj = input as Record<string, unknown>;
  for (const key of ['file_path', 'path', 'pattern', 'url', 'query', 'name', 'command']) {
    const v = obj[key];
    if (typeof v === 'string' && v) return v;
  }
  try {
    return JSON.stringify(obj);
  } catch {
    return '';
  }
}

// 路径 → basename
export function basenameOf(filePath: string): string {
  if (!filePath) return '';
  return filePath.split('/').pop() ?? filePath;
}

// ============= TodoWrite 解析 (fork 自 OpenDesign runtime/todos.ts) =============
//
// 解析策略:
// - Claude / OpenCode 都把 todo 列表作为 tool_use 的 input 注入
// - 常见字段:`{ todos: [{ content, status, activeForm? }] }` 或 `{ plan: [...] }`
// - status 容忍:`pending` / `in_progress` / `completed` / `stopped`
//   (`cancelled` / `canceled` / `failed` 一律归并为 `stopped`)

export type TodoStatus = 'pending' | 'in_progress' | 'completed' | 'stopped';

export type TodoItem = {
  content: string;
  status: TodoStatus;
  activeForm?: string;
};

export function parseTodoWriteInput(input: unknown): TodoItem[] {
  if (!input || typeof input !== 'object') return [];
  const obj = input as { plan?: unknown; todos?: unknown };
  const rawItems = Array.isArray(obj.todos)
    ? obj.todos
    : Array.isArray(obj.plan)
      ? obj.plan
      : [];
  const out: TodoItem[] = [];
  for (const raw of rawItems) {
    if (!raw || typeof raw !== 'object') continue;
    const record = raw as Record<string, unknown>;
    const content =
      typeof record.content === 'string'
        ? record.content
        : typeof record.step === 'string'
          ? record.step
          : '';
    if (!content) continue;
    const status = normalizeTodoStatus(record.status);
    const activeForm =
      typeof record.activeForm === 'string'
        ? record.activeForm
        : typeof record.active_form === 'string'
          ? record.active_form
          : undefined;
    out.push(activeForm ? { content, status, activeForm } : { content, status });
  }
  return out;
}

function normalizeTodoStatus(status: unknown): TodoStatus {
  if (status === 'completed' || status === 'in_progress' || status === 'stopped') {
    return status;
  }
  if (status === 'cancelled' || status === 'canceled' || status === 'failed') {
    return 'stopped';
  }
  return 'pending';
}

// 工具名 → 家族识别。fork 自 OpenDesign isTodoWriteToolName,扩展了
// claudeStream 已知的 TaskCreate/TaskUpdate 也会归并为 TodoWrite,
// 所以这边只识别规范名。
export function isTodoWriteToolName(name: string): boolean {
  return (
    name === 'TodoWrite' ||
    name === 'todowrite' ||
    name === 'todo_write' ||
    name === 'update_plan'
  );
}
