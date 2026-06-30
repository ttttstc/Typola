/**
 * Adapted from nexu-io/open-design
 * License: Apache-2.0
 * Original path: apps/daemon/src/runtimes/registry.ts
 * Modifications: keeps only Typola-supported Claude/OpenCode runtimes and a
 * small, deterministic registry API.
 */

import { claudeRuntimeDef } from './defs/claude';
import { codexRuntimeDef } from './defs/codex';
import { opencodeRuntimeDef } from './defs/opencode';
import type { AgentRuntimeDef, AgentRuntimeId } from './types';

const RUNTIME_DEFS: AgentRuntimeDef[] = [
  claudeRuntimeDef,
  opencodeRuntimeDef,
  codexRuntimeDef,
];

const runtimeIds = new Set<AgentRuntimeId>();
for (const runtime of RUNTIME_DEFS) {
  if (runtimeIds.has(runtime.id)) {
    throw new Error(`Duplicate agent runtime id: ${runtime.id}`);
  }
  runtimeIds.add(runtime.id);
}

export function listAgentRuntimeDefs(options: { includeExperimental?: boolean } = {}): AgentRuntimeDef[] {
  return RUNTIME_DEFS.filter((runtime) => options.includeExperimental || !runtime.experimental);
}

export function getAgentRuntimeDef(id: AgentRuntimeId): AgentRuntimeDef {
  return RUNTIME_DEFS.find((runtime) => runtime.id === id) ?? claudeRuntimeDef;
}

export function isAgentRuntimeId(value: unknown): value is AgentRuntimeId {
  return value === 'claude' || value === 'opencode' || value === 'codex';
}

export function isExecutableAgentRuntimeId(value: unknown): value is Exclude<AgentRuntimeId, 'codex'> {
  return value === 'claude' || value === 'opencode';
}

export function normalizeAgentRuntimeId(value: unknown): AgentRuntimeId {
  return isAgentRuntimeId(value) ? value : 'claude';
}
