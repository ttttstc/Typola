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
  /**
   * 把 [from, to) 滚到视口 + 选中。
   *
   * 契约(两个实现共享):
   * - opts.preserveFocus = true:**不**抢焦点回编辑器。搜索导航必须传,否则用户在
   *   FindReplacePanel 输入时焦点会被抢回,后续按键打进文档(数据破坏)。检视意见
   *   跳转期望 focus 编辑器,可不传或传 false。
   * - opts.text:WYSIWYG 模式下作为 IR 文本匹配关键词(优先于 source[from:to] 切片)。
   *   Source 模式忽略 —— CodeMirror 按 from/to 直接定位。
   * - opts.query / opts.searchOptions:搜索导航专用。WYSIWYG 模式按这两个用 regex
   *   找第 N 次出现,与 findSearchMatches 完全一致;不传时 fallback 到 case-insensitive
   *   纯文本匹配(检视意见走这条)。Source 模式忽略。
   */
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
  /** 撤销最后一次 AI 替换操作（恢复到替换前的编辑器内容）。 */
  undoLastAIReplacement: () => boolean;
  /** AI 整篇替换(用于 Diff Preview 应用合并结果)。一次性写入新内容,
   *  WYSIWYG 模式同步压入 AI 撤销栈,一次 Ctrl+Z 整体回退;Source 模式
   *  由 CodeMirror history 自动处理。 */
  commitAIReplacement: (content: string) => void;
};
