import { useEffect, useMemo, useRef, useState } from 'react';
import { useSettings } from '../hooks/useSettings';
import { translate } from '../services/i18n';
import {
  buildHtmlPresentationSrcDoc,
  createHtmlPresentationDocumentWithLocalResources,
  postHtmlPresentationCommand,
  type HtmlPresentationCommand,
} from '../services/htmlPresentationService';

type HtmlPresentationPaneProps = {
  source: string;
  filePath?: string;
  onBack: () => void;
};

const EMPTY_PRESENTATION_DOCUMENT = '<!doctype html><html><head></head><body></body></html>';

function focusPresentationFrame(iframe: HTMLIFrameElement) {
  iframe.focus();
  if (!navigator.userAgent.includes('jsdom')) {
    iframe.contentWindow?.focus();
  }
}

export function HtmlPresentationPane({ source, filePath, onBack }: HtmlPresentationPaneProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const settings = useSettings();
  const t = (key: Parameters<typeof translate>[1]) => translate(settings.locale, key);
  const srcDoc = useMemo(
    () => buildHtmlPresentationSrcDoc(source, filePath),
    [filePath, source],
  );
  const shouldInlineLocalResources = Boolean(filePath && '__TAURI_INTERNALS__' in window);
  const srcDocKey = `${filePath ?? ''}\u0000${source}`;
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
  }, [effectiveSrcDoc]);

  const handleCommand = (command: HtmlPresentationCommand) => {
    postHtmlPresentationCommand(iframeRef.current, command);
    if (iframeRef.current) {
      focusPresentationFrame(iframeRef.current);
    }
  };

  return (
    <div className="html-presentation-pane" aria-label={t('htmlPresentationAria')}>
      <div className="html-presentation-toolbar">
        <div className="html-presentation-heading">
          <span>{t('htmlPresentationTitle')}</span>
          <small>{t('htmlPresentationDesc')}</small>
        </div>
        <div className="html-presentation-actions">
          <button
            type="button"
            className="settings-action-button"
            aria-label={t('htmlPresentationPreviousLabel')}
            onClick={() => handleCommand('previous')}
          >
            {t('htmlPresentationPreviousLabel')}
          </button>
          <button
            type="button"
            className="settings-action-button"
            aria-label={t('htmlPresentationNextLabel')}
            onClick={() => handleCommand('next')}
          >
            {t('htmlPresentationNextLabel')}
          </button>
          <button
            type="button"
            className="settings-action-button"
            aria-label={t('htmlPresentationBackLabel')}
            onClick={onBack}
          >
            {t('htmlPresentationBackLabel')}
          </button>
        </div>
      </div>
      <iframe
        ref={iframeRef}
        className="html-presentation-frame"
        title={t('htmlPresentationFrameTitle')}
        sandbox="allow-scripts allow-forms allow-modals allow-pointer-lock allow-popups allow-presentation"
        srcDoc={effectiveSrcDoc}
      />
    </div>
  );
}
