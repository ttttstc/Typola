export type EditorCommandHandle = {
  focus: () => void;
  insertText: (text: string) => void;
  getSelection: () => { text: string; from: number; to: number } | null;
  replaceSelection: (text: string) => void;
  // 按 anchor 快照精准替换（M3 选区注入）。Source 模式按 from/to 替换；WYSIWYG 模式
  // 退化为按 originalText + prefixHint 文本搜索替换（Vditor IR 没有稳定 from/to）。
  replaceRange: (from: number, to: number, text: string) => boolean;
  // 校验 anchor 是否仍可安全替换。返回 valid / stale（内容被改）/ wrong-file（已切到其他文件）。
  // WYSIWYG 模式还会校验 prefixHint+originalText 仍能唯一定位。
  validateAnchor: (filePath: string, from: number, to: number, originalText: string, prefixHint?: string) => 'valid' | 'stale' | 'wrong-file';
  revealRange: (from: number, to: number) => void;
  revealText: (text: string, backwards?: boolean) => void;
  /** 撤销最后一次 AI 替换操作（恢复到替换前的编辑器内容）。 */
  undoLastAIReplacement: () => boolean;
};
