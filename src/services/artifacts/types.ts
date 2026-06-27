export type ArtifactKind =
  | 'markdown'
  | 'html'
  | 'review'
  | 'revision'
  | 'wechat-html'
  | 'ppt-html'
  | 'data'
  | 'asset'
  | 'unknown';

export type ArtifactStatus = 'running' | 'done' | 'failed' | 'partial' | 'archived' | 'deleted';

export type ArtifactSourceType =
  | 'flow_generation'
  | 'selection_ai'
  | 'review_export'
  | 'review_ai_edit'
  | 'manual_import'
  | 'unknown';

export type ArtifactManifest = {
  id: string;
  title: string;
  kind: ArtifactKind;
  status: ArtifactStatus;
  primaryFile: string;
  createdAt: string;
  updatedAt?: string;
  source: {
    type: ArtifactSourceType;
    documentPath?: string;
    documentName?: string;
    conversationId?: string;
    docMode?: string;
  };
  agent?: {
    id: string;
    label?: string;
    model?: string;
  };
  workspace?: {
    root?: string;
    outputRoot?: string;
  };
  files?: Array<{
    path: string;
    role: 'primary' | 'asset' | 'log' | 'metadata' | 'preview' | 'backup';
    mime?: string;
    size?: number;
  }>;
  actions?: {
    openAsTab?: boolean;
    preview?: boolean;
    insertToEditor?: boolean;
    compareWithCurrent?: boolean;
    overwriteDocument?: boolean;
    undoOverwrite?: boolean;
    exportHtml?: boolean;
    exportPdf?: boolean;
    exportWord?: boolean;
    archive?: boolean;
    delete?: boolean;
  };
  overwrite?: {
    targetPath: string;
    backupPath: string;
    appliedAt: string;
  };
  error?: {
    message: string;
    stderrTail?: string;
    exitCode?: number;
  };
};

export type ArtifactRecord = {
  manifest: ArtifactManifest;
  manifestPath?: string;
  legacy: boolean;
};

export type ArtifactViewMode = 'session' | 'all';

export type ArtifactCreateInput = {
  primaryFile: string;
  outputRoot?: string;
  workspaceRoot?: string;
  sourceType?: ArtifactSourceType;
  documentPath?: string;
  documentName?: string;
  conversationId?: string;
  agentId?: string;
  agentLabel?: string;
  model?: string;
  status?: ArtifactStatus;
  title?: string;
};
