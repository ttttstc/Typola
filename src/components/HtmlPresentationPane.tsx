import { Code, ExternalLink, Eye } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSettings } from '../hooks/useSettings';
import { translate } from '../services/i18n';
import {
  buildHtmlPresentationSrcDoc,
  createHtmlPresentationDocumentWithLocalResources,
} from '../services/htmlPresentationService';

export type HtmlPresentationMode = 'preview' | 'source';

type HtmlPresentationPaneProps = {
  source: string;
  filePath?: string;
  initialMode?: HtmlPresentationMode;
  onOpenInBrowser?: () => void;
};

const EMPTY_PRESENTATION_DOCUMENT = '<!doctype html><html><head></head><body></body></html>';

function focusPresentationFrame(iframe: HTMLIFrameElement) {
  iframe.focus();
  if (!navigator.userAgent.includes('jsdom')) {
    iframe.contentWindow?.focus();
  }
}

export function HtmlPresentationPane({ source, filePath, initialMode, onOpenInBrowser }: HtmlPresentationPaneProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const settings = useSettings();
  const t = (key: Parameters<typeof translate>[1]) => translate(settings.locale, key);
  const [mode, setMode] = useState<HtmlPresentationMode>(initialMode ?? 'preview');
  const srcDoc = useMemo(
    () => buildHtmlPresentationSrcDoc(source, filePath),
    [filePath, source],
  );
  const shouldInlineLocalResources = Boolean(filePath && '__TAURI_INTERNALS__' in window);
  const srcDocKey = `${filePath ?? ''}\x00${source}`;
  const [inlinedSrcDoc, setInlinedSrcDoc] = useState<{ key: string; doc: string } | null>(null);
  const effectiveSrcDoc = shouldInlineLocalResources && inlinedSrcDoc?.key !== srcDocKey
    ? EMPTY_PRESENTATION_DOCUMENT
    : inlinedSrcDoc?.doc ?? srcDoc;

  useEffect(() => {
    if (!filePath || !shouldInlineLocalResources) return;

    let cancelled = false;
    void import('@tauri-apps/plugin-fs')
      .then(({ readFile }) => createHtmlPresentationDocumentWithLocalResources(source, {
        filePath,
        readFile,
      }))
      .then((doc) => {
        if (!cancelled) setInlinedSrcDoc({ key: srcDocKey, doc });
      })
      .catch((error) => {
        console.warn('Failed to inline HTML presentation resources:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [filePath, shouldInlineLocalResources, source, srcDocKey]);

  useEffect(() => {
    if (mode !== 'preview') return;
    const iframe = iframeRef.current;
    if (!iframe) return;

    const focusFrame = () => {
      focusPresentationFrame(iframe);
    };

    const timeout = window.setTimeout(focusFrame, 0);
    iframe.addEventListener('load', focusFrame);

    return () => {
      window.clearTimeout(timeout);
      iframe.removeEventListener('load', focusFrame);
    };
  }, [effectiveSrcDoc, mode]);

  const isPreview = mode === 'preview';

  return (
    <div className="html-presentation-pane" aria-label={t('htmlPresentationAria')}>
      <div className="html-presentation-toolbar">
        <div className="html-presentation-heading">
          <span>{isPreview ? t('htmlPresentationTitle') : 'HTML 源码'}</span>
          <small>{isPreview ? t('htmlPresentationDesc') : '当前 HTML 文件的原始文本(只读)'}</small>
        </div>
        <div className="html-presentation-actions">
          <div
            className="html-presentation-mode-toggle"
            role="tablist"
            aria-label="源码 / 预览切换"
          >
            <button
              type="button"
              role="tab"
              aria-selected={isPreview}
              className={isPreview ? 'active' : ''}
              onClick={() => setMode('preview')}
            >
              <Eye size={13} />
              预览
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={!isPreview}
              className={!isPreview ? 'active' : ''}
              onClick={() => setMode('source')}
            >
              <Code size={13} />
              源码
            </button>
          </div>
          <button
            type="button"
            className="settings-action-button"
            aria-label="在浏览器打开"
            onClick={onOpenInBrowser}
            disabled={!filePath || !onOpenInBrowser}
          >
            <ExternalLink size={13} />
            浏览器
          </button>
        </div>
      </div>
      {isPreview ? (
        <iframe
          ref={iframeRef}
          className="html-presentation-frame"
          title={t('htmlPresentationFrameTitle')}
          sandbox="allow-scripts allow-forms allow-modals allow-pointer-lock allow-popups allow-presentation"
          srcDoc={effectiveSrcDoc}
        />
      ) : (
        <pre className="html-presentation-source" aria-label="HTML 源码">
          <code>{source}</code>
        </pre>
      )}
    </div>
  );
}
