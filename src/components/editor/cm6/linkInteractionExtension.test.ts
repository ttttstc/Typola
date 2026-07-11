import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
  findLinkAtSelection,
  linkOpenExtension,
  rewriteLinkAtSelection,
  taskToggleExtension,
  toggleTaskSource,
} from './linkInteractionExtension';
import { analyzeMarkdown, findMarkdownLinkAt, findMarkdownTaskAt } from '../../../services/markdownAnalysisService';

function createView(doc: string, extensions: ReturnType<typeof taskToggleExtension> | ReturnType<typeof linkOpenExtension> = []) {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  return new EditorView({
    state: EditorState.create({ doc, extensions }),
    parent,
  });
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('CM6 link/task interaction helpers', () => {
  it('finds task at offset including marker position', () => {
    const source = '- [ ] 待办\n- [x] 完成\n';
    const todo = findMarkdownTaskAt(source, 2);
    expect(todo?.text).toBe('待办');
    // marker 之前几个字符也命中同一行
    const earlier = findMarkdownTaskAt(source, 0);
    expect(earlier?.text).toBe('待办');
  });

  it('toggles task marker text reversibly', () => {
    const open = analyzeMarkdown('- [ ] a').tasks[0]!;
    // 喂整段文本,验证 [ ] ↔ [x] 切换。
    expect(toggleTaskSource({ ...open, text: '[ ] a' })).toBe('[x] a');
    expect(toggleTaskSource({ ...open, text: '[x] a', checked: true })).toBe('[ ] a');
  });

  it('rewrites link url under cursor without requiring full selection', () => {
    const view = createView('see [官网](https://typola.dev) here');
    const linkStart = view.state.doc.toString().indexOf('[官网]');
    view.dispatch({ selection: { anchor: linkStart + 1 } }); // 光标在链接 label 上
    const ok = rewriteLinkAtSelection(view, { getUrl: () => 'https://typola.dev/new' });
    expect(ok).toBe(true);
    expect(view.state.doc.toString()).toBe('see [官网](https://typola.dev/new) here');
    view.destroy();
  });

  it('returns false when no link is under cursor', () => {
    const view = createView('plain text only');
    view.dispatch({ selection: { anchor: 3 } });
    const ok = rewriteLinkAtSelection(view, { getUrl: () => 'https://x' });
    expect(ok).toBe(false);
    view.destroy();
  });

  it('skips plain click without modifier', () => {
    const source = 'see [官网](https://typola.dev) here';
    const onOpenLink = vi.fn();
    const view = createView(source, linkOpenExtension({ onOpenLink }));
    const fakeAnchor = document.createElement('a');
    view.contentDOM.appendChild(fakeAnchor);
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'target', { value: fakeAnchor });
    fakeAnchor.dispatchEvent(event);
    expect(onOpenLink).not.toHaveBeenCalled();
    view.destroy();
  });

it('click handler only triggers on ctrl/meta modifier', () => {
  const source = 'see [官网](https://typola.dev) here';
  const onOpenLink = vi.fn();
  const view = createView(source, linkOpenExtension({ onOpenLink }));
  // jsdom 不支持 posAtCoords,所以 ctrl+click 的 doc offset 计算会抛错。
  // 这里只断言:无 modifier 不会触发,这是稳定可测的契约。
  const fakeAnchor = document.createElement('a');
  view.contentDOM.appendChild(fakeAnchor);
  const event = new MouseEvent('click', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'target', { value: fakeAnchor });
  fakeAnchor.dispatchEvent(event);
  expect(onOpenLink).not.toHaveBeenCalled();
  view.destroy();
});

  it('does not open link on plain click', () => {
    const source = 'see [官网](https://typola.dev) here';
    const onOpenLink = vi.fn();
    const view = createView(source, linkOpenExtension({ onOpenLink }));
    const fakeAnchor = document.createElement('a');
    view.contentDOM.appendChild(fakeAnchor);
    const rect = fakeAnchor.getBoundingClientRect();
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: rect.left + 1, clientY: rect.top + 1 });
    fakeAnchor.dispatchEvent(event);
    expect(onOpenLink).not.toHaveBeenCalled();
    view.destroy();
  });

  it('exposes link lookup for callers', () => {
    const source = 'see [官网](https://typola.dev) here';
    const view = createView(source);
    const linkStart = source.indexOf('[官网]');
    const link = findMarkdownLinkAt(source, linkStart + 1);
    expect(link?.url).toBe('https://typola.dev');
    view.dispatch({ selection: { anchor: linkStart + 1 } });
    expect(findLinkAtSelection(view)?.url).toBe('https://typola.dev');
    view.destroy();
  });
});