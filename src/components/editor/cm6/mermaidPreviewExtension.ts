import { ensureSyntaxTree, syntaxTree, syntaxTreeAvailable } from '@codemirror/language';
import { StateEffect, type EditorState, type Extension, StateField } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, ViewPlugin, WidgetType } from '@codemirror/view';
import DOMPurify from 'dompurify';
import { getBlockRender } from './blockRenderCache';
import {
  MERMAID_RENDER_TIMEOUT_MS,
  ensureMermaidInitialized,
  normalizeMermaidSvgSize,
  normalizeMermaidSvgViewport,
  withTimeout,
} from '../../../services/mermaidRenderer';

// mermaid 11 的 SVG 深度依赖这些结构：内嵌 <style> 承载全部节点配色，
// foreignObject(htmlLabels) 承载 flowchart 节点文本，tspan dy 决定多行
// 文本行距，marker 的方向/尺寸属性决定箭头形态，*-opacity 与
// stroke-dasharray 决定透明度与虚线。DOMPurify 的 svg profile 默认剥掉
// foreignObject（含其内部 html label），导致"图渲染了但节点文本全部消失"。
// 在保留 profile 安全边界的基础上补齐这些 mermaid 必需项。
// 导出供回归测试直接引用，避免测试配置与生产配置漂移。
export const MERMAID_SANITIZE_OPTIONS = {
  USE_PROFILES: { svg: true, svgFilters: true } as const,
  ADD_TAGS: ['foreignObject', 'div', 'span', 'p'],
  ADD_ATTR: [
    'dx', 'dy', 'markerWidth', 'markerHeight', 'markerUnits', 'orient', 'refX', 'refY',
    'fill-opacity', 'stroke-opacity', 'stroke-dasharray', 'stroke-dashoffset',
    'stdDeviation', 'flood-color', 'flood-opacity', 'xmlns',
  ],
  // DOMPurify 的 HTML integration point 默认只有 annotation-xml，比 HTML
  // 规范更严：foreignObject 内的 HTML label 会被整体剥掉。显式把
  // foreignObject 声明为合法集成点（保留默认项；查表用的标签名会先
  // 转小写，故 key 必须写成小写），放行其内部 html 文本。
  HTML_INTEGRATION_POINTS: { 'annotation-xml': true, foreignobject: true },
};

function cursorTouches(state: EditorState, from: number, to: number): boolean {
  return state.selection.ranges.some((range) => range.from <= to && range.to >= from);
}

/**
 * 从 FencedCode 节点提取 mermaid 源码（逐行重建）。
 *
 * 不能依赖 `getChild('CodeText')` 的文档区间：块被引用/列表缩进时，
 * CodeText 跨行区间会夹进行首的 `> ` 标记与列表缩进，且部分场景只
 * 覆盖到首行——mermaid 容错跳过所有"节点行"后渲染出 16x16 空图。
 * 这里按行取 FencedCode 覆盖范围的文本，剥掉引用标记与 fence 行，
 * 再去掉公共缩进，得到与顶层块等价的干净源码。
 */
export function extractMermaidSource(state: EditorState, nodeFrom: number, nodeTo: number): string {
  const { doc } = state;
  const firstLine = doc.lineAt(nodeFrom);
  const lastLine = doc.lineAt(nodeTo);
  const lines: string[] = [];
  for (let number = firstLine.number; number <= lastLine.number; number += 1) {
    const line = doc.line(number);
    // 剥离行首引用标记（支持嵌套 `> >`）；列表缩进交给公共缩进剥离。
    const text = line.text.replace(/^\s*(?:>\s?)+/, '');
    const isFence = /^\s*(```|~~~)\s*$/.test(text);
    const isFirstFence = number === firstLine.number;
    const isLastFence = number === lastLine.number && isFence;
    if (isFirstFence || isLastFence) continue;
    if (number === lastLine.number && isFence) continue;
    lines.push(text);
  }
  // 去掉非空行的公共前导空格（列表/嵌套缩进），保持图内相对缩进。
  const indents = lines
    .filter((line) => line.trim().length > 0)
    .map((line) => line.match(/^ */)![0].length);
  const minIndent = indents.length > 0 ? Math.min(...indents) : 0;
  return lines
    .map((line) => line.slice(minIndent).trimEnd())
    .join('\n')
    .trim();
}

// 缩放范围与步长（对标 Typora 的 Ctrl+滚轮缩放）。
const MERMAID_ZOOM_MIN = 0.5;
const MERMAID_ZOOM_MAX = 4;
const MERMAID_ZOOM_STEP = 1.15;

class MermaidWidget extends WidgetType {
  private readonly source: string;
  private readonly themeId: string;
  private readonly refresh: () => void;
  private readonly nextId: () => string;
  // 当前缩放倍率（会话内记忆，不持久化）；1 = 原始尺寸。
  private scale = 1;
  // SVG 原始宽度（px），首次缩放/绘制时计算缓存。
  private naturalWidth = 0;

  constructor(
    source: string, themeId: string, refresh: () => void, nextId: () => string,
  ) {
    super();
    this.source = source;
    this.themeId = themeId;
    this.refresh = refresh;
    this.nextId = nextId;
  }

  eq(other: MermaidWidget): boolean { return other.source === this.source && other.themeId === this.themeId; }

  toDOM(): HTMLElement {
    const element = document.createElement('div');
    element.className = 'typola-cm6-mermaid';
    this.paint(element);
    this.attachZoom(element);
    this.attachZoomControls(element);
    this.attachClickToEdit(element);
    return element;
  }

  /**
   * 单击图表进入源码编辑（对齐 Typora）：把光标放到 fence 后第一行行首，
   * cursorTouches 命中 → 块还原为源码，用户直接改 mermaid 代码，
   * 光标离开后自动重新渲染。block replace widget 本身没有可定位的内部
   * 位置，不拦截 mousedown 的话 CM6 会把光标弹到块外，点图无法编辑。
   */
  private attachClickToEdit(element: HTMLElement): void {
    element.addEventListener('mousedown', (event) => {
      if (event.button !== 0) return;
      const view = EditorView.findFromDOM(element);
      if (!view) return;
      event.preventDefault();
      // posAtDOM 对 block widget 返回块起点（fence 行行首）。
      const pos = view.posAtDOM(element);
      const fenceLine = view.state.doc.lineAt(pos);
      const target = Math.min(fenceLine.to + 1, view.state.doc.length);
      view.dispatch({ selection: { anchor: target } });
      view.focus();
    });
  }

  /**
   * Ctrl+滚轮缩放图（capture + stopImmediatePropagation 拦截编辑器的
   * Ctrl+滚轮字号缩放）。不做双击复位——双击手势已被 CM6 用作"进入
   * 源码编辑"，绑定复位会导致图表展开为源码。
   */
  private attachZoom(element: HTMLElement): void {
    element.addEventListener('wheel', (event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.setScale(element, this.scale * (event.deltaY < 0 ? MERMAID_ZOOM_STEP : 1 / MERMAID_ZOOM_STEP));
    }, { passive: false, capture: true });
  }

  /**
   * hover 显示的缩放控件组（右上角）：−/＋/适宽/1:1。缩放语义与
   * Ctrl+滚轮一致（改 SVG 显式宽度，容器横向滚动承接放大溢出）。
   * 按钮的 mousedown 阻断冒泡，避免触发"单击进源码编辑"。
   */
  private attachZoomControls(element: HTMLElement): void {
    const controls = document.createElement('div');
    controls.className = 'typola-cm6-mermaid-zoom';
    const mkButton = (label: string, title: string, onClick: () => void) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'typola-cm6-mermaid-zoom-button';
      button.textContent = label;
      button.title = title;
      button.setAttribute('aria-label', title);
      button.addEventListener('mousedown', (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      });
      return button;
    };
    controls.append(
      mkButton('−', '缩小', () => this.setScale(element, this.scale / MERMAID_ZOOM_STEP)),
      mkButton('＋', '放大', () => this.setScale(element, this.scale * MERMAID_ZOOM_STEP)),
      mkButton('适宽', '缩放到容器宽度', () => this.fitToWidth(element)),
      mkButton('1:1', '恢复原始尺寸', () => this.setScale(element, 1)),
    );
    element.append(controls);
  }

  /** 统一缩放入口：clamp 后按倍率改写 SVG 显式宽度。 */
  private setScale(element: HTMLElement, next: number): void {
    this.scale = Math.min(MERMAID_ZOOM_MAX, Math.max(MERMAID_ZOOM_MIN, next));
    this.applyScale(element);
  }

  /** 适宽：把图缩放到容器内容宽度（不放大超过原始尺寸时也可小于 1）。 */
  private fitToWidth(element: HTMLElement): void {
    if (!this.resolveNaturalWidth(element)) return;
    // clientWidth 含左右 padding（14px×2）与边框，扣掉后是内容可用宽。
    const available = element.clientWidth - 28 - 2;
    if (available <= 0) return;
    this.setScale(element, available / this.naturalWidth);
  }

  /** 归一后的 SVG 带显式 width 属性；viewBox 宽度兜底。缓存到 naturalWidth。 */
  private resolveNaturalWidth(element: HTMLElement): boolean {
    if (this.naturalWidth) return true;
    const svg = element.querySelector('svg');
    if (!svg) return false;
    const fromAttr = Number(svg.getAttribute('width')?.match(/^([\d.]+)(?:px)?$/)?.[1]);
    const fromViewBox = Number(svg.getAttribute('viewBox')?.match(/^[\d.-]+\s+[\d.-]+\s+([\d.]+)/)?.[1]);
    const natural = Number.isFinite(fromAttr) && fromAttr > 0 ? fromAttr : fromViewBox;
    if (!Number.isFinite(natural) || natural <= 0) return false;
    this.naturalWidth = natural;
    return true;
  }

  /** 按倍率调整 SVG 显式宽度（height:auto 保持纵横比，布局自然撑开）。 */
  private applyScale(element: HTMLElement): void {
    const svg = element.querySelector('svg');
    if (!svg) return;
    if (!this.resolveNaturalWidth(element)) return;
    if (Math.abs(this.scale - 1) <= 0.01) {
      // 1:1 = 归一后的自然尺寸（width 属性），清除覆盖样式即可。
      svg.style.removeProperty('width');
    } else {
      svg.style.width = `${Math.round(this.naturalWidth * this.scale)}px`;
    }
    element.classList.toggle('typola-cm6-mermaid-scaled', Math.abs(this.scale - 1) > 0.01);
    // 缩放改变块高度，必须通知 CM6 重新测量（否则滚动出现幻影空白）。
    this.requestMeasure(element);
  }

  /**
   * 异步渲染结果写入 widget 时保留缩放控件。
   *
   * 控件在首次 loading 状态后才挂载；直接 innerHTML 会把它们连同
   * loading 文案一起清掉，导致异步渲染完成后 hover 控件消失。
   */
  private setRenderedHtml(element: HTMLElement, html: string): void {
    const controls = element.querySelector('.typola-cm6-mermaid-zoom');
    if (!controls) {
      element.innerHTML = html;
      return;
    }
    for (const child of Array.from(element.childNodes)) {
      if (child !== controls) child.remove();
    }
    controls.insertAdjacentHTML('beforebegin', html);
    const svg = element.querySelector('svg');
    if (svg) normalizeMermaidSvgViewport(svg, { naturalSize: true });
  }

  /** widget 异步变高后必须 requestMeasure，否则 heightmap 失同步。 */
  private requestMeasure(element: HTMLElement): void {
    try {
      EditorView.findFromDOM(element)?.requestMeasure();
    } catch {
      // jsdom 等环境下找不到 view 时忽略。
    }
  }

  private paint(element: HTMLElement): void {
    const theme = this.themeId.includes('dark') ? 'dark' : 'default';
    const result = getBlockRender('mermaid', this.source, this.themeId, async () => {
      const mermaidModule = await ensureMermaidInitialized(theme);
      // mermaid.render 挂起时由超时兜底转成可展示的错误，而不是永远"渲染中…"。
      const { svg } = await withTimeout(
        mermaidModule.default.render(this.nextId(), this.source),
        MERMAID_RENDER_TIMEOUT_MS,
      );
      // 归一为自然尺寸（显式 width）：图不再被 useMaxWidth 压进容器宽，
      // 超宽由容器横向滚动承接；缩放控件/Ctrl+滚轮按倍率改写 width。
      return normalizeMermaidSvgSize(DOMPurify.sanitize(svg, MERMAID_SANITIZE_OPTIONS));
    }, () => {
      this.refresh();
      if (element.isConnected) this.paint(element);
    });
    if (result.state === 'ready') {
      this.setRenderedHtml(element, result.html);
      // SVG 异步到达会撑高 widget：立即重放当前缩放并通知测量，
      // 避免 heightmap 停留在"渲染中…"的单行高度。
      this.applyScale(element);
      this.requestMeasure(element);
    } else if (result.state === 'error') {
      element.classList.add('typola-cm6-mermaid-error');
      element.textContent = `Mermaid 渲染失败：${result.message}`;
      this.requestMeasure(element);
    } else element.textContent = 'Mermaid 渲染中…';
  }
}

function collectMermaidRanges(state: EditorState): Array<{ from: number; to: number; source: string }> {
  const ranges: Array<{ from: number; to: number; source: string }> = [];
  const tree = ensureSyntaxTree(state, state.doc.length, 1000) ?? syntaxTree(state);
  tree.iterate({ enter(node: any) {
    if (node.name !== 'FencedCode') return;
    // 语言标记从 fence 行文本解析（剥引用标记后取 ``` 后的内容），
    // 不依赖 CodeInfo 子节点——缩进场景下其范围同样不可靠。
    const firstLine = state.doc.lineAt(node.from);
    const fenceInfo = firstLine.text
      .replace(/^\s*(?:>\s?)+/, '')
      .match(/^\s*(```|~~~)\s*([^\s`]*)/);
    const language = fenceInfo?.[2]?.trim().toLowerCase() ?? '';
    if (language !== 'mermaid') return;
    const source = extractMermaidSource(state, node.from, node.to);
    if (source && !cursorTouches(state, node.from, node.to)) {
      // 注意 from 不扩展到行首：引用内 fence 行行首的 `> ` 已由 inlinePreview
      // 的 QuoteMark 装饰隐藏，block replace 覆盖它会造成装饰重叠冲突
      // （widget 整体消失）。`> `/列表缩进残留的空行框（~一行高）可接受。
      ranges.push({ from: node.from, to: node.to, source });
    }
  } });
  return ranges;
}

function buildMermaidDecorations(state: EditorState, themeId: string, nextId: () => string): DecorationSet {
  return Decoration.set(collectMermaidRanges(state).map(({ from, to, source }) =>
    Decoration.replace({ widget: new MermaidWidget(source, themeId, () => {}, nextId), block: true }).range(from, to),
  ), true);
}

// 语法树补全后触发 StateField 重算的信号：解析完成本身不产生文档事务，
// StateField 需要外部信号（轮询 dispatch 的 effect）才能感知。
const mermaidRescanEffect = StateEffect.define<null>();

// 判定解析是否覆盖到文档末尾。注意 syntaxTree()（field.tree）只反映
// 上次事务时 LanguageState 的快照，后台解析推进的是 ParseContext，
// 两者可能不一致——必须用基于 context 的 syntaxTreeAvailable。
function isSyntaxTreeComplete(state: EditorState): boolean {
  return syntaxTreeAvailable(state, state.doc.length);
}

// 大文档下 lezer 渐进解析在 StateField 首次重算（create/事务）时可能尚未
// 完成：ensureSyntaxTree 同步等待超时后只能拿到部分树，mermaid 块识别
// 结果为空；而树后续补全不产生文档事务（ParseWorker 仅在推进完成时经
// Language.setState 广播，且空闲时只推进到视口下方约 10 万字符、无焦点
// 时干脆不开工）——打开文档后不做任何操作时图都不渲染。
// 这里用低频轮询直接推进 ParseContext 解析到文档末尾（每 tick 约 40ms
// 预算，不依赖焦点与视口），解析覆盖完成后 dispatch 一个携带
// mermaidRescanEffect 的空 transaction 触发重算（重算内部会用
// ensureSyntaxTree 直接读取已推进的 context）；树已完整或超过 3s 仍未
// 完成则停止，避免空转与死循环（树完整后轮询不再启动，重算也不会
// 再推进解析）。
const mermaidSyntaxRescanPlugin = ViewPlugin.fromClass(class {
  private readonly view: EditorView;
  private timer: number | null = null;
  private deadline = 0;

  constructor(view: EditorView) {
    this.view = view;
    this.schedule();
  }

  update(): void {
    // 任何事务（编辑/选区/配置）后重新评估解析完整性，不完整则启动
    // （或维持）轮询；超时放弃后，下一次事务仍有机会重新调度。
    this.schedule();
  }

  destroy(): void {
    this.stop();
  }

  private schedule(): void {
    if (isSyntaxTreeComplete(this.view.state) || this.timer !== null) return;
    this.deadline = Date.now() + 3000;
    this.timer = window.setInterval(() => {
      if (isSyntaxTreeComplete(this.view.state)) {
        this.stop();
        this.view.dispatch({ effects: mermaidRescanEffect.of(null) });
        return;
      }
      if (Date.now() > this.deadline) {
        this.stop();
        return;
      }
      // 主动推进解析（直接作用在 ParseContext 上，每 tick 约 40ms 预算，
      // 不依赖编辑器焦点、视口，也不产生空事务开销）。
      ensureSyntaxTree(this.view.state, this.view.state.doc.length, 40);
    }, 50);
  }

  private stop(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }
});

export function mermaidPreviewExtension(themeId = 'light'): Extension {
  let renderCount = 0;
  const nextId = () => `typola-cm6-mermaid-${renderCount++}`;
  const mermaidField = StateField.define<DecorationSet>({
    create(state) {
      return buildMermaidDecorations(state, themeId, nextId);
    },
    update(decorations, transaction) {
      if (
        transaction.docChanged || transaction.selection || transaction.reconfigured
        || transaction.effects.some((effect) => effect.is(mermaidRescanEffect))
        // ParseWorker/forceParsing 后台推进语法树不改变文档与选区，
        // 但树长度会增长——此时 mermaid 块识别结果可能从空变为非空，
        // 必须重算（打开文档后不做任何操作时所有图都不渲染的根因）。
        || syntaxTree(transaction.startState).length !== syntaxTree(transaction.state).length
      ) {
        return buildMermaidDecorations(transaction.state, themeId, nextId);
      }
      return decorations;
    },
    provide: (field) => EditorView.decorations.from(field),
  });
  return [mermaidField, mermaidSyntaxRescanPlugin];
}
