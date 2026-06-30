import { detectMarkdownRenderFeatures } from './markdownFeatureDetector';
import { resolveLocalImages } from './localImageResolver';
import { renderMermaidIn } from './mermaidRenderer';
import { VDITOR_PREVIEW_I18N } from './vditorPreviewConfig';

export type MarkdownExportTheme = 'light' | 'dark';

export type MarkdownToExportHtmlOptions = {
  target?: HTMLDivElement;
  filePath?: string;
  theme?: MarkdownExportTheme;
  mermaidTheme?: 'default' | 'dark';
};

function createHiddenRenderTarget(): { target: HTMLDivElement; cleanup: () => void } {
  const host = document.createElement('section');
  host.setAttribute('aria-hidden', 'true');
  Object.assign(host.style, {
    position: 'fixed',
    top: '0',
    left: '-100000px',
    width: '794px',
    minHeight: '1123px',
    opacity: '0',
    pointerEvents: 'none',
    overflow: 'hidden',
    zIndex: '-1',
  });

  const target = document.createElement('div');
  target.className = 'vditor-reset preview-content';
  host.append(target);
  document.body.append(host);

  return {
    target,
    cleanup: () => host.remove(),
  };
}

/**
 * Render Markdown source into export-ready HTML.
 *
 * This is the Phase 4 bridge: preview/export paths consume Markdown source
 * instead of reading from editor DOM, so Vditor and CM6 can share the same
 * downstream export pipeline during the migration.
 */
export async function markdownToExportHtml(
  source: string,
  options: MarkdownToExportHtmlOptions = {},
): Promise<string> {
  const owned = options.target ? null : createHiddenRenderTarget();
  const target = options.target ?? owned?.target;
  if (!target) return '';

  try {
    target.classList.add('vditor-reset', 'preview-content');
    target.replaceChildren();
    if (!source.trim()) return '';

    const [{ default: Vditor }] = await Promise.all([
      import('vditor/dist/index.css'),
      import('vditor'),
    ]).then(([, vditor]) => [vditor] as const);
    const renderFeatures = detectMarkdownRenderFeatures(source);
    const theme = options.theme ?? 'light';

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };

      try {
        const result = Vditor.preview(target, source, {
          mode: theme,
          anchor: 0,
          cdn: '/vditor',
          i18n: VDITOR_PREVIEW_I18N,
          icon: undefined,
          theme: {
            current: theme,
            path: '',
          },
          hljs: {
            style: theme === 'dark' ? 'github-dark' : 'github',
            enable: renderFeatures.hasHighlightableCode,
            lineNumber: false,
          },
          markdown: {
            sanitize: true,
          },
          after() {
            void (async () => {
              await renderMermaidIn(target, {
                theme: options.mermaidTheme ?? (theme === 'dark' ? 'dark' : 'default'),
              });
              await resolveLocalImages(target, options.filePath);
              finish();
            })().catch(reject);
          },
        });

        Promise.resolve(result).then(() => {
          window.setTimeout(finish, 5200);
        }, reject);
      } catch (error) {
        reject(error);
      }
    });

    return target.innerHTML;
  } finally {
    owned?.cleanup();
  }
}
