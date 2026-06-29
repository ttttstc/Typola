// Shared handle for syncing editor scroll position into a preview pane.
// Editor calls onScrollRatio(0..1); AppLayout forwards to the active preview's scrollToRatio.
// scrollToHeading 走 heading-anchored 同步,优于 ratio(代码块/图片使线性比例失效)。
export type PreviewScrollHandle = {
  scrollToRatio: (ratio: number) => void;
  scrollToHeading: (headingIndex: number, withinRatio: number) => void;
};
