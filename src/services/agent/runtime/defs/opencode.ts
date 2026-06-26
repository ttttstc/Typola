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
  capabilities: {
    stream: true,
    sessionResume: true,
    fileWrite: true,
    mcp: true,
    extraAllowedDirs: false,
    promptViaStdin: false,
    modelSelection: true,
    promptContextFiles: true,
    commandName: true,
  },
  defaultModels: [
    { id: 'default', label: '默认' },
    { id: 'anthropic/claude-sonnet-4-5', label: 'anthropic/claude-sonnet-4-5' },
    { id: 'openai/gpt-5', label: 'openai/gpt-5' },
    { id: 'google/gemini-2.5-pro', label: 'google/gemini-2.5-pro' },
  ],
  maxPromptArgBytes: 24_000,
  buildCommandSpec(input) {
    const args = ['run', '--format', 'json', '--dangerously-skip-permissions'];
    if (input.resumed) {
      args.push('--continue');
    }

    const projectDir = input.extraAllowedDirs?.find((dir) => dir.trim())?.trim() || input.cwd?.trim();
    if (projectDir) {
      args.push('--dir', projectDir);
    }

    const model = input.model?.trim();
    if (model && model !== 'default') {
      args.push('--model', model);
    }

    const commandName = input.commandName?.trim();
    if (commandName) {
      args.push('--command', commandName.replace(/^\/+/u, ''));
    }

    args.push(input.prompt);

    for (const path of input.promptContextPaths ?? []) {
      const value = path.trim();
      if (value) args.push('--file', value);
    }

    return {
      runtimeId: 'opencode',
      command: 'opencode',
      args,
      cwd: input.cwd,
      promptViaStdin: false,
      outputFormat: 'json',
    };
  },
};
