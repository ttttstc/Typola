import { Compartment, type Extension } from '@codemirror/state';
import { defaultKeymap, historyKeymap } from '@codemirror/commands';
import { searchKeymap } from '@codemirror/search';
import { keymap, type EditorView } from '@codemirror/view';
import { imageBlocks, inlinePreview } from '@atomic-editor/editor';
import {
  markdownTables,
  TableStyle,
  TableTheme,
} from 'codemirror-markdown-tables';
import { imageFallbackExtension } from './imageFallbackExtension';
import { imageAssetExtension } from './imageAssetExtension';
import { mathPreviewExtension } from './mathPreviewExtension';
import { mermaidPreviewExtension } from './mermaidPreviewExtension';
import { wheelZoomExtension } from './wheelZoomExtension';
import { previewSyncExtension, type PreviewHeadingChange } from './previewSyncExtension';
import { headingFoldExtension } from './headingFoldExtension';
import { frontmatterFoldExtension } from './frontmatterFoldExtension';
import { footnoteExtension } from './footnoteExtension';
import { htmlPreviewExtension } from './htmlPreviewExtension';
import type { FoldKey } from '../../../services/headingFoldService';
import type { ReviewComment } from '../../../services/review/reviewState';
import { reviewMarkExtension } from './reviewMarkExtension';
import {
  linkOpenExtension,
  taskToggleExtension,
} from './linkInteractionExtension';
import type { MarkdownLink, MarkdownTask } from '../../../services/markdownAnalysisService';

const typolaTableTheme = TableTheme.light.with({
  '--tbl-theme-row-background': 'var(--theme-paper)',
  '--tbl-theme-header-row-background': 'var(--theme-paper)',
  '--tbl-theme-even-row-background': 'var(--theme-paper)',
  '--tbl-theme-odd-row-background': 'var(--theme-surface-muted)',
  '--tbl-theme-border-color': 'var(--theme-border-soft)',
  '--tbl-theme-border-hover-color': 'var(--theme-border-hover)',
  '--tbl-theme-border-active-color': 'var(--theme-accent)',
  '--tbl-theme-outline-color': 'var(--theme-accent)',
  '--tbl-theme-text-color': 'var(--theme-text-primary)',
  '--tbl-theme-menu-border-color': 'var(--theme-border-soft)',
  '--tbl-theme-menu-background': 'var(--theme-surface)',
  '--tbl-theme-menu-hover-background': 'var(--theme-accent)',
  '--tbl-theme-menu-text-color': 'var(--theme-text-primary)',
  '--tbl-theme-menu-hover-text-color': 'var(--theme-text-primary)',
  '--tbl-theme-select-all-focus-overlay': 'var(--theme-selection)',
  '--tbl-theme-select-all-blur-overlay': 'var(--theme-selection)',
});

const typolaTableStyle = TableStyle.default.with({
  '--tbl-style-font-family': 'inherit',
  '--tbl-style-font-size': 'inherit',
  '--tbl-style-menu-font-family': 'inherit',
  '--tbl-style-menu-font-size': 'inherit',
});

const typolaTableExtension = markdownTables({
  theme: typolaTableTheme,
  style: typolaTableStyle,
  selectionType: 'codemirror',
  handlePosition: 'outside',
  lineWrapping: 'wrap',
  extensions: [keymap.of(defaultKeymap)],
  globalKeyBindings: [...historyKeymap, ...searchKeymap],
});

export type LivePreviewCompartments = {
  preview: Compartment;
  headingFold: Compartment;
  wheelZoom: Compartment;
  previewSync: Compartment;
  reviewMark: Compartment;
  taskToggle: Compartment;
  linkOpen: Compartment;
  imageAsset: Compartment;
};

export function createLivePreviewCompartments(): LivePreviewCompartments {
  return {
    preview: new Compartment(),
    headingFold: new Compartment(),
    wheelZoom: new Compartment(),
    previewSync: new Compartment(),
    reviewMark: new Compartment(),
    taskToggle: new Compartment(),
    linkOpen: new Compartment(),
    imageAsset: new Compartment(),
  };
}

export type CreateLivePreviewExtensionsOptions = {
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
  frontmatterFold?: boolean;
  compartments?: LivePreviewCompartments;
};

function previewExtensions(options: Pick<CreateLivePreviewExtensionsOptions, 'livePreview' | 'themeId' | 'frontmatterFold'>): Extension[] {
  if (!options.livePreview) return [];
  return [
    ...(options.frontmatterFold ? [frontmatterFoldExtension()] : []),
    footnoteExtension(),
    htmlPreviewExtension(),
    inlinePreview(),
    typolaTableExtension,
    imageBlocks(),
    imageFallbackExtension(),
    mathPreviewExtension(options.themeId),
    mermaidPreviewExtension(options.themeId),
  ];
}

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
    frontmatterFold = true,
    compartments = createLivePreviewCompartments(),
  } = options;
  return [
    compartments.preview.of(previewExtensions({ livePreview, themeId, frontmatterFold })),
    compartments.headingFold.of(headingFoldExtension({ initial: foldedHeadings, onChange: onFoldChange })),
    compartments.wheelZoom.of(wheelZoomExtension({ baseSize, onChange: onZoomChange })),
    compartments.previewSync.of(previewSyncExtension({ onChange: onPreviewHeadingChange })),
    compartments.reviewMark.of(reviewMarkExtension({ comments: reviewComments, filePath: typeof filePath === 'string' ? filePath : undefined })),
    compartments.taskToggle.of(taskToggleExtension({ onToggle: onTaskToggle })),
    compartments.linkOpen.of(linkOpenExtension({ onOpenLink })),
    compartments.imageAsset.of(imageAssetExtension({ filePath: () => filePath })),
  ];
}

export function reconfigureLivePreviewExtensions(
  view: EditorView,
  options: CreateLivePreviewExtensionsOptions,
  compartments: LivePreviewCompartments,
): void {
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
    frontmatterFold = true,
  } = options;
  view.dispatch({
    effects: [
      compartments.preview.reconfigure(previewExtensions({ livePreview, themeId, frontmatterFold })),
      compartments.wheelZoom.reconfigure(wheelZoomExtension({ baseSize, onChange: onZoomChange })),
      compartments.previewSync.reconfigure(previewSyncExtension({ onChange: onPreviewHeadingChange })),
      compartments.reviewMark.reconfigure(reviewMarkExtension({ comments: reviewComments, filePath: typeof filePath === 'string' ? filePath : undefined })),
      compartments.taskToggle.reconfigure(taskToggleExtension({ onToggle: onTaskToggle })),
      compartments.linkOpen.reconfigure(linkOpenExtension({ onOpenLink })),
      compartments.imageAsset.reconfigure(imageAssetExtension({ filePath: () => filePath })),
      ...(foldedHeadings !== undefined
        ? [compartments.headingFold.reconfigure(headingFoldExtension({ initial: foldedHeadings, onChange: onFoldChange }))]
        : []),
    ],
  });
}
