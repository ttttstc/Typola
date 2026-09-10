import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { createMarkdownExtensions } from './createMarkdownExtensions';
import {
  createLivePreviewCompartments,
  createLivePreviewExtensions,
  reconfigureLivePreviewExtensions,
} from './createLivePreviewExtensions';
import { reviewMarkExtension } from './reviewMarkExtension';
import { applyCm6Format } from '../../../services/editor/cm6FormatService';
import type { FormatAction } from '../../EditorContextMenu';

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async () => ({
      svg: '<svg data-testid="mermaid-svg"><script>alert(1)</script><g><text>ok</text></g></svg>',
    })),
  },
}));

vi.mock('katex', () => ({
  default: {
    renderToString: vi.fn((tex: string, options?: { displayMode?: boolean }) => {
      const className = options?.displayMode ? 'katex-display' : 'katex';
      return `<span class="${className}">${tex}</span>`;
    }),
  },
}));

// 注入"打开文档时语法树尚未解析到 mermaid 块"的场景：mermaid 扩展的
// collectMermaidRanges 首次调用 ensureSyntaxTree 时返回 null（模拟
// ensureSyntaxTree 同步等待超时），只能回退到覆盖前 ~3000 字符的 init
// 局部树。仅拦截来自 mermaidPreviewExtension 的调用，其余调用方走真实实现。
const mermaidTreeDelay = vi.hoisted(() => ({ pending: 0 }));

vi.mock('@codemirror/language', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@codemirror/language')>();
  return {
    ...actual,
    ensureSyntaxTree: (
      state: Parameters<typeof actual.ensureSyntaxTree>[0],
      upto: number,
      timeout: number,
    ) => {
      const fromMermaid = new Error().stack?.includes('mermaidPreviewExtension') ?? false;
      if (fromMermaid && mermaidTreeDelay.pending > 0) {
        mermaidTreeDelay.pending -= 1;
        return null;
      }
      return actual.ensureSyntaxTree(state, upto, timeout);
    },
  };
});

function createView(doc: string, livePreview: boolean): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  return new EditorView({
    state: EditorState.create({
      doc,
      extensions: createMarkdownExtensions({
        fontFamily: 'monospace',
        fontSize: 14,
        tabSize: 4,
        wordWrap: true,
        extraExtensions: livePreview ? createLivePreviewExtensions() : undefined,
      }),
    }),
    parent,
  });
}

function moveCursorToEnd(view: EditorView): void {
  view.dispatch({ selection: { anchor: view.state.doc.length } });
}

function destroyView(view: EditorView): void {
  const parent = view.dom.parentElement;
  view.destroy();
  parent?.remove();
}

async function waitForElement(selector: string): Promise<Element> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const element = document.querySelector(selector);
    if (element) return element;
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  }
  throw new Error(`Timed out waiting for ${selector}`);
}

describe('createMarkdownExtensions live preview', () => {
  let view: EditorView | null = null;

  afterEach(() => {
    if (view && !view.destroyed) destroyView(view);
    view = null;
    document.body.innerHTML = '';
  });

  it('keeps source mode plain when livePreview is disabled', () => {
    view = createView('- [x] done\n\n![img](https://example.com/a.png)', false);

    expect(view.contentDOM.querySelector('.cm-atomic-task-checkbox')).toBeNull();
    expect(view.contentDOM.querySelector('.cm-atomic-image')).toBeNull();
  });

  it('renders task list, table, and image widgets when livePreview is enabled', () => {
    view = createView([
      '- [x] done',
      '',
      '| A | B |',
      '| --- | --- |',
      '| 1 | 2 |',
      '',
      '![img](https://example.com/a.png)',
    ].join('\n'), true);
    moveCursorToEnd(view);

    expect(view.contentDOM.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(true);
    expect(view.contentDOM.querySelector('.tbl-table-widget .tbl-table')).not.toBeNull();
    expect(view.contentDOM.querySelector<HTMLImageElement>('.cm-atomic-image img')?.src).toBe('https://example.com/a.png');
  });

  it('sanitizes inline raw HTML widgets', () => {
    view = createView('<mark onclick="alert(1)">重点</mark> <sup>2</sup>', true);
    moveCursorToEnd(view);
    const html = view.contentDOM.querySelector('.typola-cm6-html');
    expect(html?.querySelector('mark')?.textContent).toBe('重点');
    expect(html?.querySelector('[onclick]')).toBeNull();
  });

  it.each([
    '<details><summary>x</summary><script>alert(1)</script></details>',
    '<mark onerror="alert(1)">x</mark>',
    '<mark><a href="javascript:alert(1)">x</a></mark>',
  ])('does not expose dangerous HTML nodes: %s', (source) => {
    view = createView(`${source}\nAfter`, true);
    moveCursorToEnd(view);
    const html = view.contentDOM.querySelector('.typola-cm6-html');
    expect(html?.querySelector('script, iframe, [onerror], [onclick], a[href^="javascript:"]')).toBeNull();
  });

  it('renders bare inline math with KaTeX outside the cursor range', async () => {
    view = createView('Energy $E=mc^2$ here', true);
    moveCursorToEnd(view);

    const inlineMath = view.contentDOM.querySelector<HTMLElement>('.typola-cm6-math-inline');
    expect(inlineMath).not.toBeNull();
    await waitForElement('.katex');
    expect(inlineMath?.querySelector('.katex')).not.toBeNull();
  });

  it('restores inline math after the cursor leaves its source range', () => {
    const source = 'Energy $E=mc^2$ here';
    view = createView(source, true);
    const mathStart = source.indexOf('$');
    view.dispatch({ selection: { anchor: mathStart + 3 } });
    expect(view.contentDOM.querySelector('.typola-cm6-math-inline')).toBeNull();

    moveCursorToEnd(view);

    expect(view.contentDOM.querySelector('.typola-cm6-math-inline')).not.toBeNull();
  });

  it('renders dollar block math and fenced math blocks', () => {
    view = createView([
      '$$',
      'a^2+b^2=c^2',
      '$$',
      '',
      '```math',
      '\\int_0^1 x dx',
      '```',
      '',
      'After',
    ].join('\n'), true);
    moveCursorToEnd(view);

    expect(view.contentDOM.querySelectorAll('.typola-cm6-math-block').length).toBe(2);
  });

  it('restores dollar block math after the cursor leaves its source range', () => {
    const source = ['$$', 'a^2+b^2=c^2', '$$', '', 'After'].join('\n');
    view = createView(source, true);
    const bodyStart = source.indexOf('a^2');
    view.dispatch({ selection: { anchor: bodyStart + 2 } });
    expect(view.contentDOM.querySelector('.typola-cm6-math-block')).toBeNull();

    moveCursorToEnd(view);

    expect(view.contentDOM.querySelector('.typola-cm6-math-block')).not.toBeNull();
  });

  it('renders and sanitizes mermaid fenced blocks as widgets', async () => {
    view = createView([
      '```mermaid',
      'graph TD',
      '  A --> B',
      '```',
      '',
      'After',
    ].join('\n'), true);
    moveCursorToEnd(view);

    expect(view.contentDOM.querySelector('.typola-cm6-mermaid')).not.toBeNull();
    await waitForElement('[data-testid="mermaid-svg"]');
    expect(view.contentDOM.querySelector('.typola-cm6-mermaid script')).toBeNull();
  });

  it('rescans mermaid widgets after the syntax tree completes behind the init viewport', async () => {
    // 打开文档时语法树未解析到 mermaid 块（块在 init 局部树之外）——
    // 轮询补全解析后必须自动重算装饰，否则不动鼠标时图永远不渲染。
    mermaidTreeDelay.pending = 1;
    const head = '普通段落文本，用于垫高文档位置。\n\n'.repeat(340);
    const doc = `${head}\`\`\`mermaid\nflowchart TD\n    A --> B\n\`\`\`\n`;
    const mermaidAt = doc.indexOf('```mermaid');
    view = createView(doc, true);

    const countMermaidWidgets = (): number => {
      const decorations = view.state.facet(EditorView.decorations) as unknown;
      const sets = Array.isArray(decorations)
        ? decorations.filter((set) => typeof (set as { iter?: unknown }).iter === 'function')
        : [decorations as { iter: (from: number, to: number) => { value: { widget?: unknown }; next(): void } }];
      let count = 0;
      for (const set of sets) {
        for (let iter = set.iter(mermaidAt - 1, mermaidAt + 2); iter.value; iter.next()) {
          const widget = iter.value.widget;
          if (widget && widget.constructor.name === 'MermaidWidget') count += 1;
        }
      }
      return count;
    };

    // 打开时树未解析到块：无 mermaid 装饰。
    expect(countMermaidWidgets()).toBe(0);

    // 轮询（50ms 间隔）推进解析并在补全后 dispatch 重算，装饰出现。
    for (let attempt = 0; attempt < 100; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 50));
      if (countMermaidWidgets() > 0) break;
    }
    expect(countMermaidWidgets()).toBe(1);
  }, 20000);

  it('marks the CM6 lines containing active review anchors', () => {
    const doc = '# 标题\n\n需要检视的正文\n\n结尾';
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    view = new EditorView({
      state: EditorState.create({
        doc,
        extensions: [reviewMarkExtension({
          filePath: '/tmp/review.md',
          comments: [{
            id: 'review-1',
            filePath: '/tmp/review.md',
            anchor: { filePath: '/tmp/review.md', from: 4, to: 10, originalText: '需要检视的正文' },
            text: '请补充来源',
            createdAt: 0,
          }],
        })],
      }),
      parent,
    });

    expect(view.contentDOM.querySelector('.cm-line.typola-cm-review-mark')?.textContent).toContain('需要检视的正文');
  });

  it('reconfigures live preview compartments without replacing the EditorView', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const compartments = createLivePreviewCompartments();
    view = new EditorView({
      state: EditorState.create({
        doc: '# 标题\n\n正文',
        extensions: [
          ...createMarkdownExtensions({
            fontFamily: 'monospace',
            fontSize: 14,
            tabSize: 4,
            wordWrap: true,
            extraExtensions: createLivePreviewExtensions({ baseSize: 14, compartments }),
          }),
        ],
      }),
      parent,
    });
    const originalView = view;

    reconfigureLivePreviewExtensions(view, {
      livePreview: false,
      baseSize: 16,
      themeId: 'night-current',
      frontmatterFold: false,
    }, compartments);

    expect(view).toBe(originalView);
    expect(view.state.doc.toString()).toBe('# 标题\n\n正文');
    expect(view.destroyed).toBe(false);
  });
});

describe('createMarkdownExtensions format keymap', () => {
  let view: EditorView | null = null;

  afterEach(() => {
    if (view && !view.destroyed) destroyView(view);
    view = null;
    document.body.innerHTML = '';
  });

  function createKeymapView(doc: string): { view: EditorView; actions: FormatAction[] } {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const actions: FormatAction[] = [];
    const editor = new EditorView({
      state: EditorState.create({
        doc,
        selection: { anchor: doc.length },
        extensions: createMarkdownExtensions({
          fontFamily: 'monospace',
          fontSize: 14,
          tabSize: 4,
          wordWrap: true,
          onFormat: (action) => {
            actions.push(action);
            applyCm6Format(editor, action);
            return true;
          },
        }),
      }),
      parent,
    });
    return { view: editor, actions };
  }

  function pressKey(editor: EditorView, key: string, keyCode: number, shift = false): void {
    editor.contentDOM.dispatchEvent(new KeyboardEvent('keydown', {
      key,
      keyCode,
      ctrlKey: true,
      shiftKey: shift,
      bubbles: true,
      cancelable: true,
    }));
  }

  it('Mod-Shift-K inserts a fenced code block', () => {
    ({ view } = createKeymapView('正文'));
    pressKey(view, 'K', 75, true);
    expect(view.state.doc.toString()).toBe('正文\n```\n代码\n```\n');
  });

  it('Mod-T inserts a 2x3 table', () => {
    ({ view } = createKeymapView('正文'));
    pressKey(view, 't', 84);
    expect(view.state.doc.toString()).toContain('|   |   |   |');
    expect(view.state.doc.toString()).toContain('| - | - | - |');
  });

  it('Mod-Shift-M inserts a math block', () => {
    ({ view } = createKeymapView('正文'));
    pressKey(view, 'M', 77, true);
    expect(view.state.doc.toString()).toBe('正文\n$$\n\n$$\n');
  });

  it('Mod-Shift-` (US 布局产生 ~) toggles inline code', () => {
    ({ view } = createKeymapView('正文字'));
    // 选中「字」后按 Typora 行内代码键位;US 布局 Shift+` 的 event.key 是 '~'
    view.dispatch({ selection: { anchor: 2, head: 3 } });
    pressKey(view, '~', 192, true);
    expect(view.state.doc.toString()).toBe('正文`字`');
  });

  it('Mod-0 demotes a heading to body text', () => {
    ({ view } = createKeymapView('# 标题'));
    pressKey(view, '0', 48);
    expect(view.state.doc.toString()).toBe('标题');
  });

  it('Mod-K inserts a link instead of the AI selection menu', () => {
    ({ view } = createKeymapView('正文'));
    pressKey(view, 'k', 75);
    expect(view.state.doc.toString()).toBe('正文[链接文字](https://)');
  });

  it('Mod-Shift-I triggers onInsertImage and leaves the document untouched', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const onInsertImage = vi.fn(() => true);
    const actions: FormatAction[] = [];
    view = new EditorView({
      state: EditorState.create({
        doc: '正文',
        selection: { anchor: 2 },
        extensions: createMarkdownExtensions({
          fontFamily: 'monospace',
          fontSize: 14,
          tabSize: 4,
          wordWrap: true,
          onInsertImage,
          onFormat: (action) => {
            actions.push(action);
            return true;
          },
        }),
      }),
      parent,
    });
    pressKey(view, 'I', 73, true);
    expect(onInsertImage).toHaveBeenCalledTimes(1);
    expect(actions).toEqual([]);
    expect(view.state.doc.toString()).toBe('正文');
  });
});
