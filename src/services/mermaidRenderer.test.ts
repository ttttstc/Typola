import { describe, expect, it, vi } from 'vitest';
import {
  MERMAID_RENDER_TIMEOUT_MS,
  normalizeMermaidSvgSize,
  normalizeMermaidSvgViewport,
  serializeMermaidSvg,
  withTimeout,
} from './mermaidRenderer';

describe('mermaidRenderer 纯函数', () => {
  describe('withTimeout', () => {
    it('Promise 在超时前 resolve 时透传结果', async () => {
      const result = await withTimeout(Promise.resolve('ok'), 1000);
      expect(result).toBe('ok');
    });

    it('Promise 在超时前 reject 时透传错误', async () => {
      await expect(withTimeout(Promise.reject(new Error('boom')), 1000)).rejects.toThrow('boom');
    });

    it('Promise 超时后抛超时错误', async () => {
      vi.useFakeTimers();
      try {
        const slow = new Promise<string>((resolve) => {
          setTimeout(() => resolve('too late'), 10000);
        });
        const pending = withTimeout(slow, 100);
        vi.advanceTimersByTime(100);
        await expect(pending).rejects.toThrow('render timeout after 100ms');
      } finally {
        vi.useRealTimers();
      }
    });

    it('MERMAID_RENDER_TIMEOUT_MS 为 5000', () => {
      expect(MERMAID_RENDER_TIMEOUT_MS).toBe(5000);
    });
  });

  describe('normalizeMermaidSvgSize', () => {
    it('从 viewBox 取自然宽度并改写为显式 width', () => {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="100%" style="max-width: 800px"><circle r="5"/></svg>';
      const result = normalizeMermaidSvgSize(svg);
      expect(result).toContain('width="800"');
      expect(result).toContain('height: auto');
    });

    it('移除 max-width 样式（避免容器被压成缩略图）', () => {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="100%" style="max-width: 400px;"><circle/></svg>';
      const result = normalizeMermaidSvgSize(svg);
      expect(result).not.toContain('max-width');
    });

    it('解析失败时返回原 SVG（fail-open）', () => {
      const malformed = '<<not-an-svg>>>';
      const result = normalizeMermaidSvgSize(malformed);
      expect(result).toBe(malformed);
    });

    it('viewBox 缺失时返回原 SVG', () => {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg"><circle/></svg>';
      const result = normalizeMermaidSvgSize(svg);
      expect(result).toBe(svg);
    });

    it('viewBox 宽为非正数时返回原 SVG（避免改写为 0）', () => {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 0 600"><circle/></svg>';
      const result = normalizeMermaidSvgSize(svg);
      expect(result).toBe(svg);
    });

    it('保留已有 inline style 中除 max-width 外的属性', () => {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="100%" style="max-width: 800px; overflow: visible"><circle/></svg>';
      const result = normalizeMermaidSvgSize(svg);
      expect(result).toContain('overflow: visible');
      expect(result).not.toContain('max-width');
    });
  });

  describe('normalizeMermaidSvgViewport', () => {
    function makeSvg(viewBox: string): SVGSVGElement {
      const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      el.setAttribute('viewBox', viewBox);
      return el;
    }

    it('viewBox 正常时不修改', () => {
      const el = makeSvg('0 0 800 600');
      el.getBBox = () => ({ x: 0, y: 0, width: 800, height: 600 }) as DOMRect;
      normalizeMermaidSvgViewport(el);
      expect(el.getAttribute('viewBox')).toBe('0 0 800 600');
    });

    it('viewBox 异常膨胀时收紧（CHANGELOG §WebView2 viewBox 修复）', () => {
      const el = makeSvg('-138 -59 2146 2067');
      el.getBBox = () => ({ x: 100, y: 50, width: 1053, height: 558 }) as DOMRect;
      normalizeMermaidSvgViewport(el);
      const next = el.getAttribute('viewBox');
      expect(next).not.toBe('-138 -59 2146 2067');
      expect(next).toMatch(/^-?\d/);
      // 包含 padding 8，width 期望 1053+16=1069
      const parts = next!.split(/\s+/u).map(Number);
      expect(parts[2]).toBeCloseTo(1069, -1);
    });

    it('viewBox 缺失时不修改', () => {
      const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      el.getBBox = () => ({ x: 0, y: 0, width: 100, height: 100 }) as DOMRect;
      normalizeMermaidSvgViewport(el);
      expect(el.getAttribute('viewBox')).toBeNull();
    });

    it('naturalSize=true 时同时设置 width 属性', () => {
      const el = makeSvg('-100 -100 2000 2000');
      el.getBBox = () => ({ x: 0, y: 0, width: 1000, height: 500 }) as DOMRect;
      normalizeMermaidSvgViewport(el, { naturalSize: true });
      expect(el.getAttribute('width')).toBeTruthy();
      expect(el.getAttribute('width')).toMatch(/^\d+$/);
    });
  });

  describe('serializeMermaidSvg', () => {
    it('target 包含 svg 时返回序列化字符串', () => {
      const wrapper = document.createElement('div');
      wrapper.className = 'typola-mermaid';
      wrapper.innerHTML = '<svg viewBox="0 0 100 50"><circle/></svg>';
      const result = serializeMermaidSvg(wrapper);
      expect(result).toContain('<svg');
      expect(result).toContain('<circle');
    });

    it('target 不含 svg 时返回 null', () => {
      const wrapper = document.createElement('div');
      wrapper.className = 'typola-mermaid';
      wrapper.innerHTML = '<p>未渲染</p>';
      const result = serializeMermaidSvg(wrapper);
      expect(result).toBeNull();
    });

    it('target 为 null 时返回 null', () => {
      expect(serializeMermaidSvg(null)).toBeNull();
    });

    it('target 自身不是 .typola-mermaid 容器但包含 svg 时也返回（closest 语义）', () => {
      const inner = document.createElement('div');
      inner.innerHTML = '<svg><rect/></svg>';
      const wrapper = document.createElement('div');
      wrapper.className = 'typola-mermaid';
      wrapper.appendChild(inner);
      const result = serializeMermaidSvg(inner);
      expect(result).toContain('<svg');
    });
  });
});
