import { beforeEach, describe, expect, it } from 'vitest';

// 真实渲染诊断测试：不 mock mermaid，用真实 mermaid 11 渲染 8 种图型，
// 验证渲染产物中的关键 SVG 结构（<style>、foreignObject、marker），
// 以及两条 sanitize 管线（CM6 的 DOMPurify 配置 / sanitizeService 白名单）
// 与 Vditor 双管线短路是否破坏渲染结果。
// 这些用例对应"所有 mermaid 图无法渲染"的真实故障点定位与回归保护。

// jsdom 未实现 SVG 几何测量 API（getBBox / getComputedTextLength）与
// canvas 2d context，mermaid 的布局阶段强依赖它们。这里给测试环境补
// 最小 stub（返回非零的合理尺寸，避免布局引擎退化），仅影响测试环境，
// 生产代码无感知。
declare global {
  interface SVGElement {
    getBBox?(): DOMRect;
    getComputedTextLength?(): number;
  }
}

if (typeof SVGElement.prototype.getBBox !== 'function') {
  SVGElement.prototype.getBBox = () => ({ x: 0, y: 0, width: 120, height: 40 }) as DOMRect;
}
if (typeof SVGElement.prototype.getComputedTextLength !== 'function') {
  SVGElement.prototype.getComputedTextLength = () => 80;
}

const canvasPrototype = HTMLCanvasElement.prototype as HTMLCanvasElement & {
  getContext: (type: string) => unknown;
};
const nativeGetContext = canvasPrototype.getContext;
canvasPrototype.getContext = function getContextStub(type: string, ...rest: unknown[]) {
  if (type === '2d') {
    // mermaid（mindmap 等）用 2d canvas 测量文本宽度。
    return { measureText: (text: string) => ({ width: text.length * 8 }) };
  }
  return nativeGetContext.call(this, type, ...rest);
} as typeof canvasPrototype.getContext;

const DIAGRAM_CASES: Array<{ name: string; source: string; expectMarker: boolean }> = [
  {
    name: 'flowchart',
    source: 'flowchart TD\n    A[开始] --> B{判断}\n    B -->|是| C[结束]\n    B -->|否| A',
    expectMarker: true,
  },
  {
    name: 'sequenceDiagram',
    source: 'sequenceDiagram\n    Alice->>Bob: 你好\n    Bob-->>Alice: 很好',
    expectMarker: true,
  },
  {
    name: 'classDiagram',
    source: 'classDiagram\n    class Animal {\n        +String name\n        +makeSound()\n    }\n    Animal <|-- Dog',
    expectMarker: true,
  },
  {
    name: 'stateDiagram-v2',
    source: 'stateDiagram-v2\n    [*] --> 活跃\n    活跃 --> [*]',
    expectMarker: true,
  },
  {
    name: 'mindmap',
    source: 'mindmap\n    root((根节点))\n        分支一\n            叶子1\n            叶子2\n        分支二',
    expectMarker: false,
  },
  {
    name: 'timeline',
    source: 'timeline\n    title 项目时间线\n    section 2026\n        Q1 : 需求\n        Q2 : 开发',
    expectMarker: false,
  },
  {
    name: 'pie',
    source: 'pie title 占比\n    "A" : 40\n    "B" : 60',
    expectMarker: false,
  },
  {
    name: 'gantt',
    source: 'gantt\n    title 示例甘特图\n    dateFormat YYYY-MM-DD\n    section 交付\n    任务1 :a1, 2026-01-01, 30d',
    expectMarker: false,
  },
];

function createMermaidContainer(source: string): HTMLElement {
  const container = document.createElement('div');
  const code = document.createElement('code');
  code.className = 'language-mermaid';
  code.textContent = source;
  const pre = document.createElement('pre');
  pre.appendChild(code);
  container.appendChild(pre);
  document.body.appendChild(container);
  return container;
}

// 真实浏览器中 mermaid 11 输出的箭头 marker 与 tspan 行距结构样本，
// 用于验证两条 sanitize 管线不会剥掉这些属性（jsdom 下渲染的 marker
// 属性不全，故用标准结构样本做属性级断言）。
const MARKER_ATTR_PROBE = [
  '<svg><defs>',
  '<marker id="m1" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto" markerUnits="strokeWidth">',
  '<path d="M 0 0 L 10 5 L 0 10 z" fill-opacity="1" stroke-opacity="1"></path>',
  '</marker></defs>',
  '<g><text><tspan x="1" dy="1.2em">a</tspan></text>',
  '<path stroke-dasharray="5" stroke-opacity="0.5" fill-opacity="0.2"></path></g></svg>',
].join('');

describe('mermaid 真实渲染诊断（jsdom + 真实 mermaid 11）', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.querySelectorAll('script#vditorMermaidScript').forEach((el) => el.remove());
  });

  it.each(DIAGRAM_CASES)('预览链路渲染 %s 并保留关键 SVG 结构', async ({ source, expectMarker }) => {
    const { renderMermaidIn } = await import('./mermaidRenderer');
    const container = createMermaidContainer(source);
    await renderMermaidIn(container);

    const graph = container.querySelector('.typola-mermaid');
    expect(graph, `mermaid 渲染失败，容器内容：${container.innerHTML}`).toBeTruthy();
    const svg = graph?.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(graph?.querySelector('.typola-mermaid-error')).toBeNull();

    // mermaid 11 的节点/文本样式全部依赖内嵌 <style>，剥掉即文本错位、配色丢失。
    expect(graph?.querySelector('style'), `${source} 的 SVG 缺少 <style>`).toBeTruthy();

    if (expectMarker) {
      // 箭头 marker 定义（mermaid 11 输出在 <defs> 或根 <g> 下），缺少则连线端点丢失箭头。
      expect(svg?.querySelector('marker'), `${source} 的 SVG 缺少 marker`).toBeTruthy();
    }
  });

  it('CM6 链路的 DOMPurify 配置保留 mermaid SVG 的全部关键结构', async () => {
    const { renderMermaidIn } = await import('./mermaidRenderer');
    const { MERMAID_SANITIZE_OPTIONS } = await import('../components/editor/cm6/mermaidPreviewExtension');
    const DOMPurify = (await import('dompurify')).default;

    // flowchart 默认 htmlLabels：节点文本位于 foreignObject 内的 html 元素里，
    // DOMPurify svg profile 会把 foreignObject 及其内容整体剥掉——节点文本全部消失。
    const container = createMermaidContainer(DIAGRAM_CASES[0].source);
    await renderMermaidIn(container);
    const rawSvg = container.querySelector('.typola-mermaid svg')!.outerHTML;
    expect(rawSvg).toContain('foreignObject');

    const sanitized = DOMPurify.sanitize(rawSvg, MERMAID_SANITIZE_OPTIONS);
    const holder = document.createElement('div');
    holder.innerHTML = sanitized;

    expect(holder.querySelectorAll('style')).toHaveLength(1);
    expect(holder.querySelectorAll('path[d]').length).toBeGreaterThan(0);
    expect(holder.querySelectorAll('[marker-end]').length).toBeGreaterThan(0);

    // jsdom 的 querySelector 对 SVG→HTML 跨命名空间后代选择器支持不完整
    // （'foreignObject div' 匹配不到），用 DOM 遍历断言 foreignObject 内
    // 的 html label（div>span）完整保留。
    const foreignObjects = Array.from(holder.querySelectorAll('foreignObject'));
    expect(foreignObjects.length).toBeGreaterThan(0);
    const withHtmlLabel = foreignObjects.filter((fo) => {
      const label = fo.firstElementChild;
      return label?.namespaceURI === 'http://www.w3.org/1999/xhtml' && label.children.length > 0;
    });
    expect(withHtmlLabel.length).toBeGreaterThan(0);
    expect(sanitized).toContain('<div');
    expect(sanitized).toContain('nodeLabel');

    // marker 方向/尺寸、tspan 行距、透明度与虚线属性的属性级回归。
    const probe = DOMPurify.sanitize(MARKER_ATTR_PROBE, MERMAID_SANITIZE_OPTIONS);
    expect(probe).toContain('refX="9"');
    expect(probe).toContain('refY="5"');
    expect(probe).toContain('markerWidth="8"');
    expect(probe).toContain('markerHeight="8"');
    expect(probe).toContain('orient="auto"');
    expect(probe).toContain('markerUnits="strokeWidth"');
    expect(probe).toContain('dy="1.2em"');
    expect(probe).toContain('stroke-dasharray="5"');
    expect(probe).toContain('fill-opacity="0.2"');
    expect(probe).toContain('stroke-opacity="0.5"');
  });

  it('CM6 链路的 DOMPurify 配置仍剥离脚本与事件处理器', async () => {
    const { MERMAID_SANITIZE_OPTIONS } = await import('../components/editor/cm6/mermaidPreviewExtension');
    const DOMPurify = (await import('dompurify')).default;

    const evil = '<svg><script>alert(1)</script><g onclick="alert(2)"><foreignObject><div onclick="alert(3)">x</div></foreignObject></g></svg>';
    const sanitized = DOMPurify.sanitize(evil, MERMAID_SANITIZE_OPTIONS);
    expect(sanitized).not.toContain('<script');
    expect(sanitized).not.toContain('onclick');
  });

  it('导出链路的 sanitizeService 白名单保留 mermaid SVG 的全部关键结构', async () => {
    const { renderMermaidIn } = await import('./mermaidRenderer');
    const { sanitizeHtml } = await import('./sanitizeService');

    const container = createMermaidContainer(DIAGRAM_CASES[0].source);
    await renderMermaidIn(container);
    const rawSvg = container.querySelector('.typola-mermaid svg')!.outerHTML;

    const sanitized = sanitizeHtml(rawSvg);
    const holder = document.createElement('div');
    holder.innerHTML = sanitized;

    // <style> 承载 mermaid 全部配色；<filter>/<feDropShadow> 提供阴影；
    // foreignObject 内是 flowchart 节点文本；marker-end 引用决定箭头。
    expect(holder.querySelectorAll('style')).toHaveLength(1);
    expect(holder.querySelectorAll('filter').length).toBeGreaterThan(0);
    expect(holder.querySelectorAll('fedropshadow').length).toBeGreaterThan(0);
    expect(holder.querySelectorAll('foreignObject').length).toBeGreaterThan(0);
    expect(holder.querySelectorAll('[marker-end]').length).toBeGreaterThan(0);

    const probe = sanitizeHtml(MARKER_ATTR_PROBE);
    expect(probe).toContain('refX="9"');
    expect(probe).toContain('refY="5"');
    expect(probe).toContain('markerWidth="8"');
    expect(probe).toContain('markerHeight="8"');
    expect(probe).toContain('orient="auto"');
    expect(probe).toContain('dy="1.2em"');
    expect(probe).toContain('stroke-dasharray="5"');
    expect(probe).toContain('fill-opacity="0.2"');
    expect(probe).toContain('stroke-opacity="0.5"');

    // 安全边界不变：脚本与事件处理器仍然被剥。
    const evil = '<svg><script>alert(1)</script><style>a{}</style><g onclick="alert(2)"></g></svg>';
    const sanitizedEvil = sanitizeHtml(evil);
    expect(sanitizedEvil).toContain('<style');
    expect(sanitizedEvil).not.toContain('<script');
    expect(sanitizedEvil).not.toContain('onclick');
  });

  it('预览链路插入 Vditor mermaid 脚本占位，短路双管线竞争且幂等', async () => {
    const { disableVditorMermaidPipeline } = await import('../components/PreviewPane');

    disableVditorMermaidPipeline();
    const placeholder = document.getElementById('vditorMermaidScript');
    expect(placeholder).toBeTruthy();
    // 占位 script 不带 src：Vditor 的 addScript 以 id 去重，检测到已存在
    // 即直接 resolve，不会真正加载自带的 mermaid 11.6（loose）。
    expect(placeholder?.getAttribute('src')).toBeNull();

    // 幂等：重复调用不会堆叠占位节点。
    disableVditorMermaidPipeline();
    expect(document.querySelectorAll('script#vditorMermaidScript')).toHaveLength(1);
  });
});
