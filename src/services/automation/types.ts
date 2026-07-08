import type { AgentProvider } from '../agent/provider';

export type AutomationTriggerType = 'manual' | 'selection_manual';
export type AutomationTemplateSource = 'builtin' | 'user-global' | 'project';
export type AutomationSensitivity = 'local-only' | 'sends-to-ai' | 'external-command';
export type AutomationGate = 'none' | 'light' | 'strong';
export type AutomationExecutionStatus = 'running' | 'succeeded' | 'failed' | 'cancelled' | 'waiting-for-gate';
export type AutomationActionStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped';

export type AutomationContextPacket = {
  document?: {
    path?: string;
    name?: string;
    markdown: string;
    dirty: boolean;
    mode: 'markdown' | 'source' | 'docx' | 'html' | 'unknown';
  };
  selection?: {
    text: string;
    from?: number;
    to?: number;
  };
  workspace?: {
    root?: string;
    aiWorkspaceRoot?: string;
    outputRoot?: string;
  };
  ai?: {
    provider: AgentProvider;
    activeConversationId?: string;
    model?: string;
  };
  artifact?: {
    activeConversationId?: string;
    recentArtifacts: Array<{ path: string; kind: string; title: string }>;
  };
  export?: {
    wordPresetId: string;
    htmlPresetId: string;
  };
  sensitivity: AutomationSensitivity;
  createdAt: string;
};

export type AutomationConditions = {
  requiresDocument?: boolean;
  requiresSavedDocument?: boolean;
  requiresSelection?: boolean;
  allowedExtensions?: string[];
};

export type InsertTemplateAction = {
  id: string;
  type: 'insert_template';
  label: string;
  text: string;
  placement?: 'cursor' | 'replace-selection' | 'append';
};

export type CreateArtifactAction = {
  id: string;
  type: 'create_artifact';
  label: string;
  filename: string;
  title: string;
  content: string;
  kind?: 'markdown' | 'html' | 'data';
};

export type RunAiPromptAction = {
  id: string;
  type: 'run_ai_prompt';
  label: string;
  prompt: string;
  conversationTitle?: string;
};

export type AutomationAction =
  | InsertTemplateAction
  | CreateArtifactAction
  | RunAiPromptAction;

export type AutomationTemplate = {
  schemaVersion: 1;
  id: string;
  title: string;
  description: string;
  source: AutomationTemplateSource;
  trusted?: boolean;
  trigger: { type: AutomationTriggerType };
  conditions?: AutomationConditions;
  actions: AutomationAction[];
  permissions: {
    sendsToAi?: boolean;
    writesArtifact?: boolean;
    writesProjectFile?: boolean;
    overwritesDocument?: boolean;
    runsCommand?: boolean;
  };
};

export type AutomationActionExecution = {
  id: string;
  type: AutomationAction['type'];
  label: string;
  status: AutomationActionStatus;
  gate?: AutomationGate;
  startedAt?: string;
  finishedAt?: string;
  outputs?: Array<{ kind: 'artifact' | 'file' | 'editor' | 'ai'; path?: string; title?: string }>;
  error?: string;
};

export type AutomationExecution = {
  id: string;
  templateId: string;
  templateTitle: string;
  templateSource: AutomationTemplateSource;
  trigger: AutomationTriggerType;
  startedAt: string;
  finishedAt?: string;
  status: AutomationExecutionStatus;
  contextSummary: {
    documentPath?: string;
    documentName?: string;
    selectionChars?: number;
    provider?: AgentProvider;
    sensitivity: AutomationSensitivity;
  };
  actions: AutomationActionExecution[];
  error?: string;
};

export type AutomationRunAdapters = {
  requestApproval?: (request: {
    template: AutomationTemplate;
    action: AutomationAction;
    gate: Exclude<AutomationGate, 'none'>;
  }) => Promise<boolean>;
  insertText: (text: string, placement: InsertTemplateAction['placement']) => Promise<void> | void;
  createArtifact: (input: {
    filename: string;
    title: string;
    content: string;
    template: AutomationTemplate;
    action: CreateArtifactAction;
  }) => Promise<{ path: string; title: string }>;
  runAiPrompt: (input: {
    prompt: string;
    title?: string;
    template: AutomationTemplate;
    action: RunAiPromptAction;
  }) => Promise<{ conversationId?: string; title?: string }>;
};
