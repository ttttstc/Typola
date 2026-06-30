import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import '@atomic-editor/editor/styles.css';
import 'katex/dist/katex.min.css';
import { EditorPane, type SourceHeadingScrollRequest } from '../../EditorPane';
import type { SelectionActionId } from '../../../services/agent/selectionActions';
import type { SelectionAnchor } from '../../../services/agent/types';
import type { EditorCoreHandle } from '../../../types/editorCore';
import { useSettings } from '../../../hooks/useSettings';
import { updateSettings } from '../../../services/settingsService';
import { createLivePreviewExtensions } from './createLivePreviewExtensions';
import type { PreviewHeadingChange } from './previewSyncExtension';
import type { FoldKey } from '../../../services/headingFoldService';

type Cm6MarkdownEditorPaneProps = {
  source: string;
  onChange: (value: string) => void;
  headingScrollRequest?: SourceHeadingScrollRequest;
  onScrollRatio?: (ratio: number) => void;
  filePath?: string;
  onAIAction?: (action: SelectionActionId, anchor: SelectionAnchor, origin?: { x: number; y: number }) => void;
  onPreviewHeadingChange?: (change: PreviewHeadingChange) => void;
  /** 折叠集合 — 由调用方(AppLayout)持有,以支持"搜索命中自动展开"等命令式扩展。
   *  若不传,组件内部用 useState 自管,行为与之前保持一致。 */
  foldedHeadings?: ReadonlySet<FoldKey>;
  onFoldChange?: (next: ReadonlySet<FoldKey>) => void;
};

/** 以 atomic-editor 默认 14px 为 100% 参考,滚轮缩放比例都换算到这个基准。 */
const ZOOM_BASE_PX = 14;
const ZOOM_INDICATOR_HIDE_MS = 1400;

function zoomPercent(size: number): number {
  return Math.round((size / ZOOM_BASE_PX) * 100);
}

/**
 * Phase 1 CM6 编辑器内核候选入口。
 *
 * 当前先复用源码模式里已经跑通的 CM6 EditorPane，确保保存、选区、AI anchor、
 * 搜索 reveal、撤销等命令契约不变。Phase 2 再在这里替换为 Typora-like live preview
 * extension 组合。
 */
export const Cm6MarkdownEditorPane = forwardRef<EditorCoreHandle, Cm6MarkdownEditorPaneProps>(
  function Cm6MarkdownEditorPane(props, ref) {
    const { onPreviewHeadingChange, foldedHeadings: foldedHeadingsProp, onFoldChange, ...rest } = props;
    const settings = useSettings();
    const [zoomIndicator, setZoomIndicator] = useState<{ percent: number; restored: boolean } | null>(null);
    const [internalFoldedHeadings, setInternalFoldedHeadings] = useState<ReadonlySet<FoldKey>>(() => new Set());
    const foldedHeadings = foldedHeadingsProp ?? internalFoldedHeadings;
    const hideTimerRef = useRef<number | null>(null);
    const editorRef = useRef<EditorCoreHandle | null>(null);

    const handleFoldChange = useCallback((next: ReadonlySet<FoldKey>) => {
      if (onFoldChange) {
        onFoldChange(next);
      } else {
        setInternalFoldedHeadings(next);
      }
    }, [onFoldChange]);

    const showZoomIndicator = useCallback((percent: number) => {
      setZoomIndicator({ percent, restored: percent === 100 });
      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current);
      }
      hideTimerRef.current = window.setTimeout(() => {
        setZoomIndicator(null);
        hideTimerRef.current = null;
      }, ZOOM_INDICATOR_HIDE_MS);
    }, []);

    const handleZoomChange = useCallback((size: number) => {
      // 滚轮缩放后同步到 settings,设置面板里的 editorFontSize 立即反映。
      updateSettings({ editorFontSize: size });
      showZoomIndicator(zoomPercent(size));
    }, [showZoomIndicator]);

    const handleZoomIndicatorClick = useCallback(() => {
      const editor = editorRef.current;
      if (!editor) return;
      // 走 EditorCoreHandle.setZoom 触发 wheelZoomExtension 的 reconfigure,
      // 避免 React 重挂载 / StateField 不同步。
      editor.setZoom(ZOOM_BASE_PX);
      updateSettings({ editorFontSize: ZOOM_BASE_PX });
      showZoomIndicator(100);
    }, [showZoomIndicator]);

    // React state → editor:外部代码(未来 settings 持久化等)改 foldedHeadings
    // 时推送到 editor。当前唯一触发场景是 onFoldChange 同步过来的值。
    useEffect(() => {
      editorRef.current?.setFoldedHeadings?.(foldedHeadings);
    }, [foldedHeadings]);

    useEffect(() => () => {
      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current);
      }
    }, []);

    // headingFoldExtension 始终传空 initial 集合 — React → editor 的同步走
    // editorRef.current?.setFoldedHeadings?.(...) 命令式推送(见上面的 useEffect),
    // 这样 livePreviewExtensions 不依赖 foldedHeadings,折叠切换不再触发整组扩展重建。
    const livePreviewExtensions = useMemo(
      () => createLivePreviewExtensions({
        baseSize: settings.editorFontSize,
        onZoomChange: handleZoomChange,
        onPreviewHeadingChange,
        onFoldChange: handleFoldChange,
      }),
      [settings.editorFontSize, handleZoomChange, onPreviewHeadingChange, handleFoldChange],
    );
    return (
      <div className="cm6-markdown-editor-pane">
        <EditorPane
          ref={(instance) => {
            // 同时支持外部 ref + 内部 editorRef(点击重置需要)
            if (typeof ref === 'function') ref(instance);
            else if (ref) ref.current = instance;
            editorRef.current = instance;
          }}
          {...rest}
          extraExtensions={livePreviewExtensions}
        />
        {zoomIndicator && (
          <button
            type="button"
            className={`cm6-zoom-indicator${zoomIndicator.restored ? ' is-restored' : ''}`}
            onClick={handleZoomIndicatorClick}
            title={zoomIndicator.restored ? '已恢复 100% — 点击再次确认' : '点击恢复 100%'}
            aria-label="缩放比例提示,点击恢复 100%"
          >
            <span className="cm6-zoom-indicator-dot" aria-hidden="true" />
            {zoomIndicator.restored
              ? '缩放已恢复到 100%'
              : `当前缩放 ${zoomIndicator.percent}%`}
            {!zoomIndicator.restored && (
              <span className="cm6-zoom-indicator-hint" aria-hidden="true">点击恢复</span>
            )}
          </button>
        )}
      </div>
    );
  },
);