import type { AgentToolCall } from '../../services/agent/types';

const KNOWN_TOOLS = new Set(['Write', 'Edit', 'Read', 'Bash', 'Glob', 'Grep']);

export function ToolCard({ tool }: { tool: AgentToolCall }) {
  const known = KNOWN_TOOLS.has(tool.name);
  return (
    <details className={`conversation-tool-card ${tool.isError ? 'error' : ''}`}>
      <summary>
        <span>{known ? tool.name : 'Tool'}</span>
        <strong>{tool.name}</strong>
        {tool.result && <em>{tool.isError ? '失败' : '完成'}</em>}
      </summary>
      {tool.input !== undefined && <pre>{JSON.stringify(tool.input, null, 2)}</pre>}
      {tool.inputDelta && <pre>{tool.inputDelta}</pre>}
      {tool.result && <pre>{tool.result}</pre>}
    </details>
  );
}
