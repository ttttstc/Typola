/**
 * Adapted from nexu-io/open-design
 * License: Apache-2.0
 * Original path: apps/daemon/src/runtimes/defs/claude.ts
 * Modifications: mirrors Typola's existing Rust Claude headless args without
 * changing execution behavior.
 */

import type { AgentRuntimeDef } from '../types';

const DEFAULT_SESSION_ID = '<session-id>';

export const claudeRuntimeDef: AgentRuntimeDef = {
  id: 'claude',
  label: 'Claude Code',
  description: '通过 Claude Code CLI 提供流式对话、会话续接、文件写入和 MCP 能力。',
  defaultCommand: 'claude',
  fallbackCommands: ['openclaude'],
  versionArgs: ['--version'],
  docsUrl: 'https://docs.anthropic.com/en/docs/claude-code',
  installUrl: 'https://docs.anthropic.com/en/docs/claude-code/setup',
  capabilities: {
    stream: true,
    sessionResume: true,
    fileWrite: true,
    mcp: true,
    extraAllowedDirs: true,
    promptViaStdin: true,
    modelSelection: true,
    partialMessages: false,
    pluginDirs: true,
  },
  defaultModels: [
    { id: 'default', label: '默认' },
    { id: 'sonnet', label: 'Sonnet' },
    { id: 'opus', label: 'Opus' },
    { id: 'haiku', label: 'Haiku' },
  ],
  buildCommandSpec(input) {
    const args = [
      '-p',
      '--input-format',
      'text',
      '--output-format',
      'stream-json',
      '--verbose',
      '--permission-mode',
      'bypassPermissions',
    ];

    args.push(input.resumed ? '--resume' : '--session-id');
    args.push(input.sessionId?.trim() || DEFAULT_SESSION_ID);

    const model = input.model?.trim();
    if (model && model !== 'default') {
      args.push('--model', model);
    }

    for (const dir of input.pluginDirs ?? []) {
      const value = dir.trim();
      if (value) args.push('--plugin-dir', value);
    }

    for (const dir of input.extraAllowedDirs ?? []) {
      const value = dir.trim();
      if (value) args.push('--add-dir', value);
    }

    return {
      runtimeId: 'claude',
      command: 'claude',
      args,
      cwd: input.cwd,
      promptViaStdin: true,
      promptInputFormat: 'text',
      outputFormat: 'stream-json',
    };
  },
};
