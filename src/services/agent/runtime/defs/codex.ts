/**
 * Adapted from nexu-io/open-design
 * License: Apache-2.0
 * Original path: apps/daemon/src/runtimes/defs/codex.ts
 * Modifications: keeps only Typola's detection metadata. Execution/parser
 * wiring is intentionally out of scope for issue #112 Phase 3.
 */

import type { AgentRuntimeDef } from '../types';

export const codexRuntimeDef: AgentRuntimeDef = {
  id: 'codex',
  label: 'Codex CLI',
  description: '检测本机 Codex CLI 是否可用；当前版本暂不作为 AI 工作台发送后端。',
  defaultCommand: 'codex',
  fallbackCommands: [],
  versionArgs: ['--version'],
  docsUrl: 'https://developers.openai.com/codex/',
  installUrl: 'https://developers.openai.com/codex/',
  detectionOnly: true,
};
