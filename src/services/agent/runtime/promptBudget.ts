/**
 * Adapted from nexu-io/open-design
 * License: Apache-2.0
 * Original path: apps/daemon/src/runtimes/prompt-budget.ts
 * Modifications: reduced to Typola's current argv-bound OpenCode warning.
 */

import type { AgentCommandSpec, AgentPromptBudgetWarning, AgentRuntimeDef } from './types';

export function checkRuntimePromptBudget(
  runtime: AgentRuntimeDef,
  commandSpec: AgentCommandSpec,
): AgentPromptBudgetWarning | null {
  if (commandSpec.promptViaStdin || typeof runtime.maxPromptArgBytes !== 'number') return null;
  const bytes = new TextEncoder().encode(commandSpec.args.join('\u0000')).length;
  if (bytes <= runtime.maxPromptArgBytes) return null;
  return {
    code: 'AGENT_PROMPT_TOO_LARGE',
    message: `${runtime.label} 当前通过命令行参数传递 prompt，本次内容超过安全长度 (${bytes} > ${runtime.maxPromptArgBytes} bytes)。请缩短上下文，或等待后续 stdin 执行链路改造。`,
    bytes,
    limit: runtime.maxPromptArgBytes,
  };
}
