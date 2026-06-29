export type ArtifactKind = 'markdown' | 'html' | 'review' | 'revision' | 'text' | 'other';

export type ArtifactStatus = 'ready' | 'partial' | 'failed' | 'archived' | 'deleted';

export type ArtifactAction =
  | 'openAsTab'
  | 'preview'
  | 'insertToEditor'
  | 'compareWithCurrent'
  | 'archiveToWorkspace'
  | 'deleteArtifact'
  | 'copyPath';

export type ArtifactManifest = {
  version: 1;
  id: string;
  title: string;
  kind: ArtifactKind;
  status: ArtifactStatus;
  createdAt: string;
  updatedAt: string;
  source: {
    conversationId?: string;
    documentPath?: string;
    legacy?: boolean;
  };
  agent?: {
    provider?: string;
    model?: string;
    toolName?: string;
  };
  files: Array<{
    path: string;
    name: string;
    role: 'primary' | 'raw' | 'log';
  }>;
  actions: ArtifactAction[];
  error?: string;
  rawOutput?: string;
};

export type ArtifactRecord = {
  path: string;
  name: string;
  ts: number;
  kind: ArtifactKind;
  status: ArtifactStatus;
  manifest?: ArtifactManifest;
  manifestPath?: string;
  legacy: boolean;
};

export type ArtifactFilterMode = 'session' | 'document' | 'all';
