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
  /**
   * 在 IR / Source 编辑器里把一个搜索匹配项滚到视口并高亮。
   * 入参是 source markdown 的字符偏移 [from, to)（与 `SearchMatch` 一致）,
   * 编辑器内部负责把 source 偏移映射到自身 DOM 选区 + scrollIntoView。
   * Source 模式直接按 from/to 选中;WYSIWYG 模式走 source→IR 偏移映射。
   *
   * `opts.focus` 控制是否同时把焦点切到编辑器:
   *   - 检视意见跳转期望 focus=true,跳转后用户能继续编辑
   *   - 搜索上下/回车期望 focus=false,保持 FindReplacePanel 输入框焦点,
   *     避免反复抢焦点导致光标乱飞 + 阻碍输入
   * 默认 true(向后兼容检视场景)。
   */
  revealSearchMatch: (from: number, to: number, opts?: { focus?: boolean }) => void;
  /** 撤销最后一次 AI 替换操作（恢复到替换前的编辑器内容）。 */
  undoLastAIReplacement: () => boolean;
  /** AI 整篇替换(用于 Diff Preview 应用合并结果)。一次性写入新内容,
   *  WYSIWYG 模式同步压入 AI 撤销栈,一次 Ctrl+Z 整体回退;Source 模式
   *  由 CodeMirror history 自动处理。 */
  commitAIReplacement: (content: string) => void;
};
