// Mermaid lazy loading - will be dynamically imported when first used
import i18n from '../../i18n';

let mermaidModule: any = null;
let lastValidSvg: string | null = null;

export async function getMermaid() {
  if (!mermaidModule) {
    mermaidModule = await import('mermaid');
    mermaidModule.default.initialize({
      startOnLoad: false,
      theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'default',
      securityLevel: 'loose',
    });
  }
  return mermaidModule.default;
}

export async function renderMermaid(code: string): Promise<{ svg: string; error: boolean }> {
  const isDark = document.documentElement.dataset.theme === 'dark';
  const theme = isDark ? 'dark' : 'default';

  try {
    const mermaid = await getMermaid();
    mermaid.default.initialize({
      startOnLoad: false,
      theme,
      securityLevel: 'loose',
    });

    const id = `mermaid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const { svg } = await mermaid.default.render(id, code);
    lastValidSvg = svg;
    return { svg, error: false };
  } catch (error) {
    console.error('Mermaid render error:', error);
    return {
      svg: lastValidSvg || `<div style="color: red;">${i18n.t('editor.mermaidSyntaxError')}</div>`,
      error: true,
    };
  }
}

export function setupMermaidHandler() {
  const editor = document.querySelector('.ProseMirror');
  if (!editor) return () => {};

  let queuedMode: 'none' | 'normal' | 'force' = 'none';
  let processing = false;

  const processMermaidBlocks = async (force = false) => {
    const codeBlocks = editor.querySelectorAll<HTMLPreElement>('pre');
    for (const block of codeBlocks) {
      if (block.classList.contains('mermaid-editing')) continue;

      const existingCode = block.dataset.mermaidCode ?? '';
      if (block.classList.contains('mermaid-processed') && !force) continue;

      const code = block.querySelector('code');
      const classList = code ? Array.from(code.classList) : [];
      const langClass = classList.find((c) => c.startsWith('language-'));
      const lang = langClass ? langClass.replace('language-', '') : '';
      const codeText = existingCode || code?.textContent || '';

      if (lang.toLowerCase() !== 'mermaid' && !existingCode) continue;

      const { svg, error } = await renderMermaid(codeText);

      block.dataset.mermaidCode = codeText;
      block.innerHTML = svg;
      block.classList.add('mermaid-processed');
      block.style.cssText = `
        text-align: center;
        background: transparent;
        padding: 16px;
      `;

      if (error) {
        block.style.border = '1px solid red';
        block.style.borderRadius = '8px';
      }

      if (block.dataset.mermaidBound !== 'true') {
        block.addEventListener('dblclick', () => {
          if (block.classList.contains('mermaid-editing')) return;
          enterEditMode(block, block.dataset.mermaidCode || codeText);
        });
        block.dataset.mermaidBound = 'true';
      }
    }
  };

  const scheduleProcessMermaidBlocks = (force = false) => {
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
          await processMermaidBlocks(forceRun);
        }
      } finally {
        processing = false;
        if (queuedMode !== 'none') {
          scheduleProcessMermaidBlocks();
        }
      }
    })();
  };

  const enterEditMode = async (block: HTMLPreElement, originalCode: string) => {
    block.classList.add('mermaid-editing');

    const container = document.createElement('div');
    container.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 8px;
    `;

    const textarea = document.createElement('textarea');
    textarea.value = originalCode;
    textarea.style.cssText = `
      width: 100%;
      min-height: 100px;
      font-family: var(--font-mono);
      font-size: 14px;
      padding: 8px;
      border: 1px solid var(--color-line-soft);
      border-radius: 4px;
      background: var(--color-paper);
      color: var(--color-ink);
      resize: vertical;
    `;

    const preview = document.createElement('div');
    preview.className = 'mermaid-preview';
    preview.innerHTML = block.querySelector('svg')?.outerHTML || '';

    container.appendChild(textarea);
    container.appendChild(preview);

    const originalSvg = block.querySelector('svg')?.outerHTML || '';

    let debounceTimer: ReturnType<typeof setTimeout>;
    textarea.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        const { svg } = await renderMermaid(textarea.value);
        preview.innerHTML = svg;
      }, 300);
    });

    const exitEdit = () => {
      block.classList.remove('mermaid-editing');
      block.innerHTML = originalSvg;
    };

    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        exitEdit();
      }
    });

    block.innerHTML = '';
    block.appendChild(container);

    const handleBlur = (e: FocusEvent) => {
      const relatedTarget = e.relatedTarget as Node | null;
      if (!block.contains(relatedTarget)) {
        exitEdit();
        block.removeEventListener('blur', handleBlur);
      }
    };
    block.addEventListener('blur', handleBlur, true);
    textarea.focus();
  };

  const observer = new MutationObserver(() => {
    scheduleProcessMermaidBlocks();
  });

  observer.observe(editor, { childList: true, subtree: true });
  scheduleProcessMermaidBlocks();
  const handleLanguageChange = () => {
    scheduleProcessMermaidBlocks(true);
  };
  const handleThemeChange = () => {
    scheduleProcessMermaidBlocks(true);
  };
  i18n.on('languageChanged', handleLanguageChange);
  window.addEventListener('app-theme-changed', handleThemeChange);

  return () => {
    observer.disconnect();
    i18n.off('languageChanged', handleLanguageChange);
    window.removeEventListener('app-theme-changed', handleThemeChange);
  };
}
