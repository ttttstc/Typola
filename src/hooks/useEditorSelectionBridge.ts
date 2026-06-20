import { useCallback, useEffect, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { EditorCommandHandle } from '../types/editorCommands';
import { buildInjectionText, type SelectionActionId } from '../services/agent/selectionActions';
import type { AnchorStatus, SelectionAnchor } from '../services/agent/types';
import type { LeftRailMode } from './useLeftRail';

// 从 AI 回复中提取纯文本替换内容。
// 如果回复被 ```...``` 包裹，提取代码块内容；否则原样返回。
// 这是针对「选区 AI 动作」的专用后处理：prompt 要求 AI 只输出替换文本，
// 但 Claude 有时仍会加 markdown 包装，这里做最后的清理。
function extractReplacementText(raw: string): string {
  const trimmed = raw.trim();
  // 匹配单个代码块（带或不带语言标记）
  const blockMatch = trimmed.match(/^```(?:\w*)\n([\s\S]*?)\n```$/);
  if (blockMatch) return blockMatch[1].trim();
  return trimmed;
}

type ConversationBridge = {
  activeConvId: string;
  conversations: Map<string, unknown>;
  createConversation: (title?: string, skillRef?: string) => string;
  queueInjection: (convId: string, text: string, anchor: SelectionAnchor) => void;
};

type UseEditorSelectionBridgeOptions = {
  editorCommandRef: MutableRefObject<EditorCommandHandle | null>;
  setLeftRailMode: Dispatch<SetStateAction<LeftRailMode>>;
  convManager: ConversationBridge;
};

type UseEditorSelectionBridgeResult = {
  hasEditorSelection: boolean;
  handleInsertToEditor: (text: string) => void;
  handleReplaceEditorSelection: (text: string) => void;
  handleEditorAIAction: (action: SelectionActionId, anchor: SelectionAnchor) => void;
  handleReplaceEditorAnchor: (text: string, anchor: SelectionAnchor) => void;
  validateEditorAnchor: (anchor: SelectionAnchor) => AnchorStatus;
};

/**
 * Keeps AppLayout's editor selection, AI injection, and anchor replacement wiring together.
 */
export function useEditorSelectionBridge({
  editorCommandRef,
  setLeftRailMode,
  convManager,
}: UseEditorSelectionBridgeOptions): UseEditorSelectionBridgeResult {
  const [hasEditorSelection, setHasEditorSelection] = useState(false);

  const refreshEditorSelectionState = useCallback(() => {
    setHasEditorSelection(Boolean(editorCommandRef.current?.getSelection()));
  }, [editorCommandRef]);

  const handleInsertToEditor = useCallback((text: string) => {
    editorCommandRef.current?.insertText(text);
    refreshEditorSelectionState();
  }, [editorCommandRef, refreshEditorSelectionState]);

  const handleReplaceEditorSelection = useCallback((text: string) => {
    const editor = editorCommandRef.current;
    if (!editor) return;
    if (editor.getSelection()) editor.replaceSelection(text);
    else editor.insertText(text);
    refreshEditorSelectionState();
  }, [editorCommandRef, refreshEditorSelectionState]);

  const handleEditorAIAction = useCallback((action: SelectionActionId, anchor: SelectionAnchor) => {
    setLeftRailMode('aiWorkbench');
    const fileName = anchor.filePath.split(/[\\/]/).pop() || anchor.filePath;
    const text = buildInjectionText(action, fileName, anchor.originalText);
    let convId = convManager.activeConvId;
    if (!convManager.conversations.has(convId)) {
      convId = convManager.createConversation('自由对话');
    }
    convManager.queueInjection(convId, text, anchor);
  }, [convManager, setLeftRailMode]);

  const handleReplaceEditorAnchor = useCallback((text: string, anchor: SelectionAnchor) => {
    const editor = editorCommandRef.current;
    if (!editor) return;
    const status = editor.validateAnchor(anchor.filePath, anchor.from, anchor.to, anchor.originalText, anchor.prefixHint);
    if (status !== 'valid') return;
    // 从 AI 回复中提取纯文本（剥离可能的 markdown 包装）
    const cleanText = extractReplacementText(text);
    if (!cleanText) return;
    editor.replaceRange(anchor.from, anchor.to, cleanText);
    refreshEditorSelectionState();
  }, [editorCommandRef, refreshEditorSelectionState]);

  const validateEditorAnchor = useCallback((anchor: SelectionAnchor): AnchorStatus => {
    const editor = editorCommandRef.current;
    if (!editor) return 'wrong-file';
    return editor.validateAnchor(anchor.filePath, anchor.from, anchor.to, anchor.originalText, anchor.prefixHint);
  }, [editorCommandRef]);

  useEffect(() => {
    const scheduleRefresh = () => window.requestAnimationFrame(refreshEditorSelectionState);
    document.addEventListener('selectionchange', scheduleRefresh);
    window.addEventListener('keyup', scheduleRefresh);
    window.addEventListener('mouseup', scheduleRefresh);
    return () => {
      document.removeEventListener('selectionchange', scheduleRefresh);
      window.removeEventListener('keyup', scheduleRefresh);
      window.removeEventListener('mouseup', scheduleRefresh);
    };
  }, [refreshEditorSelectionState]);

  return {
    hasEditorSelection,
    handleInsertToEditor,
    handleReplaceEditorSelection,
    handleEditorAIAction,
    handleReplaceEditorAnchor,
    validateEditorAnchor,
  };
}
