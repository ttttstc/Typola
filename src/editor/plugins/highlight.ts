import type { HighlighterCore } from 'shiki/core';
import i18n from '../../i18n';

let highlighter: HighlighterCore | null = null;
let highlighterPromise: Promise<HighlighterCore> | null = null;

// Static list — must match the dynamic-import switch below. Adding a lang means
// adding both the entry here AND a case in `loadLang`, so Rollup can statically
// resolve each chunk.
const SUPPORTED_LANGS = [
  'javascript',
  'typescript',
  'python',
  'bash',
  'json',
  'markdown',
  'rust',
  'go',
  'java',
  'css',
  'html',
  'sql',
] as const;

type SupportedLang = (typeof SUPPORTED_LANGS)[number];

async function loadLang(lang: SupportedLang) {
  switch (lang) {
    case 'javascript':
      return (await import('@shikijs/langs/javascript')).default;
    case 'typescript':
      return (await import('@shikijs/langs/typescript')).default;
    case 'python':
      return (await import('@shikijs/langs/python')).default;
    case 'bash':
      return (await import('@shikijs/langs/bash')).default;
    case 'json':
      return (await import('@shikijs/langs/json')).default;
    case 'markdown':
      return (await import('@shikijs/langs/markdown')).default;
    case 'rust':
      return (await import('@shikijs/langs/rust')).default;
    case 'go':
      return (await import('@shikijs/langs/go')).default;
    case 'java':
      return (await import('@shikijs/langs/java')).default;
    case 'css':
      return (await import('@shikijs/langs/css')).default;
    case 'html':
      return (await import('@shikijs/langs/html')).default;
    case 'sql':
      return (await import('@shikijs/langs/sql')).default;
  }
}

async function createHighlighterInstance(): Promise<HighlighterCore> {
  const [{ createHighlighterCore }, { createOnigurumaEngine }, light, dark, ...langs] = await Promise.all([
    import('shiki/core'),
    import('shiki/engine/oniguruma'),
    import('@shikijs/themes/github-light').then((m) => m.default),
    import('@shikijs/themes/github-dark').then((m) => m.default),
    ...SUPPORTED_LANGS.map((lang) => loadLang(lang)),
  ]);
  return createHighlighterCore({
    themes: [light, dark],
    langs,
    engine: createOnigurumaEngine(import('shiki/wasm')),
  });
}

async function getHighlighter(): Promise<HighlighterCore> {
  if (highlighter) return highlighter;
  highlighterPromise ??= createHighlighterInstance().then((hl) => {
    highlighter = hl;
    return hl;
  });
  return highlighterPromise;
}

export async function highlightCode(code: string, lang: string, isDark: boolean): Promise<string> {
  const hl = await getHighlighter();
  const theme = isDark ? 'github-dark' : 'github-light';

  const normalizedLang = lang.toLowerCase() as SupportedLang;
  const supportedLang = SUPPORTED_LANGS.includes(normalizedLang) ? normalizedLang : 'text';

  try {
    const html = hl.codeToHtml(code, {
      lang: supportedLang,
      theme,
    });
    return html;
  } catch {
    return `<pre class="shiki ${theme}"><code>${escapeHtml(code)}</code></pre>`;
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getCopyLabel() {
  return i18n.t('editor.copyCode');
}

export function setupCodeHighlight() {
  const editor = document.querySelector('.ProseMirror');
  if (!editor) return () => {};

  let queuedMode: 'none' | 'normal' | 'force' = 'none';
  let processing = false;

  const processCodeBlocks = async (force = false) => {
    const codeBlocks = editor.querySelectorAll<HTMLPreElement>('pre');
    const isDark = document.documentElement.dataset.theme === 'dark';
    for (const block of codeBlocks) {
      if (!force && block.classList.contains('shiki-processed')) continue;

      const code = block.querySelector('code');
      const classList = code ? Array.from(code.classList) : [];
      const langClass = classList.find((c) => c.startsWith('language-'));
      const lang = block.dataset.highlightLang ?? (langClass ? langClass.replace('language-', '') : 'text');
      const codeText = block.dataset.rawCode
        ? decodeURIComponent(block.dataset.rawCode)
        : code?.textContent || '';
      if (!codeText) continue;

      const highlighted = await highlightCode(codeText, lang, isDark);
      block.innerHTML = highlighted;
      block.classList.add('shiki-processed');
      block.dataset.rawCode = encodeURIComponent(codeText);
      block.dataset.highlightLang = lang;

      const copyBtn = document.createElement('button');
      copyBtn.className = 'copy-btn';
      copyBtn.dataset.state = 'idle';
      copyBtn.textContent = getCopyLabel();
      copyBtn.style.cssText = `
        position: absolute;
        top: 8px;
        right: 8px;
        padding: 4px 8px;
        font-size: 12px;
        background: var(--color-surface-sunken);
        border: none;
        border-radius: 4px;
        cursor: pointer;
        opacity: 0;
        transition: opacity 0.2s;
      `;
      block.style.position = 'relative';
      block.appendChild(copyBtn);

      copyBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await navigator.clipboard.writeText(codeText);
        copyBtn.dataset.state = 'copied';
        copyBtn.textContent = '✓';
        setTimeout(() => {
          copyBtn.dataset.state = 'idle';
          copyBtn.textContent = getCopyLabel();
        }, 2000);
      });

      block.addEventListener('mouseenter', () => {
        copyBtn.style.opacity = '1';
      });
      block.addEventListener('mouseleave', () => {
        copyBtn.style.opacity = '0';
      });

      if (lang && lang !== 'text') {
        const langLabel = document.createElement('span');
        langLabel.className = 'lang-label';
        langLabel.textContent = lang;
        langLabel.style.cssText = `
          position: absolute;
          top: 8px;
          left: 8px;
          font-size: 11px;
          color: var(--color-muted);
          text-transform: uppercase;
        `;
        block.appendChild(langLabel);
      }
    }
  };

  const scheduleProcessCodeBlocks = (force = false) => {
    queuedMode = force ? 'force' : queuedMode === 'none' ? 'normal' : queuedMode;
    if (processing) {
      return;
    }

    processing = true;
    void (async () => {
      try {
        while (queuedMode !== 'none') {
          const forceRun = queuedMode === 'force';
          queuedMode = 'none';
          await processCodeBlocks(forceRun);
        }
      } finally {
        processing = false;
        if (queuedMode !== 'none') {
          scheduleProcessCodeBlocks();
        }
      }
    })();
  };

  const handleLanguageChange = () => {
    editor.querySelectorAll<HTMLButtonElement>('.copy-btn').forEach((button) => {
      if (button.dataset.state !== 'copied') {
        button.textContent = getCopyLabel();
      }
    });
  };
  const handleThemeChange = () => {
    scheduleProcessCodeBlocks(true);
  };

  const observer = new MutationObserver(() => {
    scheduleProcessCodeBlocks();
  });

  observer.observe(editor, { childList: true, subtree: true });
  scheduleProcessCodeBlocks();
  i18n.on('languageChanged', handleLanguageChange);
  window.addEventListener('app-theme-changed', handleThemeChange);

  return () => {
    observer.disconnect();
    i18n.off('languageChanged', handleLanguageChange);
    window.removeEventListener('app-theme-changed', handleThemeChange);
  };
}
