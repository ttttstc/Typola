export type AgentEvent =
  | { type: 'status'; label: unknown; model?: unknown; sessionId?: unknown; ttftMs?: unknown }
  | { type: 'text_delta'; delta: string }
  | { type: 'thinking_start' }
  | { type: 'thinking_delta'; delta: string }
  | { type: 'tool_use'; id: unknown; name: unknown; input: unknown }
  | { type: 'artifact_file'; path: string; content?: string; toolName: string }
  | { type: 'tool_input_delta'; id: unknown; name: unknown; delta: string }
  | { type: 'tool_result'; toolUseId: unknown; content: string; isError: boolean }
  | { type: 'turn_end'; stopReason: unknown }
  | { type: 'usage'; usage: unknown; costUsd: unknown; durationMs: unknown; stopReason: unknown }
  | { type: 'error'; message: string; code?: unknown }
  | { type: 'fabricated_role_marker'; marker: string; messageId: string }
  | { type: 'raw'; line: string };

export type AgentMessage =
  | { id: string; role: 'user'; content: string; createdAt: number; selectionAnchor?: SelectionAnchor }
  | {
      id: string;
      role: 'assistant';
      content: string;
      thinking: string;
      tools: AgentToolCall[];
      usage?: AgentUsageSummary;
      error?: string;
      createdAt: number;
      done?: boolean;
    };

export type SelectionAnchor = {
  filePath: string;
  // source 字符串的 UTF-16 code unit 偏移,等同于 source.charCodeAt(i) 的 i。
  // 由编辑器(CM6/Vditor)的 selection offset 直接写入,与 JS 字符串索引语义一致。
  // 对含 surrogate pair(emoji 等)的文本,一个码点占 2 个 unit,但 from/to 仍按 unit 计数。
  from: number;
  to: number;
  originalText: string;
  // Vditor WYSIWYG 模式下使用:从选区起点往前 N 个字符的快照文本。
  // Vditor IR 没有稳定的字符 from/to,用 prefixHint + originalText 在 source 中定位唯一匹配,
  // 避免同文本多处出现时 indexOf 撞到错误位置。
  prefixHint?: string;
  /** 选区所在标题路径(根标题在外),用于结构化 prompt 拼装。 */
  headingPath?: string[];
  /** 选区所在最小 block 边界(kind/from/to),用于限制 replacement 不能跨块。 */
  block?: {
    kind: 'code' | 'table' | 'math' | 'mermaid' | 'section' | 'paragraph';
    from: number;
    to: number;
  };
};

export type AnchorStatus = 'valid' | 'stale' | 'wrong-file';

export type AgentToolCall = {
  id: string;
  name: string;
  input?: unknown;
  inputDelta?: string;
  result?: string;
  isError?: boolean;
};

export type AgentUsageSummary = {
  usage: unknown;
  costUsd: unknown;
  durationMs: unknown;
  stopReason: unknown;
};

export type AgentRunState = 'idle' | 'running' | 'waitingForUser' | 'error';

export type AgentStdoutPayload = {
  runId: string;
  conversationId: string;
  sessionUuid: string;
  line: string;
};

export type AgentExitPayload = {
  runId: string;
  conversationId: string;
  sessionUuid: string;
  exitCode?: number | null;
  cancelled: boolean;
  stderrTail: string;
};
