import { forwardRef, useCallback, useDeferredValue, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { PreviewScrollHandle } from '../types/previewScroll';
import { ClipboardCopy, FileOutput, X } from 'lucide-react';
import { useSettings } from '../hooks/useSettings';
import { translate } from '../services/i18n';
import {
  listEnabledHtmlExportPresets,
  setHtmlExportPreset,
} from '../services/settingsService';
import {
  copyWechatPreviewToClipboard,
  createHtmlExportArticleStyles,
  createHtmlExportResult,
  exportHtmlDocument,
  type WechatPreviewResult,
} from '../services/wechatPreviewService';
import { getHtmlExportPresetDefinition } from '../services/htmlExportPresets';
import type { HtmlExportPresetId } from '../services/htmlExportPresets';
import { markdownToExportHtml } from '../services/markdownExportRenderer';
import { getMermaidTheme } from '../services/themeRegistry';

type WechatPreviewPaneProps = {
  source: string;
  fileName?: string;
  onClose: () => void;
  filePath?: string;
  onPreviewHeadingScroll?: (change: { index: number; withinRatio: number }) => void;
};

type ActionStatus = {
  target: 'copy' | 'export';
  tone: 'ok' | 'error' | 'muted';
  text: string;
};

export const WechatPreviewPane = forwardRef<PreviewScrollHandle, WechatPreviewPaneProps>(function WechatPreviewPane(
  { source, fileName = 'document.md', onClose, filePath, onPreviewHeadingScroll },
  ref,
) {
  const settings = useSettings();
  const mermaidTheme = getMermaidTheme(settings.themeId);
  const t = (key: Parameters<typeof translate>[1]) => translate(settings.locale, key);
  const deferredSource = useDeferredValue(source);
  const renderRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    scrollToRatio(ratio: number) {
      const scroller = scrollRef.current;
      if (!scroller) return;
      const max = scroller.scrollHeight - scroller.clientHeight;
      if (max <= 0) return;
      scroller.scrollTop = Math.max(0, Math.min(max, ratio * max));
    },
    scrollToHeading(headingIndex: number, withinRatio: number) {
      const scroller = scrollRef.current;
      if (!scroller) return;
      const headings = scroller.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6');
      const target = headings[headingIndex];
      if (!target) return;
      const offset = target.offsetTop;
      const nextSection = headings[headingIndex + 1];
      const sectionHeight = nextSection ? nextSection.offsetTop - offset : Math.max(0, scroller.scrollHeight - offset);
      const within = Math.max(0, Math.min(1, withinRatio));
      scroller.scrollTop = Math.max(0, offset + sectionHeight * within - 8);
    },
  }), []);
  const renderIdRef = useRef(0);
  const [previewResult, setPreviewResult] = useState<WechatPreviewResult | null>(null);
  const [actionStatus, setActionStatus] = useState<ActionStatus | null>(null);
  const [status, setStatus] = useState<'empty' | 'loading' | 'ready' | 'error'>(
    source.trim() ? 'loading' : 'empty',
  );
  const htmlExportPreset = useMemo(
    () => getHtmlExportPresetDefinition(settings.htmlExportPresetId, settings.customHtmlExportPresets),
    [settings.customHtmlExportPresets, settings.htmlExportPresetId],
  );
  const enabledHtmlExportPresets = useMemo(
    () => listEnabledHtmlExportPresets(settings),
    [settings],
  );
  const sourceIsEmpty = deferredSource.trim() === '';
  const handlePreviewScroll = useCallback(() => {
    if (!onPreviewHeadingScroll) return;
    const scroller = scrollRef.current;
    if (!scroller) return;
    const headings = scroller.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6');
    if (headings.length === 0) {
      onPreviewHeadingScroll({ index: -1, withinRatio: 0 });
      return;
    }
    const scrollTop = scroller.scrollTop;
    let lo = 0;
    let hi = headings.length - 1;
    let idx = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (headings[mid].offsetTop <= scrollTop) {
        idx = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (idx < 0) {
      onPreviewHeadingScroll({ index: -1, withinRatio: 0 });
      return;
    }
    const start = headings[idx].offsetTop;
    const end = idx + 1 < headings.length ? headings[idx + 1].offsetTop : scroller.scrollHeight;
    const sectionHeight = Math.max(1, end - start);
    const within = (scrollTop - start) / sectionHeight;
    onPreviewHeadingScroll({ index: idx, withinRatio: Math.max(0, Math.min(1, within)) });
  }, [onPreviewHeadingScroll]);

  useEffect(() => {
    if (!onPreviewHeadingScroll) return;
    const scroller = scrollRef.current;
    if (!scroller) return;
    let rafId: number | null = null;
    const handle = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        handlePreviewScroll();
      });
    };
    scroller.addEventListener('scroll', handle, { passive: true });
    return () => {
      scroller.removeEventListener('scroll', handle);
      if (rafId !== null) window.cancelAnimationFrame(rafId);
    };
  }, [onPreviewHeadingScroll, handlePreviewScroll]);

  useEffect(() => {
    const el = renderRef.current;
    if (!el) return;

    const renderId = renderIdRef.current + 1;
    renderIdRef.current = renderId;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled || renderIdRef.current !== renderId) return;
      setPreviewResult(null);
      setActionStatus(null);
      if (!sourceIsEmpty) setStatus('loading');
    });

    if (sourceIsEmpty) {
      el.replaceChildren();
      return () => {
        cancelled = true;
      };
    }

    void markdownToExportHtml(deferredSource, {
      target: el,
      filePath,
      theme: 'light',
      mermaidTheme,
    }).then((renderedHtml) => {
      if (cancelled || renderIdRef.current !== renderId) return;
      setPreviewResult(createHtmlExportResult(deferredSource, renderedHtml, {
        preset: htmlExportPreset,
        title: fileName,
      }));
      setStatus('ready');
    }).catch((error) => {
      if (cancelled || renderIdRef.current !== renderId) return;
      console.warn('Failed to render HTML export preview:', error);
      el.replaceChildren();
      setPreviewResult(null);
      setStatus('error');
    });

    return () => {
      cancelled = true;
    };
  }, [deferredSource, fileName, filePath, htmlExportPreset, mermaidTheme, sourceIsEmpty]);

  const effectiveStatus = sourceIsEmpty ? 'empty' : status;
  const effectiveActionStatus = sourceIsEmpty ? null : actionStatus;
  const canUsePreviewResult = effectiveStatus === 'ready' && previewResult !== null;

  const handleCopy = async () => {
    if (!previewResult) return;

    try {
      const result = await copyWechatPreviewToClipboard(previewResult);
      setActionStatus({
        target: 'copy',
        tone: 'ok',
        text: result === 'html'
          ? t('wechatPreviewCopySuccess')
          : t('wechatPreviewCopyPlainSuccess'),
      });
    } catch (error) {
      console.warn('Failed to copy WeChat preview:', error);
      setActionStatus({ target: 'copy', tone: 'error', text: t('wechatPreviewCopyError') });
    }
  };

  const handleExport = async () => {
    if (!previewResult) return;

    try {
      const result = await exportHtmlDocument(previewResult.clipboardHtml, fileName);
      setActionStatus({
        target: 'export',
        tone: result === 'cancelled' ? 'muted' : 'ok',
        text: result === 'cancelled'
          ? t('wechatPreviewExportCancelled')
          : t('wechatPreviewExportSuccess'),
      });
    } catch (error) {
      console.warn('Failed to export HTML:', error);
      setActionStatus({ target: 'export', tone: 'error', text: t('wechatPreviewExportError') });
    }
  };

  const handlePresetChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setHtmlExportPreset(event.target.value as HtmlExportPresetId);
  };

  const warnings = sourceIsEmpty ? [] : previewResult?.warnings ?? [];
  const statusText = effectiveActionStatus?.text ?? (warnings.length > 0
    ? t('wechatPreviewWarningStatus')
    : effectiveStatus === 'ready'
      ? t('wechatPreviewReady')
      : effectiveStatus === 'loading'
        ? t('wechatPreviewLoading')
        : effectiveStatus === 'error'
          ? t('wechatPreviewError')
          : t('wechatPreviewEmpty'));

  return (
    <aside className="wechat-preview-panel" aria-label={t('wechatPreviewAria')}>
      <style>{createHtmlExportArticleStyles(htmlExportPreset)}</style>
      <div className="wechat-preview-header">
        <div className="wechat-preview-heading">
          <div className="wechat-preview-title-row">
            <h2>{t('wechatPreviewTitle')}</h2>
            <select
              className="wechat-preview-preset-select"
              aria-label="HTML 导出预设"
              value={settings.htmlExportPresetId}
              onChange={handlePresetChange}
            >
              {enabledHtmlExportPresets.map((preset) => (
                <option key={preset.id} value={preset.id}>{preset.name}</option>
              ))}
            </select>
          </div>
          <p aria-live="polite">{statusText}</p>
        </div>
        <div className="wechat-preview-actions">
          <button
            type="button"
            className={`wechat-preview-action ${effectiveActionStatus?.target === 'copy' ? effectiveActionStatus.tone : ''}`}
            disabled={!canUsePreviewResult}
            onClick={() => void handleCopy()}
            title={canUsePreviewResult ? t('wechatPreviewCopyReady') : t('wechatPreviewCopyDisabled')}
            aria-label={t('wechatPreviewCopyLabel')}
          >
            <ClipboardCopy size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`wechat-preview-action ${effectiveActionStatus?.target === 'export' ? effectiveActionStatus.tone : ''}`}
            disabled={!canUsePreviewResult}
            onClick={() => void handleExport()}
            title={canUsePreviewResult ? t('wechatPreviewExportReady') : t('wechatPreviewExportDisabled')}
            aria-label={t('wechatPreviewExportLabel')}
          >
            <FileOutput size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="wechat-preview-close-button"
            onClick={onClose}
            title={t('closePreviewTitle')}
            aria-label={t('closePreviewLabel')}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
      {warnings.length > 0 && (
        <div className="wechat-preview-warnings" role="status">
          <span>{t('wechatPreviewWarningTitle')}</span>
          <ul>
            {warnings.map((warning) => (
              <li key={`${warning.type}-${warning.src}`}>{warning.message}</li>
            ))}
          </ul>
        </div>
      )}
      <div ref={scrollRef} className="wechat-preview-scroll">
        {effectiveStatus === 'empty' ? (
          <div className="wechat-preview-empty">{t('wechatPreviewEmpty')}</div>
        ) : effectiveStatus === 'loading' && !previewResult ? (
          <div className="wechat-preview-loading">{t('wechatPreviewLoading')}</div>
        ) : effectiveStatus === 'error' ? (
          <div className="wechat-preview-empty">{t('wechatPreviewError')}</div>
        ) : (
          <div
            className="wechat-preview-article-shell"
            dangerouslySetInnerHTML={{ __html: previewResult?.previewHtml ?? '' }}
          />
        )}
      </div>
      <div ref={renderRef} className="wechat-preview-render-source" aria-hidden="true" />
    </aside>
  );
});
