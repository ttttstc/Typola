import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { EditorCoreHandle } from '../types/editorCore';
import {
  SELECTION_ACTIONS,
  buildInjectionText,
  buildOneshotPrompt,
  extractReplacementText,
  isDisplayOnlyAction,
  isOneshotAction,
  type SelectionActionId,
  type SelectionOneshotContext,
} from '../services/agent/selectionActions';
import type { AnchorStatus, SelectionAnchor } from '../services/agent/types';
import type { LeftRailMode } from './useLeftRail';

type ConversationBridge = {
  activeConvId: string;
  conversations: Map<string, unknown>;
  createConversation: (title?: string, skillRef?: string) => string;
  queueInjection: (convId: string, text: string, anchor: SelectionAnchor) => void;
};

// 选区原地结果卡的可见状态:hook 维护 + AppLayout 渲染 SelectionResultCard。
export type SelectionIteration = {
  text: string;
  instruction: string;
  createdAt: number;
  rejected?: boolean;
};

export type SelectionResultCardData = {
  x: number;
  y: number;
  action: SelectionActionId;
  actionLabel: string;
  originalText: string;
  anchor: SelectionAnchor;
  /** input = polish 等动作 oneshot 前先让用户写要求;rejected = 用户拒绝当前结果后等待迭代 */
  state: 'input' | 'loading' | 'success' | 'rejected' | 'error';
  newText: string | null;
  error: string | null;
  /** 用户在 input 态填的额外要求,提交后冻结在卡上(retry 复用) */
  requirements?: string;
  /** 只展示不替换（如名词解释），结果卡不显示「采纳替换」按钮。 */
  displayOnly?: boolean;
  iterations: SelectionIteration[];
};

// 哪些动作需要先弹 input 让用户写要求(目前只有润色)
// 缩写/扩写/校对/解释 意图明确不必再问;custom 走对话框不在这里。
const INPUT_PRE_ACTIONS: ReadonlyArray<SelectionActionId> = ['polish'];

type RunOneshot = (prompt: string, signal: AbortSignal) => Promise<string>;

type UseEditorSelectionBridgeOptions = {
  editorCommandRef: MutableRefObject<EditorCoreHandle | null>;
  setLeftRailMode: Dispatch<SetStateAction<LeftRailMode>>;
  convManager: ConversationBridge;
  /** AppLayout 装填的 oneshot 调用 wrapper(已绑定 cwd/agentPath/...);
   *  未提供时所有动作都退化为 queueInjection 走对话框。 */
  runOneshot?: RunOneshot;
  /** 「加检视意见」action 触发回调,AppLayout 据此弹 ReviewCommentEditor 浮卡。 */
  onReviewRequested?: (anchor: SelectionAnchor, origin: { x: number; y: number }) => void;
  getSelectionContext?: (anchor: SelectionAnchor) => SelectionOneshotContext;
};

type UseEditorSelectionBridgeResult = {
  hasEditorSelection: boolean;
  handleInsertToEditor: (text: string) => void;
  handleReplaceEditorSelection: (text: string) => void;
  handleEditorAIAction: (action: SelectionActionId, anchor: SelectionAnchor, origin?: { x: number; y: number }) => void;
  handleReplaceEditorAnchor: (text: string, anchor: SelectionAnchor) => void;
  validateEditorAnchor: (anchor: SelectionAnchor) => AnchorStatus;
  /** 选区原地结果卡当前状态;null = 不显示。 */
  resultCard: SelectionResultCardData | null;
  /** 关闭/取消结果卡,会同时 abort 进行中的 oneshot。 */
  closeResultCard: () => void;
  /** 采纳新文本:走 anchor 精确替换,然后关闭卡。 */
  acceptResultCard: () => void;
  /** error 态点重试:用上次的 action+anchor(+requirements)再跑一次 oneshot。 */
  retryResultCard: () => void;
  rejectResultCard: () => void;
  iterateResultCard: (instruction: string) => void;
  /** displayOnly 模式下复制结果文本到剪贴板。 */
  copyResultCard: () => Promise<void>;
  /** input 态提交:把用户写的要求拼进 prompt 真跑 oneshot。 */
  submitResultCardInput: (requirements: string) => void;
};

/**
 * Keeps AppLayout's editor selection, AI injection, and anchor replacement wiring together.
 */
export function useEditorSelectionBridge({
  editorCommandRef,
  setLeftRailMode,
  convManager,
  runOneshot,
  onReviewRequested,
  getSelectionContext,
}: UseEditorSelectionBridgeOptions): UseEditorSelectionBridgeResult {
  const [hasEditorSelection, setHasEditorSelection] = useState(false);
  const [resultCard, setResultCard] = useState<SelectionResultCardData | null>(null);
  // 当前进行中的 oneshot 的 AbortController:close/retry/卸载时 abort。
  const oneshotAbortRef = useRef<AbortController | null>(null);

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

  // 把当前进行中的 oneshot abort 掉(用于关闭/重试/卸载)。
  const abortInflightOneshot = useCallback(() => {
    oneshotAbortRef.current?.abort();
    oneshotAbortRef.current = null;
  }, []);

  // 真正发起 oneshot 调用 → 维护 loading/success/error 三态。
  // requirements:用户在 input 态填的额外要求(只 polish 走 input 路径,其他动作传空)。
  const executeOneshot = useCallback((
    action: SelectionActionId,
    anchor: SelectionAnchor,
    requirements: string,
    iterationInstruction = '',
    seedIterations?: SelectionIteration[],
  ) => {
    if (!runOneshot) return;
    abortInflightOneshot();
    const controller = new AbortController();
    oneshotAbortRef.current = controller;
    // 拼 prompt:基础模板 + 可选额外要求
    const iterations = seedIterations ?? resultCard?.iterations ?? [];
    const prompt = buildOneshotPrompt(action, anchor.originalText, {
      ...getSelectionContext?.(anchor),
      history: iterations.map((item) => item.text).slice(-5),
      iterationInstruction: [requirements.trim(), iterationInstruction.trim()].filter(Boolean).join('；') || undefined,
    });
    runOneshot(prompt, controller.signal)
      .then((raw) => {
        if (controller.signal.aborted) return;
        const newText = extractReplacementText(raw);
        if (!newText) {
          setResultCard((prev) => prev && prev.action === action ? {
            ...prev,
            state: 'error',
            error: 'AI 返回了空文本,请重试',
          } : prev);
          return;
        }
        setResultCard((prev) => prev && prev.action === action ? {
          ...prev,
          state: 'success',
          newText,
          error: null,
          requirements,
          iterations: [
            ...iterations,
            { text: newText, instruction: iterationInstruction || requirements || '初版', createdAt: Date.now() },
          ].slice(-5),
        } : prev);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const message = error instanceof Error ? error.message : String(error);
        setResultCard((prev) => prev && prev.action === action ? {
          ...prev,
          state: 'error',
          error: message,
        } : prev);
      })
      .finally(() => {
        if (oneshotAbortRef.current === controller) oneshotAbortRef.current = null;
      });
  }, [abortInflightOneshot, getSelectionContext, resultCard?.iterations, runOneshot]);

  // 入口:决定走 input 前置弹框还是直接 oneshot。
  // polish:入 input 态等用户写要求(可空)→ submitResultCardInput 再真跑。
  // 其他 oneshot 动作(缩写/扩写/校对/解释):直接 loading + 真跑。
  const startOneshot = useCallback((
    action: SelectionActionId,
    anchor: SelectionAnchor,
    origin: { x: number; y: number },
  ) => {
    if (!runOneshot) return;
    const actionLabel = SELECTION_ACTIONS[action]?.label ?? action;
    const needInput = INPUT_PRE_ACTIONS.includes(action);
    setResultCard({
      x: origin.x,
      y: origin.y,
      action,
      actionLabel,
      originalText: anchor.originalText,
      anchor,
      state: needInput ? 'input' : 'loading',
      newText: null,
      error: null,
      requirements: needInput ? '' : undefined,
      displayOnly: isDisplayOnlyAction(action),
      iterations: [],
    });
    if (!needInput) executeOneshot(action, anchor, '');
  }, [executeOneshot, runOneshot]);

  // input 态提交:把要求冻结到卡上,切 loading,真跑 oneshot。
  const submitResultCardInput = useCallback((requirements: string) => {
    const current = resultCard;
    if (!current || current.state !== 'input') return;
    setResultCard({
      ...current,
      state: 'loading',
      requirements,
      newText: null,
      error: null,
    });
    executeOneshot(current.action, current.anchor, requirements);
  }, [executeOneshot, resultCard]);

  const handleEditorAIAction = useCallback((
    action: SelectionActionId,
    anchor: SelectionAnchor,
    origin?: { x: number; y: number },
  ) => {
    // 「加检视意见」:分流到 review 浮卡,不调 AI、不进对话框。
    if (action === 'review' && onReviewRequested && origin && anchor.originalText) {
      onReviewRequested(anchor, origin);
      return;
    }
    // C 混合分流:固定动作(polish/shorten/expand/explain/proofread)+ origin 可用 + runOneshot 已注入 → 原地闭环;
    // 否则(explain/custom/无 origin/无 oneshot/review 无 handler)走对话框。
    if (isOneshotAction(action) && origin && runOneshot && anchor.originalText) {
      startOneshot(action, anchor, origin);
      return;
    }
    setLeftRailMode('aiWorkbench');
    const fileName = anchor.filePath.split(/[\\/]/).pop() || anchor.filePath;
    const text = buildInjectionText(action, fileName, anchor.originalText);
    let convId = convManager.activeConvId;
    if (!convManager.conversations.has(convId)) {
      convId = convManager.createConversation('自由对话');
    }
    convManager.queueInjection(convId, text, anchor);
  }, [convManager, onReviewRequested, runOneshot, setLeftRailMode, startOneshot]);

  // 关闭/取消结果卡:abort 进行中的 oneshot,清状态。
  const closeResultCard = useCallback(() => {
    abortInflightOneshot();
    setResultCard(null);
  }, [abortInflightOneshot]);

  // 采纳替换:走 anchor 精确替换,然后关卡。
  // 注意:副作用(replaceRange)必须在 setResultCard 之外执行 ——
  // React 严格模式会双调 updater,且 updater 里抛异常会被静默吞,用户只看到"点了没反应"。
  // 这里把替换/校验/异常处理全在 callback 里跑,异常通过结果卡 error 态透出给用户。
  const acceptResultCard = useCallback(() => {
    const current = resultCard;
    if (!current || current.state !== 'success' || !current.newText) return;
    const editor = editorCommandRef.current;
    if (!editor) {
      setResultCard(null);
      return;
    }
    let status: AnchorStatus;
    try {
      status = editor.validateAnchor(
        current.anchor.filePath,
        current.anchor.from,
        current.anchor.to,
        current.anchor.originalText,
        current.anchor.prefixHint,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setResultCard({ ...current, state: 'error', error: `校验选区失败:${message}` });
      return;
    }
    if (status !== 'valid') {
      // 诊断:把实际 anchor 内容前 80 字打到 error,方便定位 stale 真因
      const ot = (current.anchor.originalText ?? '').slice(0, 80);
      const ph = (current.anchor.prefixHint ?? '').slice(-40);
      setResultCard({
        ...current,
        state: 'error',
        error: status === 'wrong-file'
          ? '原文档已切换,无法替换'
          : `[stale] anchor 在 source 里定位不到。 originalText="${ot}" prefixHint="${ph}"`,
      });
      return;
    }
    try {
      const ok = editor.replaceRange(
        current.anchor.from,
        current.anchor.to,
        current.newText,
      );
      if (!ok) {
        setResultCard({
          ...current,
          state: 'error',
          error: '替换失败(可能文档结构变化)。可重试或手动复制结果。',
        });
        return;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setResultCard({ ...current, state: 'error', error: `替换出错:${message}` });
      return;
    }
    setResultCard(null);
    window.queueMicrotask(refreshEditorSelectionState);
  }, [editorCommandRef, refreshEditorSelectionState, resultCard]);

  const retryResultCard = useCallback(() => {
    const current = resultCard;
    if (!current) return;
    setResultCard({
      ...current,
      state: 'loading',
      error: null,
    });
    executeOneshot(current.action, current.anchor, current.requirements ?? '', '请重新给出一个不同版本。', current.iterations);
  }, [executeOneshot, resultCard]);

  const rejectResultCard = useCallback(() => {
    const current = resultCard;
    if (!current || current.state !== 'success') return;
    const iterations = current.iterations.map((item, index) =>
      index === current.iterations.length - 1 ? { ...item, rejected: true } : item,
    );
    setResultCard({ ...current, state: 'rejected', iterations });
  }, [resultCard]);

  const iterateResultCard = useCallback((instruction: string) => {
    const current = resultCard;
    if (!current) return;
    setResultCard({
      ...current,
      state: 'loading',
      error: null,
    });
    executeOneshot(current.action, current.anchor, current.requirements ?? '', instruction, current.iterations);
  }, [executeOneshot, resultCard]);

  // 复制结果文本到剪贴板（用于 displayOnly 模式如名词解释）。
  const copyResultCard = useCallback(async () => {
    const current = resultCard;
    if (!current || !current.newText) return;
    try {
      await navigator.clipboard.writeText(current.newText);
    } catch {
      // fallback：不可用时静默忽略
    }
  }, [resultCard]);

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

  // 卸载时 abort 进行中的 oneshot,避免后台调用泄漏。
  useEffect(() => () => {
    oneshotAbortRef.current?.abort();
    oneshotAbortRef.current = null;
  }, []);

  return {
    hasEditorSelection,
    handleInsertToEditor,
    handleReplaceEditorSelection,
    handleEditorAIAction,
    handleReplaceEditorAnchor,
    validateEditorAnchor,
    resultCard,
    closeResultCard,
    acceptResultCard,
    retryResultCard,
    rejectResultCard,
    iterateResultCard,
    copyResultCard,
    submitResultCardInput,
  };
}
