import {
  buildHtmlPreviewDocument,
  buildHtmlPreviewDocumentWithLocalResources,
  createFileBaseHref,
  resolveLocalResourcePath,
  type HtmlPreviewInlineOptions,
} from './htmlPreviewService';

// Issue #156 §8.3:presentation 专属的"上一页/下一页"桥脚本和命令通道,
// 仍然挂在这层。通用 HTML 文档构建/资源内联已挪到 htmlPreviewService。

export const HTML_PRESENTATION_BRIDGE_SOURCE = 'typola-html-presentation-bridge';
export const TYPOLA_PRESENTATION_BRIDGE_ID = HTML_PRESENTATION_BRIDGE_SOURCE;
export const TYPOLA_PRESENTATION_MESSAGE_TYPE = 'typola-html-presentation';

export type HtmlPresentationCommand = 'previous' | 'next';

export type HtmlPresentationBuildOptions = {
  filePath?: string;
};

export type HtmlPresentationInlineOptions = HtmlPreviewInlineOptions;

const MESSAGE_SOURCE = TYPOLA_PRESENTATION_MESSAGE_TYPE;

const BRIDGE_SCRIPT = `<script data-typola-bridge="${HTML_PRESENTATION_BRIDGE_SOURCE}">
(() => {
  const SOURCE = '${MESSAGE_SOURCE}';
  const KEY_GROUPS = {
    previous: ['ArrowLeft', 'PageUp'],
    next: ['ArrowRight', 'PageDown', ' '],
  };

  function dispatchKey(key) {
    const eventInit = {
      key,
      code: key === ' ' ? 'Space' : key,
      bubbles: true,
      cancelable: true,
      composed: true,
    };
    const target = document.activeElement && document.activeElement !== document.body
      ? document.activeElement
      : document;
    const down = new KeyboardEvent('keydown', eventInit);
    const up = new KeyboardEvent('keyup', eventInit);
    target.dispatchEvent(down);
    target.dispatchEvent(up);
    document.dispatchEvent(new KeyboardEvent('keydown', eventInit));
    document.dispatchEvent(new KeyboardEvent('keyup', eventInit));
    document.body?.dispatchEvent(new KeyboardEvent('keydown', eventInit));
    document.body?.dispatchEvent(new KeyboardEvent('keyup', eventInit));
    window.dispatchEvent(new KeyboardEvent('keydown', eventInit));
    window.dispatchEvent(new KeyboardEvent('keyup', eventInit));
  }

  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || data.source !== SOURCE) return;
    const keys = KEY_GROUPS[data.command];
    if (!keys) return;
    keys.forEach(dispatchKey);
  });
})();
</script>`;

function injectBridgeScript(html: string): string {
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${BRIDGE_SCRIPT}\n</body>`);
  }

  if (/<\/html>/i.test(html)) {
    return html.replace(/<\/html>/i, `${BRIDGE_SCRIPT}\n</html>`);
  }

  return `${html}\n${BRIDGE_SCRIPT}`;
}

export { createFileBaseHref, resolveLocalResourcePath };

export function buildHtmlPresentationSrcDoc(source: string, filePath?: string): string {
  return injectBridgeScript(buildHtmlPreviewDocument(source, { filePath }));
}

export function createHtmlPresentationDocument(
  source: string,
  options: HtmlPresentationBuildOptions = {},
): string {
  return buildHtmlPresentationSrcDoc(source, options.filePath);
}

export async function createHtmlPresentationDocumentWithLocalResources(
  source: string,
  options: HtmlPresentationInlineOptions,
): Promise<string> {
  const inlinedSource = await buildHtmlPreviewDocumentWithLocalResources(source, options);
  return injectBridgeScript(inlinedSource);
}

export function postHtmlPresentationCommand(
  iframe: HTMLIFrameElement | null,
  command: HtmlPresentationCommand,
): void {
  iframe?.contentWindow?.postMessage({ source: MESSAGE_SOURCE, command }, '*');
}
