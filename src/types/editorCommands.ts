export type EditorCommandHandle = {
  focus: () => void;
  insertText: (text: string) => void;
  getSelection: () => { text: string; from: number; to: number } | null;
  replaceSelection: (text: string) => void;
  revealRange: (from: number, to: number) => void;
  revealText: (text: string, backwards?: boolean) => void;
};
