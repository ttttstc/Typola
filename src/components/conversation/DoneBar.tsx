import type { AgentUsageSummary } from '../../services/agent/types';

export function DoneBar({ usage }: { usage?: AgentUsageSummary }) {
  if (!usage) return null;
  const duration = typeof usage.durationMs === 'number' ? `${Math.round(usage.durationMs / 1000)}s` : '完成';
  const cost = typeof usage.costUsd === 'number' ? ` · $${usage.costUsd.toFixed(4)}` : '';
  return <div className="conversation-done-bar">Done · {duration}{cost}</div>;
}
