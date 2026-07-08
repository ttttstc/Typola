import type { AutomationTemplate } from './types';

export const BUILTIN_AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  {
    schemaVersion: 1,
    id: 'builtin.insert-meeting-notes',
    title: '插入会议纪要骨架',
    description: '在光标处插入一段可直接填写的会议纪要结构，不写磁盘。',
    source: 'builtin',
    trusted: true,
    trigger: { type: 'manual' },
    conditions: {
      requiresDocument: true,
      allowedExtensions: ['.md', '.markdown'],
    },
    permissions: {},
    actions: [
      {
        id: 'insert-notes',
        type: 'insert_template',
        label: '插入模板',
        placement: 'cursor',
        text: [
          '',
          '## 会议纪要 - {{date}}',
          '',
          '- 主题：',
          '- 参与人：',
          '- 背景：',
          '- 结论：',
          '- 待办：',
          '  - [ ] ',
          '',
        ].join('\n'),
      },
    ],
  },
  {
    schemaVersion: 1,
    id: 'builtin.local-summary-artifact',
    title: '生成本地摘要产物',
    description: '把当前文档的标题、字数和前 800 字整理成 Markdown 产物，进入 AI 产物中心。',
    source: 'builtin',
    trusted: true,
    trigger: { type: 'manual' },
    conditions: {
      requiresDocument: true,
      allowedExtensions: ['.md', '.markdown', '.html'],
    },
    permissions: {
      writesArtifact: true,
    },
    actions: [
      {
        id: 'write-summary',
        type: 'create_artifact',
        label: '写入摘要产物',
        filename: 'automation-summary-{{date}}.md',
        title: '自动化摘要 · {{document.name}}',
        content: [
          '# 自动化摘要',
          '',
          '- 来源文档：{{document.name}}',
          '- 文档路径：{{document.path}}',
          '- 生成日期：{{date}}',
          '- 文档字数：{{document.chars}}',
          '- 选区字数：{{selection.chars}}',
          '',
          '## 内容预览',
          '',
          '{{document.preview}}',
          '',
          '## 最近产物',
          '',
          '{{artifacts.list}}',
          '',
        ].join('\n'),
      },
    ],
  },
  {
    schemaVersion: 1,
    id: 'builtin.ai-summary-prompt',
    title: '发送 AI 摘要 Prompt',
    description: '把当前文档路径和摘要要求发送到 AI 工作台；产物仍由现有 AI 产物链路回流。',
    source: 'builtin',
    trusted: true,
    trigger: { type: 'manual' },
    conditions: {
      requiresDocument: true,
      requiresSavedDocument: true,
      allowedExtensions: ['.md', '.markdown', '.html'],
    },
    permissions: {
      sendsToAi: true,
      writesArtifact: true,
    },
    actions: [
      {
        id: 'send-ai-summary',
        type: 'run_ai_prompt',
        label: '发送到 AI 工作台',
        conversationTitle: '自动化 · 文档摘要',
        prompt: [
          '请基于当前文档生成一份结构化摘要，并保存为 Markdown 产物。',
          '',
          '文档路径：{{document.path}}',
          '文档名：{{document.name}}',
          '',
          '要求：',
          '1. 先列 3-5 条核心结论。',
          '2. 再列风险、待办和下一步。',
          '3. 不要覆盖原文，只写入当前会话产物目录。',
        ].join('\n'),
      },
    ],
  },
];

export function loadBuiltinAutomationTemplates(): AutomationTemplate[] {
  return BUILTIN_AUTOMATION_TEMPLATES;
}
