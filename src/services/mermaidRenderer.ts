type MermaidModule = typeof import('mermaid');

export type MermaidRenderOptions = {
  theme?: 'default' | 'dark';
  editable?: boolean;
};

const RENDERED_ATTR = 'data-typola-mermaid-rendered';
const SOURCE_ATTR = 'data-typola-mermaid-source';
const GRAPH_SELECTOR = '.typola-mermaid';

let mermaidModulePromise: Promise<MermaidModule> | null = null;
let renderCounter = 0;

export async function renderMermaidIn(
  container: HTMLElement,
  options: MermaidRenderOptions = {},
): Promise<void> {
  const blocks = findMermaidBlocks(container);
  if (blocks.length === 0) return;

  const mermaid = await loadMermaid();
  mermaid.default.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: options.theme ?? 'default',
    flowchart: { useMaxWidth: true },
  });

  const activePre = getActivePre(container);
  for (const block of blocks) {
    if (activePre && (block.pre === activePre || block.pre.contains(activePre))) continue;
    if (options.editable && !block.pre.classList.contains('typola-mermaid-source-hidden')) {
      block.pre.classList.remove('typola-mermaid-source-hidden');
    }
    if (block.pre.getAttribute(RENDERED_ATTR) === 'true') continue;
    if (block.pre.closest(GRAPH_SELECTOR)) continue;
    const source = block.code.trim();
    if (!source || hasUnclosedFence(source)) continue;

    try {
      const id = `typola-mermaid-${Date.now()}-${renderCounter++}`;
      const { svg } = await withTimeout(mermaid.default.render(id, source), 5000);
      insertMermaidSvg(block.pre, svg, source, options);
    } catch (error) {
      showMermaidError(block.pre, error);
    }
  }
}

export function serializeMermaidSvg(target: Element | null): string | null {
  const svg = target?.closest(GRAPH_SELECTOR)?.querySelector('svg');
  if (!svg) return null;
  return new XMLSerializer().serializeToString(svg);
}

async function loadMermaid(): Promise<MermaidModule> {
  mermaidModulePromise ??= import('mermaid');
  return mermaidModulePromise;
}

function findMermaidBlocks(container: HTMLElement): Array<{ pre: HTMLElement; code: string }> {
  const seen = new Set<HTMLElement>();
  const blocks: Array<{ pre: HTMLElement; code: string }> = [];
  const candidates = container.querySelectorAll<HTMLElement>(
    'pre > code.language-mermaid, pre > code[class*="language-mermaid"], .language-mermaid',
  );
  candidates.forEach((candidate) => {
    const pre = candidate.closest('pre') as HTMLElement | null;
    const block = pre ?? candidate;
    if (!block || seen.has(block) || block.getAttribute(RENDERED_ATTR) === 'true') return;
    seen.add(block);
    blocks.push({ pre: block, code: candidate.textContent ?? '' });
  });
  return blocks;
}

function getActivePre(container: HTMLElement): HTMLElement | null {
  const selection = container.ownerDocument.getSelection();
  const node = selection?.anchorNode;
  if (!node) return null;
  const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
  return element?.closest('pre') as HTMLElement | null;
}

// Vditor 把 ```mermaid fence 头单独渲染成一个小 pre(只含 "mermaid" 文字),
// 紧邻实际代码 pre。我们替换代码 pre 时,顺手把 fence 头 pre 也清掉,
// 否则图上方会残留一个孤立的 "mermaid" 标签盒子。
function getAdjacentFenceLabel(pre: HTMLElement): HTMLElement | null {
  const prev = pre.previousElementSibling;
  if (!prev || prev.tagName !== 'PRE') return null;
  const text = (prev.textContent ?? '').trim();
  return text === 'mermaid' ? (prev as HTMLElement) : null;
}

function removeAdjacentFenceLabel(pre: HTMLElement): void {
  getAdjacentFenceLabel(pre)?.remove();
}

function insertMermaidSvg(pre: HTMLElement, svg: string, source: string, options: MermaidRenderOptions): void {
  const oldError = getSiblingError(pre);
  oldError?.remove();

  const graph = document.createElement('div');
  graph.className = 'typola-mermaid';
  graph.setAttribute(RENDERED_ATTR, 'true');
  graph.setAttribute(SOURCE_ATTR, source);
  graph.innerHTML = svg;

  if (options.editable) {
    // editable 模式:把 pre 隐藏(可点击图回到源码),也把 fence 头 pre 一起隐藏 + 恢复时还原。
    const fenceLabel = getAdjacentFenceLabel(pre);
    pre.classList.add('typola-mermaid-source-hidden');
    pre.setAttribute(RENDERED_ATTR, 'true');
    if (fenceLabel) fenceLabel.classList.add('typola-mermaid-source-hidden');
    graph.addEventListener('click', () => {
      pre.classList.remove('typola-mermaid-source-hidden');
      pre.removeAttribute(RENDERED_ATTR);
      if (fenceLabel) fenceLabel.classList.remove('typola-mermaid-source-hidden');
      graph.remove();
      // 把光标放进 pre 内部,让 selectionchange + scheduleMermaidIdleRender 的
      // skip-active-pre 逻辑生效,否则 350ms 后 idle render 会把图渲染回去。
      // <pre> 默认不可 focus,得通过 selection API 把 caret 放进它的文本节点。
      const doc = pre.ownerDocument;
      const sel = doc?.defaultView?.getSelection();
      if (sel) {
        sel.removeAllRanges();
        const range = doc.createRange();
        range.selectNodeContents(pre);
        range.collapse(true);
        sel.addRange(range);
      }
    }, { once: true });
    pre.insertAdjacentElement('beforebegin', graph);
    return;
  }

  removeAdjacentFenceLabel(pre);
  pre.replaceWith(graph);
}

function showMermaidError(pre: HTMLElement, error: unknown): void {
  pre.removeAttribute(RENDERED_ATTR);
  getSiblingError(pre)?.remove();
  const message = error instanceof Error ? error.message : String(error);
  const errorEl = document.createElement('div');
  errorEl.className = 'typola-mermaid-error';
  errorEl.textContent = `mermaid parse error: ${message}`;
  pre.insertAdjacentElement('afterend', errorEl);
}

function getSiblingError(pre: HTMLElement): Element | null {
  const next = pre.nextElementSibling;
  return next?.classList.contains('typola-mermaid-error') ? next : null;
}

function hasUnclosedFence(source: string): boolean {
  const fenceCount = (source.match(/```/gu) ?? []).length;
  return fenceCount % 2 === 1;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(`render timeout after ${timeoutMs}ms`)), timeoutMs);
    promise.then((value) => {
      window.clearTimeout(timer);
      resolve(value);
    }, (error) => {
      window.clearTimeout(timer);
      reject(error);
    });
  });
}
