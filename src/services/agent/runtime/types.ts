/**
 * Adapted from nexu-io/open-design
 * License: Apache-2.0
 * Original path: apps/daemon/src/runtimes/types.ts
 * Modifications: reduced to Typola's Tauri runtime registry and existing
 * Claude/OpenCode document-workbench execution model; Codex is detection-only.
 */

export type AgentRuntimeId = 'claude' | 'opencode' | 'codex';

export type AgentRuntimeDef = {
  id: AgentRuntimeId;
  label: string;
  description?: string;
  defaultCommand: string;
  fallbackCommands?: string[];
  versionArgs: string[];
  docsUrl?: string;
  installUrl?: string;
  experimental?: boolean;
  detectionOnly?: boolean;
};

export type AgentDiagnosticLevel = 'ok' | 'warning' | 'error';

export type AgentDiagnosticCode =
  | 'ok'
  | 'not_found'
  | 'not_executable'
  | 'version_failed'
  | 'windows_path_issue'
  | 'timeout'
  | 'auth_unknown'
  | 'unknown'
  | string;

export type AgentDiagnosticFix = {
  label: string;
  action: 'choose_file' | 'copy_command' | 'open_settings' | 'open_doc' | 'rescan' | 'none';
  payload?: string;
};

export type AgentDiagnostic = {
  code: AgentDiagnosticCode;
  level: AgentDiagnosticLevel;
  title: string;
  detail: string;
  fix?: AgentDiagnosticFix | null;
};
