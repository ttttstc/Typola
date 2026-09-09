import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

// 门控用结构性标签:浏览器复制"纯文本"时也常附带 text/html(通常是
// <p>/<span> 的样式包装),一律转换会把纯文本粘贴变成 Markdown 重排。
// 只有 HTML 里真的出现这些结构性标签时才值得走 HTML → Markdown 转换,
// 否则返回 null,调用方继续走纯文本链路。
const STRUCTURAL_TAG_RE = /<(?:table|pre|code|img|a|strong|b|em|i|del|s|h[1-6]|ul|ol|blockquote|hr)\b/iu;

let converter: TurndownService | null = null;

function getConverter(): TurndownService {
  if (converter) return converter;
  const service = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*',
    strongDelimiter: '**',
  });
  // gfm 组合提供表格/删除线/task list/代码高亮围栏规则。
  service.use(gfm);
  converter = service;
  return service;
}

/**
 * turndown 的列表规则在标记后输出 2-3 个空格(`-   item`)。GFM 下合法
 * 但与 Typola 的 `- item` 习惯不一致;这里把标记后的多余空格收敛为一个。
 * 代码围栏内的行原样保留,避免破坏粘贴的代码内容。
 */
function normalizeListMarkerSpacing(markdown: string): string {
  let inFence = false;
  return markdown
    .split('\n')
    .map((line) => {
      if (/^\s*(?:```|~~~)/u.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return line;
      return line.replace(/^(\s*(?:[-*+]|\d{1,9}\.)) {2,}/u, '$1 ');
    })
    .join('\n');
}

/**
 * 富文本 HTML 粘贴转 Markdown。
 * 命中结构性标签门控才转换;纯文本包装(<p>/<span>)、空输入或转换失败
 * 返回 null,调用方走默认纯文本粘贴。
 */
export function convertHtmlPasteToMarkdown(html: string): string | null {
  const trimmed = html.trim();
  if (!trimmed) return null;
  if (!STRUCTURAL_TAG_RE.test(trimmed)) return null;
  try {
    const markdown = getConverter().turndown(trimmed).trim();
    if (!markdown) return null;
    return normalizeListMarkerSpacing(markdown);
  } catch {
    return null;
  }
}
