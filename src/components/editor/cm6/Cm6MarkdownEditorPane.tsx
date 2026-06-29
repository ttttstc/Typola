import { forwardRef, useMemo } from 'react';
import '@atomic-editor/editor/styles.css';
import 'katex/dist/katex.min.css';
import { EditorPane, type SourceHeadingScrollRequest } from '../../EditorPane';
import type { SelectionActionId } from '../../../services/agent/selectionActions';
import type { SelectionAnchor } from '../../../services/agent/types';
import type { EditorCommandHandle } from '../../../types/editorCommands';
import { createLivePreviewExtensions } from './createLivePreviewExtensions';

type Cm6MarkdownEditorPaneProps = {
  source: string;
  onChange: (value: string) => void;
  headingScrollRequest?: SourceHeadingScrollRequest;
  onScrollRatio?: (ratio: number) => void;
  filePath?: string;
  onAIAction?: (action: SelectionActionId, anchor: SelectionAnchor, origin?: { x: number; y: number }) => void;
};

/**
 * Phase 1 CM6 编辑器内核候选入口。
 *
 * 当前先复用源码模式里已经跑通的 CM6 EditorPane，确保保存、选区、AI anchor、
 * 搜索 reveal、撤销等命令契约不变。Phase 2 再在这里替换为 Typora-like live preview
 * extension 组合。
 */
export const Cm6MarkdownEditorPane = forwardRef<EditorCommandHandle, Cm6MarkdownEditorPaneProps>(
  function Cm6MarkdownEditorPane(props, ref) {
    const livePreviewExtensions = useMemo(() => createLivePreviewExtensions(), []);
    return (
      <div className="cm6-markdown-editor-pane">
        <EditorPane ref={ref} {...props} extraExtensions={livePreviewExtensions} />
      </div>
    );
  },
);
