import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { VDITOR_PREVIEW_I18N } from '../services/vditorPreviewConfig';
import { useSettings } from '../hooks/useSettings';
import { translate } from '../services/i18n';
import { resolveLocalImages } from '../services/localImageResolver';
import { renderMermaidIn, serializeMermaidSvg } from '../services/mermaidRenderer';
import type { EditorCommandHandle } from '../types/editorCommands';
import { EditorContextMenu, type FormatAction } from './EditorContextMenu';
import { applyVditorFormat } from '../services/vditorFormatService';
import type { SelectionActionId } from '../services/agent/selectionActions';
import { findUniqueAnchor } from '../services/agent/selectionActions';
import { findIrDomRange } from '../services/documentSearchService';
import { SelectionFloatingBar } from './selection/SelectionFloatingBar';
import type { SelectionAnchor } from '../services/agent/types';
import type { ReviewComment } from '../services/review/reviewState';

type WysiwygEditorPaneProps = {
  source: string;
  onChange: (value: string) => void;
  filePath?: string;
  onScrollRatio?: (ratio: number) => void;
  // 选区 AI 动作回调（由 AppLayout 注入；不传则不渲染 AI 菜单组）
  // origin = 触发点视口坐标(用于「原地闭环」浮卡定位);无 origin 时退化为对话框路径。
  onAIAction?: (action: SelectionActionId, anchor: SelectionAnchor, origin?: { x: number; y: number }) => void;
  /** 当前文档的检视意见,用于在编辑器内高亮有意见的段落。 */
  reviewComments?: ReviewComment[];
};

const IR_MARKER_COLLAPSE_DELAY_MS = 220;
const ANCHOR_PREFIX_MAX = 80;

function getIrElement(editor: import('vditor').default): HTMLElement | null {
  const vditor = (editor as unknown as { vditor?: { ir?: { element?: HTMLElement } } }).vditor;
  return vditor?.ir?.element ?? null;
}

// 从 ir 根到 range.startContainer 收集纯文本,取最后 ANCHOR_PREFIX_MAX 字符。
// 用于在 source markdown 中唯一定位选区(原文本多处出现时也能找到正确那次)。
// 注意:用 range.toString()(纯文本,不含 markdown 标记)。findUniqueAnchor
// 的兜底层会 strip source 后匹配 + 反查 source 偏移,所以这里不必拼 marker。
// 这避开了 Vditor IR DOM textContent 跟 source markdown 不一致的黑盒问题。
function computePrefixHint(ir: HTMLElement, range: Range): string {
  const preRange = ir.ownerDocument?.createRange();
  if (!preRange) return '';
  preRange.setStart(ir, 0);
  try {
    preRange.setEnd(range.startContainer, range.startOffset);
  } catch {
    return '';
  }
  const preText = preRange.toString();
  if (preText.length <= ANCHOR_PREFIX_MAX) return preText;
  return preText.slice(-ANCHOR_PREFIX_MAX);
}

// 选区在视口里的中心坐标(用于键盘触发的菜单定位)。
function selectionViewportPos(range: Range): { x: number; y: number } | null {
  const rects = range.getClientRects();
  if (rects.length === 0) {
    const r = range.getBoundingClientRect();
    return { x: r.left, y: r.top };
  }
  const first = rects[0];
  return { x: first.left, y: first.top };
}

// keepSelection=true:跳过当前 selection 所在的 expand 节点(用户正在编辑该 token,
// 不能强制收回,否则把光标弹飞)。selectionchange / 光标空闲场景必须传 true。
function collapseExpandedMarkers(
  editor: import('vditor').default | null,
  options?: { keepSelection?: boolean },
): void {
  if (!editor) return;
  const ir = getIrElement(editor);
  if (!ir) return;
  let activeNode: Node | null = null;
  if (options?.keepSelection) {
    const sel = ir.ownerDocument?.defaultView?.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      if (ir.contains(range.commonAncestorContainer)) activeNode = range.commonAncestorContainer;
    }
  }
  ir.querySelectorAll('.vditor-ir__node--expand').forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    if (node.closest('[data-type="code-block"], pre, code')) return;
    if (node.querySelector('[data-type="code-block"], pre, code')) return;
    if (activeNode && node.contains(activeNode)) return;
    node.classList.remove('vditor-ir__node--expand');
  });
}

// 选区是否落在图片 token 内(双击图片 / 选中 img 等情况)。
// 用于跳过 AI 选区浮条 — 在图片上弹出"润色 / 缩写"无意义。
function isSelectionInsideImageToken(range: Range): boolean {
  const ancestor = range.commonAncestorContainer;
  const el = ancestor instanceof Element ? ancestor : ancestor.parentElement;
  if (!el) return false;
  const token = el.closest('[data-type="img"], img');
  if (!token) return false;
  return token.contains(range.startContainer) && token.contains(range.endContainer);
}

function silenceCodeBlockAssist(editor: import('vditor').default | null): void {
  if (!editor) return;
  const ir = getIrElement(editor);
  if (!ir) return;
  const sel = ir.ownerDocument?.defaultView?.getSelection();
  const activeNode = sel?.rangeCount ? sel.getRangeAt(0).commonAncestorContainer : ir.ownerDocument.activeElement;
  if (!activeNode) return;
  const element = activeNode instanceof HTMLElement ? activeNode : activeNode.parentElement;
  if (!element?.closest('[data-type="code-block"], pre, code')) return;
  const internals = editor as unknown as {
    vditor?: {
      hint?: { element?: HTMLElement };
      wysiwyg?: { popover?: HTMLElement; selectPopover?: HTMLElement };
    };
  };
  const { hint, wysiwyg } = internals.vditor ?? {};
  if (hint?.element) hint.element.style.display = 'none';
  if (wysiwyg?.popover) wysiwyg.popover.style.display = 'none';
  if (wysiwyg?.selectPopover) wysiwyg.selectPopover.style.display = 'none';
}

export const WysiwygEditorPane = forwardRef<EditorCommandHandle, WysiwygEditorPaneProps>(function WysiwygEditorPane(
  { source, onChange, filePath, onScrollRatio, onAIAction, reviewComments },
  ref,
) {
  const settings = useSettings();
  const t = useCallback(
    (key: Parameters<typeof translate>[1]) => translate(settings.locale, key),
    [settings.locale],
  );
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<import('vditor').default | null>(null);
  const applyingExternalValue = useRef(false);
  const latestSource = useRef(source);
  const lastEmittedValue = useRef(source);
  const collapseTimerRef = useRef<number | null>(null);
  // 光标在 mermaid 块外 idle 一会后自动收回展开的源码块为图(对齐 Typora 体验)。
  // selectionchange 触发,debounce 350ms。renderMermaidIn 本身 skip 当前 selection 所在的 pre,
  // 所以光标停在某块内不会让那块收回,只会让"已展开但用户已离开"的块收回。
  const mermaidIdleTimerRef = useRef<number | null>(null);
  // 光标移出展开的 IR token(图片 / 链接等)后自动收回的 debounce。skip 当前 selection 所在 node。
  const collapseIdleTimerRef = useRef<number | null>(null);
  const onScrollRatioRef = useRef(onScrollRatio);
  // 记录最近一次真实选区,用于 AI 回复的“替换选区”操作。
  const lastSelectionRangeRef = useRef<Range | null>(null);
  // 搜索跳转期间临时抑制浮条
  const suppressFloatingBarRef = useRef(false);
  // 记录最近一次被校验通过的 anchor.originalText,Vditor 模式按文本搜索替换。
  const lastValidatedAnchorTextRef = useRef<string | null>(null);
  // 记录最近一次被校验通过的 anchor.prefixHint,Vditor 模式用 prefixHint+originalText 唯一定位。
  const lastValidatedPrefixHintRef = useRef<string | null>(null);
  // AI 替换撤销栈。每条带:
  //   before  = AI 替换前的 source(撤销时还原成这个)
  //   after   = AI 替换后立刻的 source(handler 用它判定"用户有没有再改过")
  //   selRange = AI 替换前的选区(尽力恢复)
  // Ctrl+Z 拦截策略:只有 editor.getValue() === top.after 才用栈(用户没在 AI 改后手改),
  // 否则放行给 Vditor 原生 undo,让原生先消化用户的手改。
  // cap 50:避免长跑内存堆积;先到先丢。
  const UNDO_STACK_CAP = 50;
  const undoStackRef = useRef<Array<{ before: string; after: string; selRange: Range | null }>>([]);
  const pushUndoSnapshot = useCallback((before: string, after: string, selRange: Range | null) => {
    const stack = undoStackRef.current;
    stack.push({ before, after, selRange });
    while (stack.length > UNDO_STACK_CAP) stack.shift();
  }, []);
  // 跨文档:filePath 变化时清栈,避免在 B 文档按 Ctrl+Z 把 A 文档的 before 写进 B
  useEffect(() => {
    undoStackRef.current = [];
  }, [filePath]);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    hasSelection: boolean;
    mermaidTarget: Element | null;
  } | null>(null);
  // 选区浮条状态:跟着 IR 选区变化重算 rect + hasSelection;由 selectionchange listener 更新。
  const [floatingRect, setFloatingRect] = useState<{ selRect: DOMRect } | null>(null);
  const [floatingHasSelection, setFloatingHasSelection] = useState(false);

  const getSavedOrCurrentSelection = useCallback((): Range | null => {
    const editor = editorRef.current;
    const ir = editor ? getIrElement(editor) : null;
    if (!ir) return null;
    const sel = ir.ownerDocument?.defaultView?.getSelection();
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
      const range = sel.getRangeAt(0);
      if (ir.contains(range.commonAncestorContainer)) {
        lastSelectionRangeRef.current = range.cloneRange();
        return range;
      }
    }
    const saved = lastSelectionRangeRef.current;
    if (saved && ir.contains(saved.commonAncestorContainer)) return saved;
    return null;
  }, []);

  const restoreSelectionRange = useCallback((range: Range): void => {
    const editor = editorRef.current;
    const ir = editor ? getIrElement(editor) : null;
    const sel = ir?.ownerDocument?.defaultView?.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(range);
  }, []);

  const handleContextMenu = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!editorRef.current) return;
    // 仅在 IR 编辑区内的右键才接管;其他区域(toolbar 等)放浏览器默认菜单
    const ir = getIrElement(editorRef.current);
    if (!ir || !(event.target instanceof Node) || !ir.contains(event.target)) return;
    event.preventDefault();
    const sel = ir.ownerDocument?.defaultView?.getSelection();
    const hasSelection = !!sel && !sel.isCollapsed && (sel.toString().length > 0);
    const mermaidTarget = event.target instanceof Element ? event.target.closest('.typola-mermaid') : null;
    setContextMenu({ x: event.clientX, y: event.clientY, hasSelection, mermaidTarget });
  }, []);

  const handleMenuPick = useCallback((action: FormatAction) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    void applyVditorFormat(editor, action);
  }, []);

  const handleCopyMermaidSvg = useCallback(async () => {
    const svg = serializeMermaidSvg(contextMenu?.mermaidTarget ?? null);
    if (!svg) return;
    try {
      await navigator.clipboard?.writeText(svg);
    } catch (error) {
      console.warn('Failed to copy Mermaid SVG:', error);
    }
  }, [contextMenu?.mermaidTarget]);

  // 抽 triggerAIAction:菜单/浮条/Ctrl+K 都用它,统一组装 anchor + origin。
  const triggerAIAction = useCallback((action: SelectionActionId, origin?: { x: number; y: number }) => {
    if (!onAIAction || !filePath) return;
    const editor = editorRef.current;
    const range = getSavedOrCurrentSelection();
    // range.toString() 给纯文本;findUniqueAnchor 兜底层在 source 端 strip 后匹配 +
    // 反查偏移,所以纯文本足够定位,不依赖 IR DOM textContent 黑盒
    const text = range?.toString() ?? '';
    if (!text && action !== 'custom') return;
    const ir = editor ? getIrElement(editor) : null;
    const prefixHint = range && ir ? computePrefixHint(ir, range) : '';
    const anchor: SelectionAnchor = {
      filePath,
      from: 0,
      to: text.length,
      originalText: text,
      prefixHint,
    };
    onAIAction(action, anchor, origin);
  }, [filePath, getSavedOrCurrentSelection, onAIAction]);

  const handleAIPick = useCallback((action: SelectionActionId) => {
    // 菜单 origin 用 contextMenu 的坐标(右键/Ctrl+K 弹菜单时已记录)。
    const origin = contextMenu ? { x: contextMenu.x, y: contextMenu.y } : undefined;
    triggerAIAction(action, origin);
  }, [contextMenu, triggerAIAction]);

  const handleMenuClose = useCallback(() => setContextMenu(null), []);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return;
    if (!onAIAction || !filePath) return;
    const range = getSavedOrCurrentSelection();
    const text = range?.toString() ?? '';
    if (!text) return;
    event.preventDefault();
    event.stopPropagation();
    // 弹起 5+1 菜单(对齐右键的动线),用选区位置作为菜单位置;不直接触发 custom。
    const pos = range ? selectionViewportPos(range) : null;
    setContextMenu({
      x: pos?.x ?? 0,
      y: pos?.y ?? 0,
      hasSelection: true,
      mermaidTarget: null,
    });
  }, [filePath, getSavedOrCurrentSelection, onAIAction]);

  // 全局 Ctrl+Z 拦截:AI 替换撤销优先,但仅当用户没在 AI 改后手改过(current === top.after)。
  // 否则放行 Vditor 原生 undo,让原生先消化手改,等手改全撤完文档值回到 AI 改后状态,再 Ctrl+Z 就匹配栈顶 → 弹 AI。
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key !== 'z' || e.shiftKey) return;
      const stack = undoStackRef.current;
      if (stack.length === 0) return;
      const host = hostRef.current;
      if (!host || !e.target || !host.contains(e.target as Node)) return;
      const editor = editorRef.current;
      if (!editor) return;
      const top = stack[stack.length - 1];
      // 关键判定:用户改过文档 → 当前值 !== AI 改后值 → 放行 Vditor 原生 undo
      if (editor.getValue() !== top.after) return;
      e.preventDefault();
      e.stopPropagation();
      stack.pop();
      applyingExternalValue.current = true;
      editor.setValue(top.before, true);
      lastEmittedValue.current = top.before;
      onChange(top.before);
      if (top.selRange) {
        lastSelectionRangeRef.current = top.selRange;
        const ir = getIrElement(editor);
        if (ir) {
          try {
            const sel = ir.ownerDocument?.defaultView?.getSelection();
            if (sel) {
              sel.removeAllRanges();
              sel.addRange(top.selRange);
            }
          } catch { /* 选区恢复失败不影响内容回退;setValue 重建 DOM 后旧 Range 可能 stale */ }
        }
      }
      window.requestAnimationFrame(() => {
        applyingExternalValue.current = false;
      });
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [onChange]);

  useEffect(() => {
    onScrollRatioRef.current = onScrollRatio;
  }, [onScrollRatio]);

  useEffect(() => {
    latestSource.current = source;
  }, [source]);

  useEffect(() => {
    return () => {
      if (collapseTimerRef.current !== null) {
        window.clearTimeout(collapseTimerRef.current);
        collapseTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    // Scroll sync: capture-phase listener on host catches any inner scroll container Vditor creates.
    let scrollRafId: number | null = null;
    const handleScroll = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (scrollRafId !== null) return;
      scrollRafId = window.requestAnimationFrame(() => {
        scrollRafId = null;
        const cb = onScrollRatioRef.current;
        if (!cb) return;
        const max = target.scrollHeight - target.clientHeight;
        cb(max > 0 ? target.scrollTop / max : 0);
      });
    };
    host.addEventListener('scroll', handleScroll, { capture: true, passive: true });
    const scheduleMermaidIdleRender = () => {
      if (mermaidIdleTimerRef.current !== null) {
        window.clearTimeout(mermaidIdleTimerRef.current);
      }
      mermaidIdleTimerRef.current = window.setTimeout(() => {
        mermaidIdleTimerRef.current = null;
        const host = hostRef.current;
        if (!host) return;
        void renderMermaidIn(host, {
          theme: settings.theme === 'dark' ? 'dark' : 'default',
          editable: true,
        });
      }, 350);
    };

    const scheduleCollapseIdle = () => {
      if (collapseIdleTimerRef.current !== null) {
        window.clearTimeout(collapseIdleTimerRef.current);
      }
      collapseIdleTimerRef.current = window.setTimeout(() => {
        collapseIdleTimerRef.current = null;
        collapseExpandedMarkers(editorRef.current, { keepSelection: true });
      }, 350);
    };

    // 搜索跳转期间临时抑制浮条——revealSearchMatch 设 selection 会触发
    // selectionchange,但搜索高亮不需要浮条。
    if (suppressFloatingBarRef.current) return;
    const handleSelectionChange = () => {
      const editor = editorRef.current;
      const ir = editor ? getIrElement(editor) : null;
      if (!ir) {
        setFloatingHasSelection(false);
        setFloatingRect(null);
        scheduleMermaidIdleRender();
        scheduleCollapseIdle();
        return;
      }
      const sel = ir.ownerDocument?.defaultView?.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed || sel.toString().length === 0) {
        setFloatingHasSelection(false);
        setFloatingRect(null);
        // 光标移动到 mermaid / 图片 / 链接等 token 外,安排 idle 渲染 + 收回展开节点。
        // 各自内部 skip selection 所在 token,光标停在某块内不会被强制收回。
        scheduleMermaidIdleRender();
        scheduleCollapseIdle();
        return;
      }
      const range = sel.getRangeAt(0);
      if (!ir.contains(range.commonAncestorContainer)) {
        setFloatingHasSelection(false);
        setFloatingRect(null);
        scheduleMermaidIdleRender();
        scheduleCollapseIdle();
        return;
      }
      lastSelectionRangeRef.current = range.cloneRange();
      // selection 落在图片 token 内时跳过 AI 浮条 — 双击图片 / 选图都不该出"润色"按钮。
      if (isSelectionInsideImageToken(range)) {
        setFloatingHasSelection(false);
        setFloatingRect(null);
        scheduleMermaidIdleRender();
        scheduleCollapseIdle();
        return;
      }
      // 浮条 rect:用 range 的 boundingClientRect(覆盖跨行的整体框)
      const rect = range.getBoundingClientRect();
      if (rect.width > 0 || rect.height > 0) {
        setFloatingRect({ selRect: rect });
        setFloatingHasSelection(true);
      } else {
        setFloatingHasSelection(false);
        setFloatingRect(null);
      }
      scheduleMermaidIdleRender();
      scheduleCollapseIdle();
    };
    document.addEventListener('selectionchange', handleSelectionChange);

    let cancelled = false;
    void Promise.all([
      import('vditor/dist/index.css'),
      import('vditor'),
    ]).then(([, { default: Vditor }]) => {
      if (cancelled || !hostRef.current) return;

      const editor = new Vditor(hostRef.current, {
        value: latestSource.current,
        mode: 'ir',
        height: '100%',
        width: '100%',
        cdn: '/vditor',
        lang: 'zh_CN',
        i18n: VDITOR_PREVIEW_I18N,
        toolbar: [],
        hint: {
          parse: false,
          extend: [],
          emoji: {},
        },
        resize: { enable: false },
        counter: { enable: false },
        cache: { enable: false },
        preview: {
          markdown: {
            sanitize: true,
            codeBlockPreview: false,
          },
          theme: {
            current: 'light',
            path: '',
          },
          hljs: {
            enable: true,
            style: 'github',
            lineNumber: false,
          },
        },
        after() {
          const host = hostRef.current;
          if (host) {
            void resolveLocalImages(host, filePath);
            void renderMermaidIn(host, { theme: settings.theme === 'dark' ? 'dark' : 'default', editable: true });
          }
        },
        input(value) {
          if (applyingExternalValue.current) return;
          lastEmittedValue.current = value;

          if (collapseTimerRef.current !== null) {
            window.clearTimeout(collapseTimerRef.current);
          }
          silenceCodeBlockAssist(editorRef.current);
          collapseTimerRef.current = window.setTimeout(() => {
            collapseTimerRef.current = null;
            silenceCodeBlockAssist(editorRef.current);
            collapseExpandedMarkers(editorRef.current);
            // 粘贴/插入图片后,在 IR 重渲染稳定后,把新出现的 img 解析成可加载的 URL。
            // resolveLocalImages 幂等(已转过的 img 会跳过),只动新插入的相对路径/远程图。
            const host = hostRef.current;
            if (host) {
              void resolveLocalImages(host, filePath);
              void renderMermaidIn(host, { theme: settings.theme === 'dark' ? 'dark' : 'default', editable: true });
            }
          }, IR_MARKER_COLLAPSE_DELAY_MS);

          onChange(value);
        },
        keydown() {
          if (collapseTimerRef.current !== null) {
            window.clearTimeout(collapseTimerRef.current);
          }
          silenceCodeBlockAssist(editorRef.current);
          collapseTimerRef.current = window.setTimeout(() => {
            collapseTimerRef.current = null;
            silenceCodeBlockAssist(editorRef.current);
            collapseExpandedMarkers(editorRef.current);
          }, IR_MARKER_COLLAPSE_DELAY_MS);
        },
        blur() {
          if (collapseTimerRef.current !== null) {
            window.clearTimeout(collapseTimerRef.current);
            collapseTimerRef.current = null;
          }
          collapseExpandedMarkers(editorRef.current);
        },
      });

      editorRef.current = editor;
    });

    return () => {
      cancelled = true;
      host.removeEventListener('scroll', handleScroll, { capture: true } as EventListenerOptions);
      document.removeEventListener('selectionchange', handleSelectionChange);
      if (scrollRafId !== null) window.cancelAnimationFrame(scrollRafId);
      if (collapseTimerRef.current !== null) {
        window.clearTimeout(collapseTimerRef.current);
        collapseTimerRef.current = null;
      }
      if (mermaidIdleTimerRef.current !== null) {
        window.clearTimeout(mermaidIdleTimerRef.current);
        mermaidIdleTimerRef.current = null;
      }
      if (collapseIdleTimerRef.current !== null) {
        window.clearTimeout(collapseIdleTimerRef.current);
        collapseIdleTimerRef.current = null;
      }
      editorRef.current?.destroy();
      editorRef.current = null;
    };
  }, [filePath, onChange, t]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    // 来自本编辑器自身输入的回显：跳过 setValue，保住光标
    // （修复代码块 / 行内代码编辑时光标跳回开头：Vditor IR 归一化会让 getValue() 与刚 emit 的 source 不等）
    if (source === lastEmittedValue.current) return;

    const currentValue = editor.getValue();
    if (currentValue === source) return;

    applyingExternalValue.current = true;
    editor.setValue(source, true);
    lastEmittedValue.current = source;
    window.requestAnimationFrame(() => {
      applyingExternalValue.current = false;
    });
  }, [source]);

  // 在 IR DOM 中高亮有检视意见的段落。
  // 策略：遍历 reviewComments，用 findUniqueAnchor 在 source 中定位，
  // 然后在 IR DOM 中用 TreeWalker 找到对应文本节点的祖先段落，加 data-review-mark 属性。
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const ir = getIrElement(editor);
    if (!ir) return;

    // 先清除旧标记
    ir.querySelectorAll('[data-review-mark]').forEach((el) => {
      el.removeAttribute('data-review-mark');
    });

    if (!reviewComments || reviewComments.length === 0) return;

    const currentSource = editor.getValue();
    for (const comment of reviewComments) {
      if (comment.filePath !== filePath) continue;
      const hit = findUniqueAnchor(currentSource, comment.anchor.originalText, comment.anchor.prefixHint);
      if (!hit) continue;

      // 用 TreeWalker 在 IR DOM 中找包含这段文本的段落级元素
      const walker: TreeWalker = ir.ownerDocument.createTreeWalker(ir, NodeFilter.SHOW_TEXT);
      let matched = false;
      while (walker.nextNode()) {
        const node: Node = walker.currentNode;
        if (!node.textContent?.includes(comment.anchor.originalText.slice(0, 40))) continue;
        // 找到包含原文的文本节点，向上找段落级祖先
        let el: HTMLElement | null = node.parentElement;
        while (el && el !== ir) {
          const tag = el.tagName;
          if (tag === 'P' || tag === 'LI' || tag === 'H1' || tag === 'H2' || tag === 'H3' ||
              tag === 'H4' || tag === 'H5' || tag === 'H6' || tag === 'BLOCKQUOTE' ||
              el.getAttribute('data-block') !== null) {
            el.setAttribute('data-review-mark', 'true');
            matched = true;
            break;
          }
          el = el.parentElement;
        }
        if (matched) break;
      }
    }
  }, [reviewComments, source, filePath]);

  useImperativeHandle(ref, () => ({
    focus() {
      editorRef.current?.focus();
    },
    insertText(text: string) {
      const editor = editorRef.current;
      if (!editor) return;
      editor.focus();
      editor.insertValue(text, true);
      const value = editor.getValue();
      lastEmittedValue.current = value;
      onChange(value);
    },
    getSelection() {
      const range = getSavedOrCurrentSelection();
      if (!range) return null;
      const text = range.toString();
      if (!text) return null;
      return { text, from: 0, to: text.length };
    },
    replaceSelection(text: string) {
      const editor = editorRef.current;
      if (!editor) return;
      const range = getSavedOrCurrentSelection();
      const before = editor.getValue();
      const savedRange = range ? range.cloneRange() : null;
      editor.focus();
      if (range) restoreSelectionRange(range);
      editor.insertValue(text, true);
      const after = editor.getValue();
      // push 在替换之后,带上 before+after,handler 用 after 判抢/放
      pushUndoSnapshot(before, after, savedRange);
      lastSelectionRangeRef.current = null;
      lastEmittedValue.current = after;
      onChange(after);
    },
    replaceRange(_from: number, _to: number, text: string) {
      const editor = editorRef.current;
      if (!editor) return false;
      const anchorText = lastValidatedAnchorTextRef.current;
      const prefixHint = lastValidatedPrefixHintRef.current;
      const value = editor.getValue();
      if (!anchorText) return false;
      const hit = findUniqueAnchor(value, anchorText, prefixHint);
      if (!hit) return false;
      const next = value.slice(0, hit.start) + text + value.slice(hit.start + hit.length);
      const savedRange = lastSelectionRangeRef.current?.cloneRange() ?? null;
      editor.setValue(next, true);
      pushUndoSnapshot(value, next, savedRange);
      lastSelectionRangeRef.current = null;
      lastValidatedAnchorTextRef.current = null;
      lastValidatedPrefixHintRef.current = null;
      lastEmittedValue.current = next;
      onChange(next);
      return true;
    },
    validateAnchor(anchorFilePath: string, _from: number, _to: number, originalText: string, prefixHint?: string) {
      if (!filePath || filePath !== anchorFilePath) return 'wrong-file';
      const editor = editorRef.current;
      if (!editor) return 'wrong-file';
      const value = editor.getValue();
      // findUniqueAnchor 同时校验存在性 + 唯一性（prefixHint+originalText 或纯 originalText）
      // 多处匹配时返回 null → 'stale'，前端展示「文档已变更」并提示重新选区
      const hit = findUniqueAnchor(value, originalText, prefixHint);
      if (!hit) return 'stale';
      lastValidatedAnchorTextRef.current = originalText;
      lastValidatedPrefixHintRef.current = prefixHint ?? '';
      return 'valid';
    },
    revealRange() {
      editorRef.current?.focus();
    },
    revealSearchMatch(from: number, to: number, opts?: { focus?: boolean }) {
      const editor = editorRef.current;
      if (!editor) return;
      const ir = getIrElement(editor);
      if (!ir) {
        editor.focus();
        return;
      }
      const value = editor.getValue();
      const range = findIrDomRange(value, ir, from, to);
      if (!range) {
        editor.focus();
        return;
      }
      // 抑制浮条:搜索跳转不需要浮条,先设 flag 再触发选区变化。
      suppressFloatingBarRef.current = true;
      try {
        const sel = ir.ownerDocument?.defaultView?.getSelection();
        if (sel) {
          sel.removeAllRanges();
          sel.addRange(range);
        }
      } catch { /* 选区设置失败不致命,DOM 仍然存在 */ }
      range.startContainer.parentElement?.scrollIntoView({ block: 'center', behavior: 'auto' });
      if (opts?.focus !== false) editor.focus();
      window.setTimeout(() => { suppressFloatingBarRef.current = false; }, 300);
    },
    undoLastAIReplacement() {
      const editor = editorRef.current;
      if (!editor) return false;
      const snapshot = undoStackRef.current.pop();
      if (!snapshot) return false;
      applyingExternalValue.current = true;
      editor.setValue(snapshot.before, true);
      lastEmittedValue.current = snapshot.before;
      onChange(snapshot.before);
      // 恢复选区（尽力而为;setValue 重建 DOM 后旧 Range 可能 stale）
      if (snapshot.selRange) {
        lastSelectionRangeRef.current = snapshot.selRange;
        const ir = getIrElement(editor);
        if (ir) {
          try {
            const sel = ir.ownerDocument?.defaultView?.getSelection();
            if (sel) {
              sel.removeAllRanges();
              sel.addRange(snapshot.selRange);
            }
          } catch { /* 选区恢复失败不影响内容回退 */ }
        }
      }
      window.requestAnimationFrame(() => {
        applyingExternalValue.current = false;
      });
      return true;
    },
    commitAIReplacement(content: string) {
      // P0-2:Diff Preview 应用合并结果。压栈让一次 Ctrl+Z 整体回退。
      const editor = editorRef.current;
      if (!editor) return;
      const before = editor.getValue();
      if (before === content) return;
      applyingExternalValue.current = true;
      editor.setValue(content, true);
      lastEmittedValue.current = content;
      pushUndoSnapshot(before, content, null);
      onChange(content);
      window.requestAnimationFrame(() => {
        applyingExternalValue.current = false;
      });
    },
  }), [filePath, getSavedOrCurrentSelection, onChange, pushUndoSnapshot, restoreSelectionRange]);

  return (
    <div className="wysiwyg-editor-pane" aria-label="即时渲染编辑器">
      <div
        ref={hostRef}
        className="wysiwyg-editor-host"
        onContextMenu={handleContextMenu}
        onKeyDown={handleKeyDown}
      />
      <EditorContextMenu
        open={contextMenu !== null}
        x={contextMenu?.x ?? 0}
        y={contextMenu?.y ?? 0}
        hasSelection={contextMenu?.hasSelection ?? false}
        hasMermaidSvg={Boolean(contextMenu?.mermaidTarget)}
        onPick={handleMenuPick}
        onCopyMermaidSvg={handleCopyMermaidSvg}
        onClose={handleMenuClose}
        onPickAI={onAIAction ? handleAIPick : undefined}
      />
      {onAIAction && settings.selectionFloatingBarEnabled && (
        <SelectionFloatingBar
          rect={floatingRect}
          hasSelection={floatingHasSelection}
          onPick={(action, origin) => triggerAIAction(action, origin)}
        />
      )}
    </div>
  );
});
