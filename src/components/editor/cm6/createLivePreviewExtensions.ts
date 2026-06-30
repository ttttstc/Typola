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
  baseSize: number;
  onZoomChange?: (size: number) => void;
  onPreviewHeadingChange?: (change: PreviewHeadingChange) => void;
  foldedHeadings?: ReadonlySet<FoldKey>;
  onFoldChange?: (folded: ReadonlySet<FoldKey>) => void;
};

export function createLivePreviewExtensions(
  options: CreateLivePreviewExtensionsOptions = { baseSize: 14 },
): Extension[] {
  const { baseSize, onZoomChange, onPreviewHeadingChange, foldedHeadings, onFoldChange } = options;
  return [
    inlinePreview(),
    tables(),
    imageBlocks(),
    imageFallbackExtension(),
    mathPreviewExtension(),
    mermaidPreviewExtension(),
    headingFoldExtension({ initial: foldedHeadings, onChange: onFoldChange }),
    wheelZoomExtension({ baseSize, onChange: onZoomChange }),
    previewSyncExtension({ onChange: onPreviewHeadingChange }),
  ];
}

