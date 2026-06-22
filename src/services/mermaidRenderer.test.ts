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
});
