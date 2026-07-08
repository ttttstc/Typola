import type {
  AutomationAction,
  AutomationActionExecution,
  AutomationContextPacket,
  AutomationExecution,
  AutomationGate,
  AutomationRunAdapters,
  AutomationTemplate,
  CreateArtifactAction,
  InsertTemplateAction,
  RunAiPromptAction,
} from './types';

function now(): string {
  return new Date().toISOString();
}

function executionId(): string {
  return `automation-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function documentExtension(path?: string): string {
  const name = path?.replace(/\\/g, '/').split('/').pop() ?? '';
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot).toLowerCase() : '';
}

export function validateAutomationConditions(template: AutomationTemplate, context: AutomationContextPacket): string[] {
  const conditions = template.conditions;
  if (!conditions) return [];
  const errors: string[] = [];
  if (conditions.requiresDocument && !context.document) {
    errors.push('需要先打开一个文档。');
  }
  if (conditions.requiresSavedDocument && !context.document?.path) {
    errors.push('需要先保存当前文档。');
  }
  if (conditions.requiresSelection && !context.selection?.text) {
    errors.push('需要先选中文本。');
  }
  if (conditions.allowedExtensions?.length && context.document?.path) {
    const ext = documentExtension(context.document.path);
    if (!conditions.allowedExtensions.map((item) => item.toLowerCase()).includes(ext)) {
      errors.push(`当前文档类型 ${ext || '未知'} 不在模板允许范围内。`);
    }
  }
  return errors;
}

export function classifyActionGate(action: AutomationAction, template: AutomationTemplate): AutomationGate {
  if (action.type === 'insert_template') return 'none';
  if (action.type === 'create_artifact') return 'none';
  if (action.type === 'run_ai_prompt') return 'none';
  if (template.permissions.overwritesDocument || template.permissions.writesProjectFile || template.permissions.runsCommand) {
    return 'strong';
  }
  return template.trusted ? 'none' : 'light';
}

function clip(text: string, max: number): string {
  const normalized = text.trim();
  return normalized.length <= max ? normalized : `${normalized.slice(0, max)}...`;
}

function artifactList(context: AutomationContextPacket): string {
  const artifacts = context.artifact?.recentArtifacts ?? [];
  if (artifacts.length === 0) return '- 暂无最近产物';
  return artifacts.map((artifact) => `- ${artifact.title} (${artifact.kind})`).join('\n');
}

export function renderAutomationTemplateText(text: string, context: AutomationContextPacket): string {
  const documentMarkdown = context.document?.markdown ?? '';
  const selectionText = context.selection?.text ?? '';
  const replacements: Record<string, string> = {
    date: new Date().toISOString().slice(0, 10),
    'document.name': context.document?.name ?? '未命名文档',
    'document.path': context.document?.path ?? '未保存',
    'document.markdown': documentMarkdown,
    'document.preview': clip(documentMarkdown, 800) || '当前文档为空。',
    'document.chars': String(documentMarkdown.length),
    'selection.text': selectionText,
    'selection.chars': String(selectionText.length),
    'workspace.root': context.workspace?.root ?? '',
    'workspace.aiRoot': context.workspace?.aiWorkspaceRoot ?? '',
    'artifacts.list': artifactList(context),
  };
  return text.replace(/\{\{([^}]+)\}\}/gu, (_, key: string) => replacements[key.trim()] ?? '');
}

function createBaseExecution(template: AutomationTemplate, context: AutomationContextPacket): AutomationExecution {
  return {
    id: executionId(),
    templateId: template.id,
    templateTitle: template.title,
    templateSource: template.source,
    trigger: template.trigger.type,
    startedAt: now(),
    status: 'running',
    contextSummary: {
      documentPath: context.document?.path,
      documentName: context.document?.name,
      selectionChars: context.selection?.text.length,
      provider: context.ai?.provider,
      sensitivity: context.sensitivity,
    },
    actions: template.actions.map((action): AutomationActionExecution => ({
      id: action.id,
      type: action.type,
      label: action.label,
      status: 'pending',
      gate: classifyActionGate(action, template),
    })),
  };
}

function patchAction(
  execution: AutomationExecution,
  actionId: string,
  patch: Partial<AutomationActionExecution>,
): AutomationExecution {
  return {
    ...execution,
    actions: execution.actions.map((action) => (
      action.id === actionId ? { ...action, ...patch } : action
    )),
  };
}

async function runInsertAction(action: InsertTemplateAction, context: AutomationContextPacket, adapters: AutomationRunAdapters) {
  const text = renderAutomationTemplateText(action.text, context);
  await adapters.insertText(text, action.placement);
  return [{ kind: 'editor' as const, title: action.placement === 'replace-selection' ? '已替换选区' : '已插入编辑器' }];
}

async function runCreateArtifactAction(
  template: AutomationTemplate,
  action: CreateArtifactAction,
  context: AutomationContextPacket,
  adapters: AutomationRunAdapters,
) {
  const result = await adapters.createArtifact({
    filename: renderAutomationTemplateText(action.filename, context),
    title: renderAutomationTemplateText(action.title, context),
    content: renderAutomationTemplateText(action.content, context),
    template,
    action,
  });
  return [{ kind: 'artifact' as const, path: result.path, title: result.title }];
}

async function runAiPromptAction(
  template: AutomationTemplate,
  action: RunAiPromptAction,
  context: AutomationContextPacket,
  adapters: AutomationRunAdapters,
) {
  const result = await adapters.runAiPrompt({
    prompt: renderAutomationTemplateText(action.prompt, context),
    title: action.conversationTitle,
    template,
    action,
  });
  return [{ kind: 'ai' as const, path: result.conversationId, title: result.title ?? action.conversationTitle ?? 'AI 工作台' }];
}

export async function runAutomation(
  template: AutomationTemplate,
  context: AutomationContextPacket,
  adapters: AutomationRunAdapters,
  onUpdate?: (execution: AutomationExecution) => void,
): Promise<AutomationExecution> {
  let execution = createBaseExecution(template, context);
  onUpdate?.(execution);

  const conditionErrors = validateAutomationConditions(template, context);
  if (conditionErrors.length > 0) {
    execution = {
      ...execution,
      status: 'failed',
      finishedAt: now(),
      error: conditionErrors.join('\n'),
    };
    onUpdate?.(execution);
    return execution;
  }

  for (const action of template.actions) {
    const gate = classifyActionGate(action, template);
    execution = patchAction(execution, action.id, { status: 'running', startedAt: now(), gate });
    onUpdate?.(execution);
    try {
      if (gate !== 'none') {
        execution = { ...execution, status: 'waiting-for-gate' };
        onUpdate?.(execution);
        const approved = await adapters.requestApproval?.({ template, action, gate });
        if (!approved) {
          execution = patchAction(execution, action.id, { status: 'skipped', finishedAt: now() });
          execution = { ...execution, status: 'cancelled', finishedAt: now() };
          onUpdate?.(execution);
          return execution;
        }
        execution = { ...execution, status: 'running' };
      }

      const outputs = action.type === 'insert_template'
        ? await runInsertAction(action, context, adapters)
        : action.type === 'create_artifact'
          ? await runCreateArtifactAction(template, action, context, adapters)
          : await runAiPromptAction(template, action, context, adapters);
      execution = patchAction(execution, action.id, { status: 'succeeded', finishedAt: now(), outputs });
      onUpdate?.(execution);
    } catch (error) {
      execution = patchAction(execution, action.id, {
        status: 'failed',
        finishedAt: now(),
        error: error instanceof Error ? error.message : String(error),
      });
      execution = {
        ...execution,
        status: 'failed',
        finishedAt: now(),
        error: error instanceof Error ? error.message : String(error),
      };
      onUpdate?.(execution);
      return execution;
    }
  }

  execution = {
    ...execution,
    status: 'succeeded',
    finishedAt: now(),
  };
  onUpdate?.(execution);
  return execution;
}
