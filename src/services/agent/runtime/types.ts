/**
 * Adapted from nexu-io/open-design
 * License: Apache-2.0
 * Original path: apps/daemon/src/runtimes/types.ts
 * Modifications: reduced to Typola's Tauri runtime registry and existing
 * Claude/OpenCode document-workbench execution model.
 */

export type AgentRuntimeId = 'claude' | 'opencode';

export type AgentCapability =
  | 'stream'
  | 'sessionResume'
  | 'fileWrite'
  | 'mcp'
  | 'extraAllowedDirs'
  | 'promptViaStdin'
  | 'modelSelection'
  | 'partialMessages'
  | 'pluginDirs'
  | 'promptContextFiles'
  | 'commandName';

export type AgentModelOption = {
  id: string;
  label: string;
};

export type AgentCommandInput = {
  runtimeId: AgentRuntimeId;
  prompt: string;
  cwd?: string;
  model?: string;
  resumed?: boolean;
  sessionId?: string;
  pluginDirs?: string[];
  extraAllowedDirs?: string[];
  promptContextPaths?: string[];
  commandName?: string;
};

export type AgentCommandSpec = {
  runtimeId: AgentRuntimeId;
  command: string;
  args: string[];
  cwd?: string;
  promptViaStdin: boolean;
  promptInputFormat?: 'text' | 'stream-json';
  outputFormat?: 'text' | 'json' | 'stream-json';
};

export type AgentPromptBudgetWarning = {
  code: 'AGENT_PROMPT_TOO_LARGE';
  message: string;
  bytes: number;
  limit: number;
};

export type AgentRuntimeDef = {
  id: AgentRuntimeId;
  label: string;
  description?: string;
  defaultCommand: string;
  fallbackCommands?: string[];
  versionArgs: string[];
  docsUrl?: string;
  installUrl?: string;
  capabilities: Partial<Record<AgentCapability, boolean>>;
  defaultModels: AgentModelOption[];
  experimental?: boolean;
  maxPromptArgBytes?: number;
  buildCommandSpec: (input: AgentCommandInput) => AgentCommandSpec;
};
