type MermaidModule = typeof import('mermaid');

export type MermaidRenderOptions = {
  theme?: 'default' | 'dark';
  editable?: boolean;
  /** 按自然尺寸展示（编辑器/预览面板用）；导出管线缺省自适应容器宽。 */
  naturalSize?: boolean;
};

const RENDERED_ATTR = 'data-typola-mermaid-rendered';
const SOURCE_ATTR = 'data-typola-mermaid-source';
const GRAPH_SELECTOR = '.typola-mermaid';

/** mermaid 单次渲染的超时上限，CM6 编辑器与预览链路共用。 */
export const MERMAID_RENDER_TIMEOUT_MS = 5000;

let mermaidModulePromise: Promise<MermaidModule> | null = null;
let renderCounter = 0;
// 记录上一次 initialize 的主题：CM6 编辑器与预览/导出链路共享同一个
// mermaid 单例，若每次都 initialize 会互相覆盖主题与安全级别配置。
let lastInitializedTheme: 'default' | 'dark' | null = null;

/** 共享的 mermaid 初始化入口：相同主题只 initialize 一次，供 CM6 侧复用。 */
export async function ensureMermaidInitialized(
  theme: 'default' | 'dark' = 'default',
): Promise<MermaidModule> {
  const mermaid = await loadMermaid();
  if (lastInitializedTheme !== theme) {
    mermaid.default.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme,
      flowchart: { useMaxWidth: true },
    });
    lastInitializedTheme = theme;
  }
  return mermaid;
}

export async function renderMermaidIn(
  container: HTMLElement,
  options: MermaidRenderOptions = {},
): Promise<void> {
  const blocks = findMermaidBlocks(container);
  if (blocks.length === 0) return;

  const mermaid = await ensureMermaidInitialized(options.theme ?? 'default');

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
      const { svg } = await withTimeout(mermaid.default.render(id, source), MERMAID_RENDER_TIMEOUT_MS);
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

/**
 * 把 mermaid 输出的 SVG 归一为自然尺寸（显式 width + height:auto 基线）。
 *
 * mermaid 默认 useMaxWidth 输出 `width="100%"` + `style="max-width:Npx"`，
 * 图会被压进容器宽 —— 窄窗口下宽流程图直接变成缩略图。这里从 viewBox
 * 取自然宽度，改写为显式像素 width 并移除 max-width，让编辑器/预览容器
 * 以自然尺寸展示（超宽由容器 overflow-x 滚动承接，缩放控件按倍率改写
 * width）。仅用于编辑器与预览管线；导出链路保持自适应宽度不调用本函数。
 */
export function normalizeMermaidSvgSize(svg: string): string {
  try {
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    const el = doc.documentElement;
    if (el?.nodeName.toLowerCase() !== 'svg') return svg;
    const viewBox = el.getAttribute('viewBox')?.match(/^[\d.-]+\s+[\d.-]+\s+([\d.]+)/);
    const natural = Number(viewBox?.[1]);
    if (!Number.isFinite(natural) || natural <= 0) return svg;
    el.setAttribute('width', `${Math.round(natural)}`);
    // SVG 的 height 属性不认 "auto"：移除属性后由 inline style 的
    // height:auto（replaced element 按纵横比）接管，避免部分浏览器
    // 回退到 150px 默认高度。XML 文档的 Element 没有 .style 接口
    // （jsdom 下访问即抛错），必须直接操作 style 属性字符串。
    el.removeAttribute('height');
    const style = el.getAttribute('style') ?? '';
    const restStyle = style.replace(/max-width\s*:[^;]*;?/giu, '').trim();
    el.setAttribute('style', `height: auto${restStyle ? `; ${restStyle}` : ''}`);
    return new XMLSerializer().serializeToString(el);
  } catch {
    // 解析失败时原样返回，宁可小图也不能丢图。
    return svg;
  }
}

/**
 * 收紧 Mermaid 在部分 WebView2 版本中被错误放大的 viewBox。
 *
 * 已知现象：同一份图在 release WebView2 中可能生成
 * `viewBox="-138 -59 2146 2067"`，但实际绘制根节点的 getBBox 只有约
 * 1053×558；width/height 仍按异常 viewBox 展开，于是图下方出现一整块
 * 空白画布。DOM 插入后 getBBox 才可靠，因此这里不能在字符串阶段完成。
 * 正常 viewBox 不动，仅在画布相对实际内容明显膨胀时裁剪，并保留 Mermaid
 * 默认 8px diagram padding。
 */
export function normalizeMermaidSvgViewport(
  svg: SVGSVGElement,
  options: { naturalSize?: boolean } = {},
): void {
  try {
    const bbox = svg.getBBox();
    if (!(bbox.width > 0 && bbox.height > 0)) return;
    const current = svg.getAttribute('viewBox')
      ?.trim()
      .split(/[\s,]+/u)
      .map(Number);
    if (!current || current.length !== 4 || current.some((value) => !Number.isFinite(value))) return;

    const padding = 8;
    const next = {
      x: bbox.x - padding,
      y: bbox.y - padding,
      width: bbox.width + padding * 2,
      height: bbox.height + padding * 2,
    };
    // 只处理异常膨胀的画布，避免改变正常 Mermaid 输出的边界语义。
    if (current[2] <= next.width * 1.25 && current[3] <= next.height * 1.25) return;

    svg.setAttribute('viewBox', `${next.x} ${next.y} ${next.width} ${next.height}`);
    if (options.naturalSize) svg.setAttribute('width', `${Math.round(next.width)}`);
  } catch {
    // getBBox 在未挂载、jsdom 或不支持 SVG 布局的环境中不可用时保留原图。
  }
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
  // 预览面板（naturalSize）与编辑器一致按自然尺寸展示，超宽由容器
  // overflow-x 滚动承接；导出链路不传该选项，保持自适应容器宽。
  graph.innerHTML = options.naturalSize ? normalizeMermaidSvgSize(svg) : svg;
  const renderedSvg = graph.querySelector('svg');
  if (renderedSvg) normalizeMermaidSvgViewport(renderedSvg, options);

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

/** mermaid.render 无自身超时，挂起时由该兜底转成可展示的错误。 */
export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
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
