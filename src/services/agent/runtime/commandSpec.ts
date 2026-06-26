import { getAgentRuntimeDef } from './registry';
import type { AgentCommandInput, AgentCommandSpec } from './types';

export function buildAgentCommandSpec(input: AgentCommandInput): AgentCommandSpec {
  return getAgentRuntimeDef(input.runtimeId).buildCommandSpec(input);
}
