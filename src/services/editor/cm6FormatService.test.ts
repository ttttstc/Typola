// @vitest-environment jsdom
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyCm6Format } from './cm6FormatService';

function createView(doc: string, from = 0, to = doc.length, extensions: Extension[] = []) {
  const host = document.createElement('div');
  document.body.append(host);
  const view = new EditorView({
    state: EditorState.create({ doc, selection: { anchor: from, head: to }, extensions }),
    parent: host,
  });
  return { host, view };
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('applyCm6Format', () => {
  it.each([
    ['bold', '**', '**'],
    ['italic', '*', '*'],
    ['underline', '<u>', '</u>'],
    ['sup', '<sup>', '</sup>'],
    ['sub', '<sub>', '</sub>'],
    ['highlight', '==', '=='],
  ] as const)('toggles existing %s markers for selected text and cursor', (type, open, close) => {
    const doc = `${open}文字${close}`;
    const { view } = createView(doc, open.length, open.length + 2);

    applyCm6Format(view, { type });
    expect(view.state.doc.toString()).toBe('文字');

    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: doc }, selection: { anchor: open.length + 1 } });
    applyCm6Format(view, { type });
    expect(view.state.doc.toString()).toBe('文字');
    view.destroy();
  });

  it('changes quote depth through a CM6 transaction', () => {
    const { view } = createView('> text', 0, 0);

    applyCm6Format(view, { type: 'quote-up' });
    expect(view.state.doc.toString()).toBe('>> text');

    applyCm6Format(view, { type: 'quote-down' });
    expect(view.state.doc.toString()).toBe('> text');
    view.destroy();
  });

  it('changes every selected quote line in one dispatch', () => {
    const { view } = createView('> a\n> b\nplain');
    applyCm6Format(view, { type: 'quote-up' });
    expect(view.state.doc.toString()).toBe('>> a\n>> b\n> plain');
    applyCm6Format(view, { type: 'quote-down' });
    expect(view.state.doc.toString()).toBe('> a\n> b\nplain');
    view.destroy();
  });

  it('requests React editing for links and code block languages', () => {
    const link = '[Typola](https://old.example)';
    const { view } = createView(link);
    applyCm6Format(view, { type: 'link-edit' }, (request) => {
      expect(request.kind).toBe('link');
      if (request.kind === 'link') request.apply({ label: 'Typola 官网', url: 'https://new.example', title: '主页' });
    });
    expect(view.state.doc.toString()).toBe('[Typola 官网](https://new.example "主页")');

    const block = '```\nconst x = 1;\n```';
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: block }, selection: { anchor: 0, head: block.length } });
    applyCm6Format(view, { type: 'codeblock-lang' }, (request) => {
      expect(request.kind).toBe('code');
      if (request.kind === 'code') request.apply('ts');
    });
    expect(view.state.doc.toString()).toBe('```ts\nconst x = 1;\n```');
    view.destroy();
  });

  it('clears selected inline and list markup', () => {
    const text = '- **strong**\n- `code`';
    const { view } = createView(text);

    applyCm6Format(view, { type: 'clear-format' });
    expect(view.state.doc.toString()).toBe('strong\ncode');
    view.destroy();
  });

  it('keeps horizontal rules intact when clearing format', () => {
    const { view } = createView('---\n___\n***');
    applyCm6Format(view, { type: 'clear-format' });
    expect(view.state.doc.toString()).toBe('---\n___\n***');
    view.destroy();
  });

  it('inserts a math block with the cursor on the empty line between fences', () => {
    const { view } = createView('正文', 2, 2);
    applyCm6Format(view, { type: 'math-block' });
    expect(view.state.doc.toString()).toBe('正文\n$$\n\n$$\n');
    expect(view.state.selection.main.anchor).toBe(6);
    view.destroy();
  });

  it('captures and applies inline format in one transaction', () => {
    const { view } = createView('**bold**\nplain', 0, 8);
    applyCm6Format(view, { type: 'capture-format' });
    view.dispatch({ selection: { anchor: 9, head: 14 } });
    applyCm6Format(view, { type: 'apply-format' });
    expect(view.state.doc.toString()).toBe('**bold**\n**plain**');
    view.destroy();
  });

  it('uses one format-painter action to capture, then apply and clear the captured format', () => {
    const { view } = createView('**bold**\nplain', 0, 8);
    applyCm6Format(view, { type: 'format-painter' });
    view.dispatch({ selection: { anchor: 9, head: 14 } });
    applyCm6Format(view, { type: 'format-painter' });
    expect(view.state.doc.toString()).toBe('**bold**\n**plain**');
    view.dispatch({ selection: { anchor: 9, head: 18 } });
    applyCm6Format(view, { type: 'format-painter' });
    expect(view.state.doc.toString()).toBe('**bold**\n**plain**');
    view.destroy();
  });
});

describe('heading-up / heading-down', () => {
  it('heading-up: H2 → H1', () => {
    const { view } = createView('## 标题', 3, 3);
    applyCm6Format(view, { type: 'heading-up' });
    expect(view.state.doc.toString()).toBe('# 标题');
    view.destroy();
  });

  it('heading-up: 正文 → H2, H1 保持不变', () => {
    const { view } = createView('正文', 1, 1);
    applyCm6Format(view, { type: 'heading-up' });
    expect(view.state.doc.toString()).toBe('## 正文');
    applyCm6Format(view, { type: 'heading-up' });
    expect(view.state.doc.toString()).toBe('# 正文');
    applyCm6Format(view, { type: 'heading-up' });
    expect(view.state.doc.toString()).toBe('# 正文');
    view.destroy();
  });

  it('heading-down: H1 → 正文, H2 → H3, H6 保持不变', () => {
    const { view } = createView('# 标题\n## 二级\n###### 六级', 1, 1);
    applyCm6Format(view, { type: 'heading-down' });
    expect(view.state.doc.toString()).toBe('标题\n## 二级\n###### 六级');
    const second = view.state.doc.toString().indexOf('## 二级');
    view.dispatch({ selection: { anchor: second + 1 } });
    applyCm6Format(view, { type: 'heading-down' });
    expect(view.state.doc.toString()).toBe('标题\n### 二级\n###### 六级');
    const sixth = view.state.doc.toString().indexOf('###### 六级');
    view.dispatch({ selection: { anchor: sixth + 1 } });
    applyCm6Format(view, { type: 'heading-down' });
    expect(view.state.doc.toString()).toBe('标题\n### 二级\n###### 六级');
    view.destroy();
  });
});

describe('editCodeBlockLanguage 定位', () => {
  const markdownExt = [markdown({ base: markdownLanguage })];

  it('语法树路径:光标在代码块体内任意行都能弹出语言编辑', () => {
    const doc = 'intro\n```js\nconst x = 1;\nconst y = 2;\n```\ntail';
    const bodyMiddle = doc.indexOf('const y');
    const { view } = createView(doc, bodyMiddle, bodyMiddle, markdownExt);
    applyCm6Format(view, { type: 'codeblock-lang' }, (request) => {
      expect(request.kind).toBe('code');
      if (request.kind === 'code') {
        expect(request.language).toBe('js');
        request.apply('ts');
      }
    });
    expect(view.state.doc.toString()).toBe('intro\n```ts\nconst x = 1;\nconst y = 2;\n```\ntail');
    view.destroy();
  });

  it('扫描回退:无语言扩展时光标在块体内也能定位并只改 fence 行', () => {
    const doc = '```\ncode line\n```';
    const inBody = doc.indexOf('code');
    const { view } = createView(doc, inBody, inBody);
    applyCm6Format(view, { type: 'codeblock-lang' }, (request) => {
      expect(request.kind).toBe('code');
      if (request.kind === 'code') request.apply('python');
    });
    expect(view.state.doc.toString()).toBe('```python\ncode line\n```');
    view.destroy();
  });

  it('光标不在任何代码块内时不弹窗', () => {
    const { view } = createView('plain text\nno block here', 5, 5, markdownExt);
    let called = false;
    applyCm6Format(view, { type: 'codeblock-lang' }, () => { called = true; });
    expect(called).toBe(false);
    view.destroy();
  });
});

describe('editLink 光标定位', () => {
  it('光标位于文档中部链接的 label 上时仍能编辑', () => {
    const doc = 'intro text [Typola](https://example.com) tail';
    const cursorInLabel = doc.indexOf('[') + 3;
    const { view } = createView(doc, cursorInLabel, cursorInLabel);
    applyCm6Format(view, { type: 'link-edit' }, (request) => {
      expect(request.kind).toBe('link');
      if (request.kind === 'link') request.apply({ label: 'T', url: 'https://typola.dev', title: '' });
    });
    expect(view.state.doc.toString()).toBe('intro text [T](https://typola.dev) tail');
    view.destroy();
  });
});
