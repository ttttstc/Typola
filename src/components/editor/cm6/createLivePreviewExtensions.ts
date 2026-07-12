import { type Extension } from '@codemirror/state';
import { imageBlocks, inlinePreview, tables } from '@atomic-editor/editor';
import { imageFallbackExtension } from './imageFallbackExtension';
import { imageAssetExtension } from './imageAssetExtension';
import { mathPreviewExtension } from './mathPreviewExtension';
import { mermaidPreviewExtension } from './mermaidPreviewExtension';
import { wheelZoomExtension } from './wheelZoomExtension';
import { previewSyncExtension, type PreviewHeadingChange } from './previewSyncExtension';
import { headingFoldExtension } from './headingFoldExtension';
import type { FoldKey } from '../../../services/headingFoldService';
import type { ReviewComment } from '../../../services/review/reviewState';
import { reviewMarkExtension } from './reviewMarkExtension';
import {
  linkOpenExtension,
  taskToggleExtension,
} from './linkInteractionExtension';
import type { MarkdownLink, MarkdownTask } from '../../../services/markdownAnalysisService';

type CreateLivePreviewExtensionsOptions = {
  livePreview?: boolean;
  baseSize: number;
  onZoomChange?: (size: number) => void;
  onPreviewHeadingChange?: (change: PreviewHeadingChange) => void;
  foldedHeadings?: ReadonlySet<FoldKey>;
  onFoldChange?: (folded: ReadonlySet<FoldKey>) => void;
  reviewComments?: readonly ReviewComment[];
  filePath?: string;
  /** Ctrl/Cmd+click 命中链接时回调;EditorPane 用来打开 URL/锚点/相对路径。 */
  onOpenLink?: (link: MarkdownLink) => void;
  /** Task 切换后回调;用于埋点或外部状态同步。 */
  onTaskToggle?: (task: MarkdownTask, nextChecked: boolean) => void;
  themeId?: string;
};

export function createLivePreviewExtensions(
  options: CreateLivePreviewExtensionsOptions = { baseSize: 14 },
): Extension[] {
  const {
    livePreview = true,
    baseSize,
    onZoomChange,
    onPreviewHeadingChange,
    foldedHeadings,
    onFoldChange,
    reviewComments,
    filePath,
    onOpenLink,
    onTaskToggle,
    themeId,
  } = options;
  const filePathRef = { current: filePath };
  const extensions: Extension[] = [
    headingFoldExtension({ initial: foldedHeadings, onChange: onFoldChange }),
    wheelZoomExtension({ baseSize, onChange: onZoomChange }),
    previewSyncExtension({ onChange: onPreviewHeadingChange }),
    reviewMarkExtension({ comments: reviewComments, filePath }),
    taskToggleExtension({ onToggle: onTaskToggle }),
    linkOpenExtension({ onOpenLink }),
    imageAssetExtension({ filePath: () => filePathRef.current }),
  ];
  if (livePreview) {
    extensions.unshift(
      inlinePreview(),
      tables(),
      imageBlocks(),
      imageFallbackExtension(),
      mathPreviewExtension(themeId),
      mermaidPreviewExtension(themeId),
    );
  }
  return extensions;
}
