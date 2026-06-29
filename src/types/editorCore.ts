import type { EditorCommandHandle } from './editorCommands';

export type EditorEngine = 'vditor' | 'cm6';

/**
 * Phase 1 的编辑器统一接口目标。
 *
 * 现有 AppLayout 仍使用 EditorCommandHandle；CM6 接入稳定后，再把调用点逐步迁移到
 * EditorCoreHandle，避免一次性改动 AI、搜索、产物回流等高风险路径。
 */
export type EditorCoreHandle = EditorCommandHandle & {
  getMarkdown: () => string;
  setMarkdown: (markdown: string) => void;
};

