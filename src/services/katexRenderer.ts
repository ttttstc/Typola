import { loadKatex } from './lazyKatex';

export type KatexRenderOptions = {
  theme?: 'light' | 'dark';
};

const RENDERED_ATTR = 'data-typola-katex-rendered';
const SOURCE_ATTR = 'data-typola-katex-source';
const SKIP_CLASS = 'typola-katex-skip';

type KatexBlock = {
  el: HTMLElement;
  code: string;
  isBlock: boolean;
};

// 与 Vditor 自带 mathRender.ts 一致:跳过 fenced code block 内 (`vditor-ir__marker--pre`)
// 的 .language-math。这些按 ```math ``` 写的源码不应被实时渲染。
export async function renderKatexIn(
  container: HTMLElement,
  _options: KatexRenderOptions = {},
): Promise<void> {
  const blocks = findKatexBlocks(container);
  if (blocks.length === 0) return;

  const activeMath = getActiveMath(container);
  const katex = await loadKatex();
  for (const block of blocks) {
    if (block.el.getAttribute(RENDERED_ATTR) === 'true') continue;
    if (block.el.classList.contains(SKIP_CLASS)) continue;
    if (activeMath && block.el.contains(activeMath)) continue;

    const source = block.code.trim();
    if (!source) continue;

    try {
      const html = katex.renderToString(source, {
        displayMode: block.isBlock,
        throwOnError: false,
        output: 'html',
      });
      block.el.setAttribute(SOURCE_ATTR, source);
      block.el.setAttribute(RENDERED_ATTR, 'true');
      block.el.classList.add('typola-katex-rendered');
      block.el.innerHTML = html;
      block.el.addEventListener('click', () => revealKatexSource(block.el), { once: true });
    } catch (error) {
      showKatexError(block.el, error);
    }
  }
}

function findKatexBlocks(container: HTMLElement): KatexBlock[] {
  const seen = new Set<HTMLElement>();
  const blocks: KatexBlock[] = [];
  const candidates = container.querySelectorAll<HTMLElement>('.language-math');
  candidates.forEach((candidate) => {
    if (seen.has(candidate)) return;
    seen.add(candidate);
    if (candidate.parentElement?.classList.contains('vditor-ir__marker--pre')) return;
    const isBlock =
      candidate.tagName === 'DIV' ||
      candidate.getAttribute('data-type') === 'math-block';
    blocks.push({
      el: candidate,
      code: candidate.textContent ?? '',
      isBlock,
    });
  });
  return blocks;
}

// 选区当前所在的 .language-math 元素:renderKatexIn 跳过它,避免 idle render 把
// 用户正在编辑的源码抢回去。对齐 mermaidRenderer.ts 的 getActivePre。
function getActiveMath(container: HTMLElement): HTMLElement | null {
  const sel = container.ownerDocument.defaultView?.getSelection();
  const node = sel?.anchorNode;
  if (!node) return null;
  const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
  return element?.closest('.language-math') as HTMLElement | null;
}

// 点击已渲染公式 → 还原为源码显示,并把 caret 放进代码元素。
// 直接 DOM swap 不触发 Vditor input 事件,所以选中态不会丢源码。
// 同时加 SKIP_CLASS 防 220ms / 350ms idle render 把刚露出的源码又盖回去。
function revealKatexSource(el: HTMLElement): void {
  const source = el.getAttribute(SOURCE_ATTR) ?? el.textContent ?? '';
  el.classList.remove('typola-katex-rendered');
  el.removeAttribute(RENDERED_ATTR);
  el.removeAttribute(SOURCE_ATTR);
  el.classList.add(SKIP_CLASS);
  el.textContent = source;
  const doc = el.ownerDocument;
  const range = doc.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = doc.defaultView?.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
  // 兜底:5s 后强制清掉 skip,即使选区一直没移开也能被后续 render 接管(罕见场景)。
  window.setTimeout(() => el.classList.remove(SKIP_CLASS), 5000);
}

function showKatexError(el: HTMLElement, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  el.classList.add('typola-katex-error');
  el.classList.remove('typola-katex-rendered');
  el.removeAttribute(RENDERED_ATTR);
  el.textContent = `katex error: ${message}`;
}
