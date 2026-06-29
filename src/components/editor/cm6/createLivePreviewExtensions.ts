import { type Extension } from '@codemirror/state';
import { imageBlocks, inlinePreview, tables } from '@atomic-editor/editor';
import { mathPreviewExtension } from './mathPreviewExtension';
import { mermaidPreviewExtension } from './mermaidPreviewExtension';

export function createLivePreviewExtensions(): Extension[] {
  return [
    inlinePreview(),
    tables(),
    imageBlocks(),
    mathPreviewExtension(),
    mermaidPreviewExtension(),
  ];
}

