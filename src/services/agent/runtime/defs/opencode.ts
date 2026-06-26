/**
 * Adapted from nexu-io/open-design
 * License: Apache-2.0
 * Original path: apps/daemon/src/runtimes/defs/opencode.ts
 * Modifications: mirrors Typola's current Rust OpenCode argv prompt behavior;
 * stdin migration is intentionally out of scope for issue #92.
 */

import type { AgentRuntimeDef } from '../types';

export const opencodeRuntimeDef: AgentRuntimeDef = {
  id: 'opencode',
  label: 'OpenCode',
  description: '通过 OpenCode CLI 提供可选的本地 AI 文档工作台执行后端。',
  defaultCommand: 'opencode',
  fallbackCommands: ['opencode-cli'],
  versionArgs: ['--version'],
  docsUrl: 'https://opencode.ai/docs/',
  installUrl: 'https://opencode.ai/docs/',
};
