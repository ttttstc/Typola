// @vitest-environment jsdom
// 缩进 mermaid 块（引用/列表内）源码提取回归：
// CodeText 的文档区间跨行时会夹进行首的 `> ` 引用标记与列表缩进，
// mermaid 容错跳过所有"节点行"后渲染出 16x16 空图；且 replace 范围
// 未覆盖 fence 整行，缩进前缀残留为空行。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { createMarkdownExtensions } from './createMarkdownExtensions';
import { createLivePreviewExtensions } from './createLivePreviewExtensions';

const mermaidRender = vi.hoisted(() => vi.fn(async () => ({
  svg: '<svg data-testid="mermaid-svg"><g><text>ok</text></g></svg>',
})));

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: mermaidRender,
  },
}));

vi.mock('katex', () => ({
  default: {
    renderToString: vi.fn((tex: string, options?: { displayMode?: boolean }) => (
      `<span class="${options?.displayMode ? 'katex-display' : 'katex'}">${tex}</span>`
    )),
  },
}));

function createView(doc: string): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({
    state: EditorState.create({
      doc,
      extensions: createMarkdownExtensions({
        fontFamily: 'monospace',
        fontSize: 14,
        tabSize: 4,
        wordWrap: true,
        extraExtensions: createLivePreviewExtensions(),
      }),
    }),
    parent,
  });
  // 默认光标在 0 会落在顶层块内（cursorTouches 抑制渲染），移到文档末尾。
  view.dispatch({ selection: { anchor: view.state.doc.length } });
  return view;
}

async function waitForMermaidCall(): Promise<string> {
  // 语法树后台解析 + 轮询补全 + 异步渲染链路在 jsdom 下需要 ~800ms。
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (mermaidRender.mock.calls.length > 0) return mermaidRender.mock.calls[0]![1] as string;
    await new Promise((resolve) => window.setTimeout(resolve, 25));
  }
  throw new Error('mermaid.render 未被调用');
}

describe('缩进 mermaid 块源码提取', () => {
  let view: EditorView | null = null;

  afterEach(() => {
    if (view && !view.destroyed) view.destroy();
    view = null;
    document.body.innerHTML = '';
    mermaidRender.mockClear();
  });

  it('顶层 mermaid 块：源码原样传入（回归）', async () => {
    view = createView('```mermaid\ngraph TD\n  A[开始] --> B[结束]\n```\n尾注\n');
    const source = await waitForMermaidCall();
    expect(source).toBe('graph TD\n  A[开始] --> B[结束]');
  });

  it('引用内 mermaid 块：剥离行首 > 标记', async () => {
    // 图内容与顶层用例不同：blockRenderCache 按 source 缓存，相同 source
    // 会命中缓存而不触发新的 render 调用。
    view = createView('> 引导语\n> ```mermaid\n> graph TD\n>   P[引用开始] --> Q[引用结束]\n> ```\n尾注\n');
    const source = await waitForMermaidCall();
    expect(source).toBe('graph TD\n  P[引用开始] --> Q[引用结束]');
  });

  it('列表内缩进 mermaid 块：剥离列表缩进', async () => {
    view = createView('- 项目\n  ```mermaid\n  graph LR\n    A[需求] --> B[上线]\n  ```\n- 下一个\n');
    const source = await waitForMermaidCall();
    expect(source).toBe('graph LR\n  A[需求] --> B[上线]');
  });
});
