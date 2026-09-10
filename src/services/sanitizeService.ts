import DOMPurify from 'dompurify';

const ALLOWED_TAGS = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'br', 'hr',
  'strong', 'b', 'em', 'i', 'u', 's', 'mark', 'sup', 'sub',
  'blockquote', 'pre', 'code',
  'ul', 'ol', 'li',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
  'div', 'span',
  'a', 'img',
  'details', 'summary',
  'svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
  'text', 'tspan', 'defs', 'marker', 'pattern', 'clipPath', 'linearGradient', 'stop',
  'foreignObject',
  // mermaid 11 的 SVG 依赖：<style> 承载全部节点配色，<filter>/<feDropShadow>
  // 提供阴影，<use>/<symbol> 支持图标引用。剥掉会导致导出/Word 预览图劣化。
  'style', 'filter', 'fedropshadow', 'use', 'symbol',
];

const ALLOWED_ATTR = [
  'href', 'src', 'alt', 'title',
  'colspan', 'rowspan',
  'align', 'width', 'height',
  'class', 'id',
  'xmlns', 'viewBox', 'd', 'x', 'y', 'x1', 'x2', 'y1', 'y2', 'cx', 'cy', 'r', 'rx', 'ry',
  'points', 'transform', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
  'marker-end', 'marker-start', 'text-anchor', 'dominant-baseline', 'font-size', 'font-family',
  'style', 'offset', 'stop-color', 'clip-path',
  // SVG 文本行距（tspan dy/dx）、箭头 marker 方向/尺寸、透明度与虚线样式，
  // 缺失会导致 mermaid 图文本重叠、箭头残缺。filter 相关属性供阴影节点使用。
  'dx', 'dy', 'refX', 'refY', 'markerWidth', 'markerHeight', 'markerUnits', 'orient',
  'fill-opacity', 'stroke-opacity', 'stroke-dasharray', 'stroke-dashoffset',
  'stdDeviation', 'flood-color', 'flood-opacity',
];

export function sanitizeHtml(html: string): string {
  const sanitized = DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
  });
  return removeNonSvgStyles(sanitized);
}

// <style> 仅为 mermaid SVG 的节点配色放行(见 ALLOWED_TAGS 注释);清洗后
// 显式移除不位于 <svg> 内的 <style> 节点与 style 属性,普通 Markdown/HTML
// 的 <style> 注入面不因 SVG 兼容改动而扩大。
function removeNonSvgStyles(html: string): string {
  const template = document.createElement('template');
  template.innerHTML = html;
  template.content.querySelectorAll<HTMLElement>('[style]').forEach((element) => {
    if (!element.closest('svg')) element.removeAttribute('style');
  });
  template.content.querySelectorAll('style').forEach((element) => {
    if (!element.closest('svg')) element.remove();
  });
  return template.innerHTML;
}
