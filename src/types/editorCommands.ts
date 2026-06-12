export type EditorCommandHandle = {
  focus: () => void;
  insertText: (text: string) => void;
  revealRange: (from: number, to: number) => void;
  revealText: (text: string, backwards?: boolean) => void;
};
