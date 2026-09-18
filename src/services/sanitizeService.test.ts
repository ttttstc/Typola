import { describe, expect, it } from 'vitest';
import { sanitizeHtml } from './sanitizeService';

describe('sanitizeService', () => {
  describe('基础标签白名单', () => {
    it('保留常见 HTML 标签', () => {
      const html = '<h1>标题</h1><p>段落 <strong>加粗</strong> 与 <em>斜体</em></p>';
      const result = sanitizeHtml(html);
      expect(result).toContain('<h1>');
      expect(result).toContain('<p>');
      expect(result).toContain('<strong>');
      expect(result).toContain('<em>');
    });

    it('保留 Markdown 表格相关标签', () => {
      const html = '<table><thead><tr><th>列</th></tr></thead><tbody><tr><td>值</td></tr></tbody></table>';
      const result = sanitizeHtml(html);
      expect(result).toContain('<table>');
      expect(result).toContain('<thead>');
      expect(result).toContain('<th>');
      expect(result).toContain('<td>');
    });

    it('保留代码块与引用', () => {
      const html = '<pre><code>code</code></pre><blockquote>quote</blockquote>';
      const result = sanitizeHtml(html);
      expect(result).toContain('<pre>');
      expect(result).toContain('<code>');
      expect(result).toContain('<blockquote>');
    });

    it('保留链接与图片', () => {
      const html = '<a href="https://example.com">链接</a><img src="https://example.com/a.png" alt="图片">';
      const result = sanitizeHtml(html);
      expect(result).toContain('href="https://example.com"');
      expect(result).toContain('src="https://example.com/a.png"');
      expect(result).toContain('alt="图片"');
    });
  });

  describe('危险内容剥离', () => {
    it('剥离 <script> 标签与其内容', () => {
      const html = '<p>安全</p><script>alert("xss")</script>';
      const result = sanitizeHtml(html);
      expect(result).toContain('<p>');
      expect(result).not.toContain('<script>');
      expect(result).not.toContain('alert');
    });

    it('剥离 on* 事件处理器', () => {
      const html = '<a href="#" onclick="steal()">click</a>';
      const result = sanitizeHtml(html);
      expect(result).not.toContain('onclick');
      expect(result).not.toContain('steal');
    });

    it('剥离 javascript: 伪协议链接', () => {
      const html = '<a href="javascript:alert(1)">click</a>';
      const result = sanitizeHtml(html);
      expect(result).not.toContain('javascript:');
      expect(result).not.toContain('alert');
    });

    it('剥离 <iframe>', () => {
      const html = '<iframe src="https://evil.example.com"></iframe><p>正文</p>';
      const result = sanitizeHtml(html);
      expect(result).not.toContain('<iframe');
      expect(result).toContain('<p>');
    });

    it('剥离 data: URI 中的脚本', () => {
      const html = '<a href="data:text/html,<script>alert(1)</script>">x</a>';
      const result = sanitizeHtml(html);
      expect(result).not.toContain('<script>');
      expect(result).not.toContain('alert');
    });
  });

  describe('非 SVG 内的 <style> 收紧（PR #268 修复）', () => {
    it('保留 <svg> 内的 <style>', () => {
      const html = '<svg><style>.cls { fill: red; }</style><circle class="cls" r="5"/></svg>';
      const result = sanitizeHtml(html);
      expect(result).toContain('<style>');
      expect(result).toContain('.cls');
    });

    it('移除 <svg> 外的 <style>', () => {
      const html = '<style>body { display: none }</style><p>正文</p>';
      const result = sanitizeHtml(html);
      expect(result).not.toContain('<style');
      expect(result).toContain('<p>');
    });

    it('移除 <svg> 外的 inline style 属性', () => {
      const html = '<p style="display:none">隐藏</p>';
      const result = sanitizeHtml(html);
      expect(result).toContain('<p>');
      expect(result).not.toContain('display:none');
    });

    it('保留 <svg> 元素自身的 style 属性', () => {
      const html = '<svg style="background:red"><circle r="5"/></svg>';
      const result = sanitizeHtml(html);
      expect(result).toContain('<svg');
      expect(result).toContain('style="background:red"');
    });

    it('保留 <svg> 内子元素的 style 属性', () => {
      const html = '<svg><circle style="fill:blue" r="5"/></svg>';
      const result = sanitizeHtml(html);
      expect(result).toContain('style="fill:blue"');
    });

    it('复杂嵌套：<svg> 内 <foreignObject> 内 div 的 style 仍被剥离', () => {
      const html = '<svg><foreignObject><div style="color:red">x</div></foreignObject></svg>';
      const result = sanitizeHtml(html);
      expect(result).toContain('<svg>');
      expect(result).toContain('<foreignObject>');
      expect(result).not.toMatch(/<div[^>]*style/);
    });
  });

  describe('mermaid 11 SVG 关键结构（CHANGELOG §白名单补齐）', () => {
    it('保留 mermaid 输出的 <style> 节点配色', () => {
      const html = '<svg><style>.nodeLabel { font-family: sans-serif; }</style><g class="node"><rect fill="#fff"/></g></svg>';
      const result = sanitizeHtml(html);
      expect(result).toContain('<style>');
      expect(result).toContain('.nodeLabel');
    });

    it('保留 <filter> 与 <feDropShadow>（DOMPurify 把 feDropShadow 转小写为 fedropshadow）', () => {
      const html = '<svg><defs><filter id="f1"><feDropShadow stdDeviation="2"/></filter></defs><rect filter="url(#f1)"/></svg>';
      const result = sanitizeHtml(html);
      expect(result).toContain('<filter');
      // DOMPurify SVG 序列化时把驼峰标签规范为小写（feDropShadow → fedropshadow）
      expect(result.toLowerCase()).toMatch(/<fedropshadow\b/);
      expect(result).toContain('stdDeviation="2"');
    });

    it('保留 <use> 与 <symbol>', () => {
      const html = '<svg><symbol id="sym"><circle r="5"/></symbol><use href="#sym"/></svg>';
      const result = sanitizeHtml(html);
      expect(result).toContain('<symbol');
      expect(result).toContain('<use');
    });

    it('保留 <foreignObject>，但 foreignObject 内的 XHTML 标签需要单独白名单', () => {
      const html = '<svg><foreignObject><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject></svg>';
      const result = sanitizeHtml(html);
      expect(result).toContain('<foreignObject>');
      // div 不在通用白名单 → 被剥；这是已知行为（避免 XSS 通过 foreignObject 注入）
      expect(result).not.toMatch(/<div/);
    });

    it('foreignObject 文本节点被保留（HTML_INTEGRATION_POINTS 行为）', () => {
      const html = '<svg><foreignObject>x</foreignObject></svg>';
      const result = sanitizeHtml(html);
      expect(result).toContain('<foreignObject>');
      expect(result).toContain('x');
    });

    it('保留 marker 方向/尺寸与 tspan dy/dx', () => {
      const html = '<svg><defs><marker id="m1" markerWidth="10" markerHeight="10" refX="5" refY="5" orient="auto-start-reverse"><path d="M0,0"/></marker></defs><text><tspan x="0" dy="1.2em">a</tspan></text></svg>';
      const result = sanitizeHtml(html);
      expect(result).toContain('markerWidth="10"');
      expect(result).toContain('refX="5"');
      expect(result).toContain('orient="auto-start-reverse"');
      expect(result).toContain('dy="1.2em"');
    });

    it('保留透明度与虚线属性', () => {
      const html = '<svg><path fill-opacity="0.5" stroke-opacity="0.8" stroke-dasharray="5 5"/></svg>';
      const result = sanitizeHtml(html);
      expect(result).toContain('fill-opacity="0.5"');
      expect(result).toContain('stroke-dasharray="5 5"');
    });
  });
});
