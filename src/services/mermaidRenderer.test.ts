import { beforeEach, describe, expect, it, vi } from 'vitest';

const renderMock = vi.fn(async (id: string, source: string) => {
  if (source.includes('BROKEN')) throw new Error('bad diagram');
  return { svg: `<svg id="${id}"><text>${source}</text></svg>` };
});
const initializeMock = vi.fn();

vi.mock('mermaid', () => ({
  default: {
    initialize: initializeMock,
    render: renderMock,
  },
}));

describe('mermaidRenderer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('renders pre code mermaid blocks into svg containers', async () => {
    const { renderMermaidIn } = await import('./mermaidRenderer');
    const container = document.createElement('div');
    container.innerHTML = '<pre><code class="language-mermaid">flowchart TD\\nA-->B</code></pre>';
    await renderMermaidIn(container);
    expect(container.querySelector('.typola-mermaid svg')).toBeTruthy();
    expect(container.querySelector('pre')).toBeNull();
  });

  it('is idempotent for already rendered blocks', async () => {
    const { renderMermaidIn } = await import('./mermaidRenderer');
    const container = document.createElement('div');
    container.innerHTML = '<pre><code class="language-mermaid">flowchart TD\\nA-->B</code></pre>';
    await renderMermaidIn(container);
    await renderMermaidIn(container);
    expect(renderMock).toHaveBeenCalledTimes(1);
    expect(container.querySelectorAll('.typola-mermaid')).toHaveLength(1);
  });

  it('keeps source pre and appends an error bar on render failures', async () => {
    const { renderMermaidIn } = await import('./mermaidRenderer');
    const container = document.createElement('div');
    container.innerHTML = '<pre><code class="language-mermaid">BROKEN</code></pre>';
    await renderMermaidIn(container);
    expect(container.querySelector('pre')).toBeTruthy();
    expect(container.querySelector('.typola-mermaid-error')?.textContent).toContain('bad diagram');
  });

  it('skips unclosed fenced content', async () => {
    const { renderMermaidIn } = await import('./mermaidRenderer');
    const container = document.createElement('div');
    container.innerHTML = '<pre><code class="language-mermaid">```mermaid\\nflowchart TD</code></pre>';
    await renderMermaidIn(container);
    expect(renderMock).not.toHaveBeenCalled();
    expect(container.querySelector('pre')).toBeTruthy();
  });

  it('keeps editable source in DOM and restores it when the graph is clicked', async () => {
    const { renderMermaidIn } = await import('./mermaidRenderer');
    const container = document.createElement('div');
    container.innerHTML = '<pre><code class="language-mermaid">sequenceDiagram\\nA->>B: hi</code></pre>';
    await renderMermaidIn(container, { editable: true });
    const pre = container.querySelector('pre')!;
    expect(pre.classList.contains('typola-mermaid-source-hidden')).toBe(true);
    container.querySelector<HTMLElement>('.typola-mermaid')?.click();
    expect(pre.classList.contains('typola-mermaid-source-hidden')).toBe(false);
    expect(container.querySelector('.typola-mermaid')).toBeNull();
  });

  it('rejects hanging renders after the timeout and shows an error bar', async () => {
    vi.useFakeTimers();
    try {
      renderMock.mockImplementationOnce(() => new Promise(() => { /* 模拟 mermaid.render 挂起 */ }));
      const { renderMermaidIn } = await import('./mermaidRenderer');
      const container = document.createElement('div');
      container.innerHTML = '<pre><code class="language-mermaid">flowchart TD\\nA-->B</code></pre>';
      document.body.appendChild(container);
      const pending = renderMermaidIn(container);
      await vi.advanceTimersByTimeAsync(5000);
      await pending;
      expect(container.querySelector('pre')).toBeTruthy();
      expect(container.querySelector('.typola-mermaid-error')?.textContent).toContain('render timeout after 5000ms');
    } finally {
      vi.useRealTimers();
    }
  });

  it('initializes mermaid once per theme and re-initializes on theme switch', async () => {
    const { ensureMermaidInitialized } = await import('./mermaidRenderer');
    // 本文件前面的用例已以 default 主题初始化过：相同主题不再重复 initialize。
    await ensureMermaidInitialized('default');
    expect(initializeMock).toHaveBeenCalledTimes(0);
    await ensureMermaidInitialized('default');
    expect(initializeMock).toHaveBeenCalledTimes(0);
    // 切换主题时重新 initialize，避免共享单例被旧主题覆盖。
    await ensureMermaidInitialized('dark');
    expect(initializeMock).toHaveBeenCalledTimes(1);
    expect(initializeMock).toHaveBeenCalledWith(expect.objectContaining({ theme: 'dark', securityLevel: 'strict' }));
    await ensureMermaidInitialized('dark');
    expect(initializeMock).toHaveBeenCalledTimes(1);
  });

  it('normalizeMermaidSvgSize 把 useMaxWidth 输出归一为显式自然宽度', async () => {
    const { normalizeMermaidSvgSize } = await import('./mermaidRenderer');
    const svg = '<svg width="100%" style="max-width: 700px;" viewBox="0 0 700 420" height="420"><g></g></svg>';
    const normalized = normalizeMermaidSvgSize(svg);
    const el = document.createElement('div');
    el.innerHTML = normalized;
    const out = el.querySelector('svg')!;
    expect(out.getAttribute('width')).toBe('700');
    expect(out.hasAttribute('height')).toBe(false);
    expect(out.style.height).toBe('auto');
    expect(out.style.maxWidth).toBe('');
  });

  it('normalizeMermaidSvgSize 对无 viewBox 的 SVG 原样返回', async () => {
    const { normalizeMermaidSvgSize } = await import('./mermaidRenderer');
    const svg = '<svg width="100%"><text>no viewBox</text></svg>';
    expect(normalizeMermaidSvgSize(svg)).toBe(svg);
  });

  it('normalizeMermaidSvgViewport 收紧 WebView2 异常膨胀的 viewBox', async () => {
    const { normalizeMermaidSvgViewport } = await import('./mermaidRenderer');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '2146');
    svg.setAttribute('viewBox', '-138 -59 2146 2067');
    Object.defineProperty(svg, 'getBBox', {
      configurable: true,
      value: () => ({ x: 8, y: 8, width: 1053.06640625, height: 558 }),
    });

    normalizeMermaidSvgViewport(svg, { naturalSize: true });

    const viewBox = svg.getAttribute('viewBox')!.split(' ').map(Number);
    expect(viewBox[0]).toBe(0);
    expect(viewBox[1]).toBe(0);
    expect(viewBox[2]).toBeCloseTo(1069.066, 3);
    expect(viewBox[3]).toBe(574);
    expect(svg.getAttribute('width')).toBe('1069');
  });

  it('naturalSize 选项控制预览/导出尺寸策略', async () => {
    const { renderMermaidIn } = await import('./mermaidRenderer');
    renderMock.mockImplementation(async (id: string) => ({
      svg: `<svg id="${id}" width="100%" style="max-width: 700px;" viewBox="0 0 700 420" height="420"></svg>`,
    }));
    const natural = document.createElement('div');
    natural.innerHTML = '<pre><code class="language-mermaid">A</code></pre>';
    await renderMermaidIn(natural, { naturalSize: true });
    expect(natural.querySelector('svg')!.getAttribute('width')).toBe('700');

    const adaptive = document.createElement('div');
    adaptive.innerHTML = '<pre><code class="language-mermaid">A</code></pre>';
    await renderMermaidIn(adaptive);
    // 导出链路缺省不归一：保持 mermaid 的自适应宽度输出。
    expect(adaptive.querySelector('svg')!.getAttribute('width')).toBe('100%');
  });
});
