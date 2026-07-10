import { type Extension } from '@codemirror/state';
import { imageBlocks, inlinePreview, tables } from '@atomic-editor/editor';
import { imageFallbackExtension } from './imageFallbackExtension';
import { mathPreviewExtension } from './mathPreviewExtension';
import { mermaidPreviewExtension } from './mermaidPreviewExtension';
import { wheelZoomExtension } from './wheelZoomExtension';
import { previewSyncExtension, type PreviewHeadingChange } from './previewSyncExtension';
import { headingFoldExtension } from './headingFoldExtension';
import type { FoldKey } from '../../../services/headingFoldService';

type CreateLivePreviewExtensionsOptions = {
  livePreview?: boolean;
  baseSize: number;
  onZoomChange?: (size: number) => void;
  onPreviewHeadingChange?: (change: PreviewHeadingChange) => void;
  foldedHeadings?: ReadonlySet<FoldKey>;
  onFoldChange?: (folded: ReadonlySet<FoldKey>) => void;
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
  } = options;
  const extensions: Extension[] = [
    headingFoldExtension({ initial: foldedHeadings, onChange: onFoldChange }),
    wheelZoomExtension({ baseSize, onChange: onZoomChange }),
    previewSyncExtension({ onChange: onPreviewHeadingChange }),
  ];
  if (livePreview) {
    extensions.unshift(
      inlinePreview(),
      tables(),
      imageBlocks(),
      imageFallbackExtension(),
      mathPreviewExtension(),
      mermaidPreviewExtension(),
    );
  }
  return extensions;
}
