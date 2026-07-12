import { describe, expect, it, vi } from 'vitest';
import { getBlockRender } from './blockRenderCache';

describe('blockRenderCache', () => {
  it('deduplicates an in-flight render by type, exact source, and theme', async () => {
    let resolve!: (value: string) => void;
    const render = vi.fn(() => new Promise<string>((done) => { resolve = done; }));
    const firstSettled = vi.fn();
    const secondSettled = vi.fn();

    expect(getBlockRender('mermaid', 'graph TD\nA-->B', 'night-current', render, firstSettled)).toEqual({ state: 'loading' });
    expect(getBlockRender('mermaid', 'graph TD\nA-->B', 'night-current', render, secondSettled)).toEqual({ state: 'loading' });
    expect(render).toHaveBeenCalledTimes(1);

    resolve('<svg />');
    await Promise.resolve();
    expect(firstSettled).toHaveBeenCalledTimes(1);
    expect(secondSettled).toHaveBeenCalledTimes(1);
    expect(getBlockRender('mermaid', 'graph TD\nA-->B', 'night-current', render, vi.fn())).toEqual({ state: 'ready', html: '<svg />' });
  });

  it('keeps errors cached rather than retrying on every redraw', async () => {
    const render = vi.fn(async () => { throw new Error('bad syntax'); });
    getBlockRender('katex', '\\badcommand', 'plain-paper', render, vi.fn());
    await Promise.resolve();
    await Promise.resolve();

    expect(getBlockRender('katex', '\\badcommand', 'plain-paper', render, vi.fn())).toEqual({
      state: 'error', message: 'bad syntax',
    });
    expect(render).toHaveBeenCalledTimes(1);
  });
});
