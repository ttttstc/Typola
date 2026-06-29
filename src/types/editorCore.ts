import type { AnchorStatus } from '../services/agent/types';

export type EditorEngine = 'vditor' | 'cm6';
export type EditorSelection = { text: string; from: number; to: number };

/**
 * 编辑器运行时核心接口。
 * CM6 和 Vditor 过渡期都实现这份契约；调用方优先面向 Markdown source。
 */
export type EditorCoreHandle = {
  focus: () => void;
  getMarkdown: () => string;
  setMarkdown: (markdown: string) => void;
  insertText: (text: string) => void;
  getSelection: () => EditorSelection | null;
  replaceSelection: (text: string) => void;
  /** 按 Markdown source 坐标替换；Vditor 过渡期可退化为文本定位。 */
  replaceRange: (from: number, to: number, text: string) => boolean;
  /** 校验 AI anchor 是否仍可安全替换。 */
  validateAnchor: (filePath: string, from: number, to: number, originalText: string, prefixHint?: string) => AnchorStatus;
  /** 滚动并选中范围；搜索导航应传 preserveFocus，避免焦点被抢回编辑器。 */
  revealRange: (
    from: number,
    to: number,
    opts?: {
      text?: string;
      preserveFocus?: boolean;
      query?: string;
      searchOptions?: import('../services/documentSearchService').SearchOptions;
    },
  ) => void;
  revealText: (text: string, backwards?: boolean) => void;
  undoLastAIReplacement: () => boolean;
  commitAIReplacement: (content: string) => void;
};
