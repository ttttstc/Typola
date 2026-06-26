/**
 * Adapted from nexu-io/open-design
 * License: Apache-2.0
 * Original path: apps/daemon/src/runtimes/defs/claude.ts
 * Modifications: mirrors Typola's existing Rust Claude headless args without
 * changing execution behavior.
 */

import type { AgentRuntimeDef } from '../types';

export const claudeRuntimeDef: AgentRuntimeDef = {
  id: 'claude',
  label: 'Claude Code',
  description: '通过 Claude Code CLI 提供流式对话、会话续接、文件写入和 MCP 能力。',
  defaultCommand: 'claude',
  fallbackCommands: ['openclaude'],
  versionArgs: ['--version'],
  docsUrl: 'https://docs.anthropic.com/en/docs/claude-code',
  installUrl: 'https://docs.anthropic.com/en/docs/claude-code/setup',
};
