import { createHighlighter, Highlighter } from 'shiki';

let highlighter: Highlighter | null = null;

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

type SupportedLang = typeof SUPPORTED_LANGS[number];

async function getHighlighter(): Promise<Highlighter> {
  if (!highlighter) {
    highlighter = await createHighlighter({
      themes: ['github-light', 'github-dark'],
      langs: [...SUPPORTED_LANGS],
    });
  }
  return highlighter;
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

export function setupCodeHighlight() {
  const editor = document.querySelector('.ProseMirror');
  if (!editor) return;

  const theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';

  const processCodeBlocks = async () => {
    const codeBlocks = editor.querySelectorAll('pre');
    for (const block of codeBlocks) {
      if (block.classList.contains('shiki-processed')) continue;

      const code = block.querySelector('code');
      if (!code) continue;

      const codeText = code.textContent || '';
      const classList = Array.from(code.classList);
      const langClass = classList.find((c) => c.startsWith('language-'));
      const lang = langClass ? langClass.replace('language-', '') : 'text';

      const highlighted = await highlightCode(codeText, lang, theme === 'dark');
      block.innerHTML = highlighted;
      block.classList.add('shiki-processed');

      const copyBtn = document.createElement('button');
      copyBtn.className = 'copy-btn';
      copyBtn.textContent = '复制';
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
        copyBtn.textContent = '✓';
        setTimeout(() => {
          copyBtn.textContent = '复制';
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

  const observer = new MutationObserver(() => {
    processCodeBlocks();
  });

  observer.observe(editor, { childList: true, subtree: true });
  processCodeBlocks();
}
