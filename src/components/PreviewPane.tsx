import { forwardRef, useDeferredValue, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import '../styles/preview.css';
import type { TocItem } from '../types/document';
import type { PreviewScrollHandle } from '../types/previewScroll';
import { useSettings } from '../hooks/useSettings';
import { detectMarkdownRenderFeatures } from '../services/markdownFeatureDetector';
import { resolvePreviewFontFamily, resolvePreviewHeadingFontFamily, resolvePreviewChineseFontFamily, resolvePreviewLatinFontFamily } from '../services/settingsService';
import { VDITOR_PREVIEW_I18N } from '../services/vditorPreviewConfig';
import { createHtmlReadingPreviewHtml } from '../services/htmlReadingPreviewService';
import { resolveLocalImages } from '../services/localImageResolver';
import { renderMermaidIn } from '../services/mermaidRenderer';
import { getMermaidTheme, getVditorHighlightStyle, getVditorPreviewTheme } from '../services/themeRegistry';

type PreviewPaneProps = {
  source: string;
  tocIds: TocItem[];
  wideTables?: boolean;
  renderMode?: 'markdown' | 'html';
  filePath?: string;
  onScrollRatio?: (ratio: number) => void;
  onPreviewHeadingScroll?: (change: { index: number; withinRatio: number }) => void;
};

export const PreviewPane = forwardRef<PreviewScrollHandle, PreviewPaneProps>(function PreviewPane(
  { source, tocIds, wideTables = false, renderMode = 'markdown', filePath, onScrollRatio, onPreviewHeadingScroll },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const deferredSource = useDeferredValue(source);
  const deferredTocIds = useDeferredValue(tocIds);
  const settings = useSettings();
  const mermaidTheme = getMermaidTheme(settings.themeId);
  const vditorTheme = getVditorPreviewTheme(settings.themeId);
  const vditorHighlightStyle = getVditorHighlightStyle(settings.themeId);
  const renderFeatures = useMemo(
    () => detectMarkdownRenderFeatures(deferredSource),
    [deferredSource],
  );
  const previewFontFamily = resolvePreviewFontFamily(settings);
  const previewHeadingFontFamily = resolvePreviewHeadingFontFamily(settings);
  const previewChineseFontFamily = resolvePreviewChineseFontFamily(settings);
  const previewLatinFontFamily = resolvePreviewLatinFontFamily(settings);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    if (deferredSource.trim() === '') {
      el.replaceChildren();
      return;
    }

    if (renderMode === 'html') {
      el.innerHTML = createHtmlReadingPreviewHtml(deferredSource);
      void resolveLocalImages(el, filePath);
      void renderMermaidIn(el, { theme: mermaidTheme });
      applyTocIds(el, deferredTocIds);
      return;
    }

    let cancelled = false;
    void Promise.all([
      import('vditor/dist/index.css'),
      import('vditor'),
    ]).then(([, { default: Vditor }]) => {
      if (cancelled) return;
      Vditor.preview(el, deferredSource, {
        mode: vditorTheme,
        anchor: 0,
        cdn: '/vditor',
        i18n: VDITOR_PREVIEW_I18N,
        icon: undefined,
        theme: {
          current: vditorTheme,
          path: '',
        },
        hljs: {
          style: vditorHighlightStyle,
          enable: renderFeatures.hasHighlightableCode,
          lineNumber: false,
        },
        markdown: {
          sanitize: true,
        },
        after() {
          if (cancelled) return;
          void (async () => {
            await renderMermaidIn(el, { theme: mermaidTheme });
            await resolveLocalImages(el, filePath);
            if (deferredTocIds.length > 0) applyTocIds(el, deferredTocIds);
          })();
        },
      });
    });

    return () => {
      cancelled = true;
    };
  }, [
    deferredSource,
    deferredTocIds,
    filePath,
    renderFeatures.hasHighlightableCode,
    mermaidTheme,
    renderMode,
    vditorHighlightStyle,
    vditorTheme,
  ]);

  useImperativeHandle(ref, () => {
    const findScroller = (): HTMLElement | null => {
      const el = containerRef.current;
      if (!el) return null;
      return (el.closest('.preview-shell') as HTMLElement | null) ?? el;
    };
    return {
      scrollToRatio(ratio: number) {
        const scroller = findScroller();
        if (!scroller) return;
        const max = scroller.scrollHeight - scroller.clientHeight;
        if (max <= 0) return;
        scroller.scrollTop = Math.max(0, Math.min(max, ratio * max));
      },
      scrollToHeading(headingIndex: number, withinRatio: number) {
        const scroller = findScroller();
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
    };
  }, []);

  useEffect(() => {
    if (!onScrollRatio && !onPreviewHeadingScroll) return;
    const scroller = containerRef.current?.closest('.preview-shell') as HTMLElement | null;
    if (!scroller) return;
    let rafId: number | null = null;
    const handle = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        const max = scroller.scrollHeight - scroller.clientHeight;
        const ratio = max > 0 ? scroller.scrollTop / max : 0;
        onScrollRatio?.(ratio);
        if (onPreviewHeadingScroll) {
          // 用 heading 元素 offsetTop 二分找当前可见 heading
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
        }
      });
    };
    scroller.addEventListener('scroll', handle, { passive: true });
    return () => {
      scroller.removeEventListener('scroll', handle);
      if (rafId !== null) window.cancelAnimationFrame(rafId);
    };
  }, [onScrollRatio, onPreviewHeadingScroll]);

  return (
    <div
      className={`preview-shell ${wideTables ? 'html-preview-pane' : ''}`}
      aria-label={wideTables ? 'HTML 阅读预览' : 'Markdown 阅读预览'}
      style={{
        '--preview-font-size': `${settings.previewFontSize}px`,
        '--preview-line-height': `${settings.previewLineHeight}`,
        '--preview-width': `${settings.previewWidth}px`,
        '--preview-font-family': previewFontFamily,
        '--preview-heading-font-family': previewHeadingFontFamily,
        '--preview-chinese-font-family': previewChineseFontFamily,
        '--preview-latin-font-family': previewLatinFontFamily,
      } as React.CSSProperties}
    >
      <div
        ref={containerRef}
        className={`vditor-reset preview-content ${wideTables ? 'html-table-preview-content' : ''}`}
      />
    </div>
  );
});

function applyTocIds(root: ParentNode, tocIds: TocItem[]): void {
  if (tocIds.length === 0) return;

  const headings = root.querySelectorAll('h1, h2, h3, h4, h5, h6');
  headings.forEach((heading, index) => {
    const tocItem = tocIds[index];
    if (tocItem) {
      heading.id = tocItem.id;
    }
  });
}
