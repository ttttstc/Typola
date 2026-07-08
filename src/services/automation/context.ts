import type { AgentProvider } from '../agent/provider';
import type { ArtifactRecord } from '../artifacts/types';
import type { AutomationContextPacket, AutomationSensitivity, AutomationTemplate } from './types';

type BuildAutomationContextInput = {
  document?: {
    path?: string;
    name?: string;
    markdown: string;
    dirty: boolean;
    mode: NonNullable<AutomationContextPacket['document']>['mode'];
  };
  selection?: {
    text: string;
    from?: number;
    to?: number;
  } | null;
  workspaceRoot?: string;
  aiWorkspaceRoot?: string;
  outputRoot?: string;
  provider: AgentProvider;
  activeConversationId?: string;
  model?: string;
  artifacts?: ArtifactRecord[];
  wordPresetId: string;
  htmlPresetId: string;
};

function contextSensitivity(template?: AutomationTemplate): AutomationSensitivity {
  if (template?.permissions.runsCommand) return 'external-command';
  if (template?.permissions.sendsToAi) return 'sends-to-ai';
  return 'local-only';
}

export function buildAutomationContext(
  input: BuildAutomationContextInput,
  template?: AutomationTemplate,
): AutomationContextPacket {
  return {
    document: input.document,
    selection: input.selection?.text ? input.selection : undefined,
    workspace: {
      root: input.workspaceRoot,
      aiWorkspaceRoot: input.aiWorkspaceRoot,
      outputRoot: input.outputRoot,
    },
    ai: {
      provider: input.provider,
      activeConversationId: input.activeConversationId,
      model: input.model,
    },
    artifact: {
      activeConversationId: input.activeConversationId,
      recentArtifacts: (input.artifacts ?? []).slice(0, 5).map((record) => ({
        path: record.manifest.primaryFile,
        kind: record.manifest.kind,
        title: record.manifest.title,
      })),
    },
    export: {
      wordPresetId: input.wordPresetId,
      htmlPresetId: input.htmlPresetId,
    },
    sensitivity: contextSensitivity(template),
    createdAt: new Date().toISOString(),
  };
}

export function describeAutomationContext(context: AutomationContextPacket): string[] {
  const rows = [
    context.document?.name ? `当前文档:${context.document.name}` : '当前文档:未打开',
    context.document?.dirty ? '文档状态:有未保存修改' : '文档状态:干净或未打开',
    context.selection?.text ? `选区:${context.selection.text.length} 字` : '选区:无',
    context.ai?.provider ? `AI Provider:${context.ai.provider}` : 'AI Provider:未配置',
    context.workspace?.aiWorkspaceRoot ? `AI 工作区:${context.workspace.aiWorkspaceRoot}` : 'AI 工作区:默认',
    context.workspace?.outputRoot ? `产物目录:${context.workspace.outputRoot}` : '产物目录:未就绪',
    `敏感级别:${context.sensitivity}`,
  ];
  return rows;
}
