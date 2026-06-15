// Shared handle for syncing editor scroll position into a preview pane.
// Editor calls onScrollRatio(0..1); AppLayout forwards to the active preview's scrollToRatio.
export type PreviewScrollHandle = {
  scrollToRatio: (ratio: number) => void;
};
