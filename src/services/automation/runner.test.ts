import { describe, expect, it, vi } from 'vitest';
import { buildAutomationContext } from './context';
import { loadBuiltinAutomationTemplates } from './templates';
import { renderAutomationTemplateText, runAutomation, validateAutomationConditions } from './runner';

function contextFor(templateId = 'builtin.local-summary-artifact') {
  const template = loadBuiltinAutomationTemplates().find((item) => item.id === templateId)!;
  return {
    template,
    context: buildAutomationContext({
      document: {
        path: String.raw`D:\notes\demo.md`,
        name: 'demo.md',
        markdown: '# 标题\n\n正文内容',
        dirty: false,
        mode: 'markdown',
      },
      selection: null,
      workspaceRoot: String.raw`D:\notes`,
      aiWorkspaceRoot: String.raw`D:\notes`,
      outputRoot: String.raw`D:\notes\.typola-output`,
      provider: 'claude',
      activeConversationId: 'conv-1',
      wordPresetId: 'default',
      htmlPresetId: 'default',
      artifacts: [],
    }, template),
  };
}

describe('automation runner', () => {
  it('validates required saved document conditions', () => {
    const { template } = contextFor('builtin.ai-summary-prompt');
    const context = buildAutomationContext({
      document: {
        name: '未命名.md',
        markdown: '# 草稿',
        dirty: true,
        mode: 'markdown',
      },
      provider: 'claude',
      wordPresetId: 'default',
      htmlPresetId: 'default',
    }, template);

    expect(validateAutomationConditions(template, context)).toContain('需要先保存当前文档。');
  });

  it('renders context placeholders', () => {
    const { template, context } = contextFor();
    expect(renderAutomationTemplateText('{{document.name}} {{document.chars}} {{selection.chars}}', context))
      .toBe('demo.md 10 0');
    expect(context.sensitivity).toBe('local-only');
    expect(template.permissions.writesArtifact).toBe(true);
  });

  it('runs insert_template actions through the editor adapter', async () => {
    const { template, context } = contextFor('builtin.insert-meeting-notes');
    const insertText = vi.fn();
    const execution = await runAutomation(template, context, {
      insertText,
      createArtifact: vi.fn(),
      runAiPrompt: vi.fn(),
    });

    expect(execution.status).toBe('succeeded');
    expect(insertText).toHaveBeenCalledWith(expect.stringContaining('会议纪要'), 'cursor');
    expect(execution.actions[0].outputs?.[0].kind).toBe('editor');
  });

  it('runs create_artifact actions through the artifact adapter', async () => {
    const { template, context } = contextFor('builtin.local-summary-artifact');
    const createArtifact = vi.fn(async (input) => ({
      path: `${context.workspace?.outputRoot}/conv-1/${input.filename}`,
      title: input.title,
    }));
    const execution = await runAutomation(template, context, {
      insertText: vi.fn(),
      createArtifact,
      runAiPrompt: vi.fn(),
    });

    expect(execution.status).toBe('succeeded');
    expect(createArtifact).toHaveBeenCalledWith(expect.objectContaining({
      filename: expect.stringMatching(/^automation-summary-\d{4}-\d{2}-\d{2}\.md$/u),
      content: expect.stringContaining('内容预览'),
    }));
    expect(execution.actions[0].outputs?.[0].kind).toBe('artifact');
  });

  it('runs run_ai_prompt actions through the AI adapter', async () => {
    const { template, context } = contextFor('builtin.ai-summary-prompt');
    const runAiPrompt = vi.fn(async () => ({ conversationId: 'conv-ai', title: '自动化 · 文档摘要' }));
    const execution = await runAutomation(template, context, {
      insertText: vi.fn(),
      createArtifact: vi.fn(),
      runAiPrompt,
    });

    expect(execution.status).toBe('succeeded');
    expect(runAiPrompt).toHaveBeenCalledWith(expect.objectContaining({
      prompt: expect.stringContaining(String.raw`D:\notes\demo.md`),
    }));
    expect(execution.actions[0].outputs?.[0].kind).toBe('ai');
  });
});
