import { ensureSyntaxTree, syntaxTree, syntaxTreeAvailable } from '@codemirror/language';
import { StateEffect, type EditorState, type Extension, StateField } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, ViewPlugin, WidgetType } from '@codemirror/view';
import DOMPurify from 'dompurify';
import { getBlockRender } from './blockRenderCache';
import {
  MERMAID_RENDER_TIMEOUT_MS,
  ensureMermaidInitialized,
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

class MermaidWidget extends WidgetType {
  private readonly source: string;
  private readonly themeId: string;
  private readonly refresh: () => void;
  private readonly nextId: () => string;

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
    return element;
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
      return DOMPurify.sanitize(svg, MERMAID_SANITIZE_OPTIONS);
    }, () => {
      this.refresh();
      if (element.isConnected) this.paint(element);
    });
    if (result.state === 'ready') element.innerHTML = result.html;
    else if (result.state === 'error') {
      element.classList.add('typola-cm6-mermaid-error');
      element.textContent = `Mermaid 渲染失败：${result.message}`;
    } else element.textContent = 'Mermaid 渲染中…';
  }
}

function collectMermaidRanges(state: EditorState): Array<{ from: number; to: number; source: string }> {
  const ranges: Array<{ from: number; to: number; source: string }> = [];
  const tree = ensureSyntaxTree(state, state.doc.length, 1000) ?? syntaxTree(state);
  tree.iterate({ enter(node: any) {
    if (node.name !== 'FencedCode') return;
    const info = node.node.getChild('CodeInfo');
    const code = node.node.getChild('CodeText');
    if (!info || state.doc.sliceString(info.from, info.to).trim().toLowerCase() !== 'mermaid') return;
    const source = code ? state.doc.sliceString(code.from, code.to).trim() : '';
    if (source && !cursorTouches(state, node.from, node.to)) ranges.push({ from: node.from, to: node.to, source });
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
