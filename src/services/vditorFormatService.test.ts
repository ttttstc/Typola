// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyVditorFormat, transformQuoteLine } from './vditorFormatService';

describe('vditorFormatService new actions', () => {
  let promptSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    promptSpy = vi.spyOn(window, 'prompt').mockImplementation(() => null);
  });
  afterEach(() => {
    promptSpy.mockRestore();
  });

  it('link-edit: replaces url inside [label](url)', async () => {
    const editor = {
      getValue: () => 'see [a](https://old) here',
      getSelection: () => '[a](https://old)',
      updateValue: vi.fn(),
      insertValue: vi.fn(),
    };
    promptSpy.mockReturnValueOnce('https://new');
    await applyVditorFormat(editor as never, { type: 'link-edit' });
    expect(editor.updateValue).toHaveBeenCalledWith('see [a](https://new) here');
  });

  it('link-edit: no-op when selection is not a link', async () => {
    const editor = {
      getValue: () => 'plain text',
      getSelection: () => 'plain text',
      updateValue: vi.fn(),
      insertValue: vi.fn(),
    };
    await applyVditorFormat(editor as never, { type: 'link-edit' });
    expect(editor.updateValue).not.toHaveBeenCalled();
    expect(window.prompt).not.toHaveBeenCalled();
  });

  it('link-edit: cancelled prompt leaves content untouched', async () => {
    const editor = {
      getValue: () => '[a](https://x)',
      getSelection: () => '[a](https://x)',
      updateValue: vi.fn(),
    };
    promptSpy.mockReturnValueOnce(null);
    await applyVditorFormat(editor as never, { type: 'link-edit' });
    expect(editor.updateValue).not.toHaveBeenCalled();
  });

  it('clear-format: strips bold/italic/strike/inline-code markers', async () => {
    const editor = {
      getValue: () => '**bold** *italic* ~~strike~~ `code` plain',
      getSelection: () => '**bold** *italic* ~~strike~~ `code` plain',
      updateValue: vi.fn(),
    };
    await applyVditorFormat(editor as never, { type: 'clear-format' });
    expect(editor.updateValue).toHaveBeenCalledWith('bold italic strike code plain');
  });

  it('clear-format: strips leading blockquote/list prefixes per line', async () => {
    const editor = {
      getValue: () => '> quote\n- item\n1. numbered',
      getSelection: () => '> quote\n- item\n1. numbered',
      updateValue: vi.fn(),
    };
    await applyVditorFormat(editor as never, { type: 'clear-format' });
    expect(editor.updateValue).toHaveBeenCalledWith('quote\nitem\nnumbered');
  });

  it('clear-format: 不误伤 plain `>5` / `>` / `>abc` 箭头字符', async () => {
    const editor = {
      getValue: () => '>5\n> abc\n>foo',
      getSelection: () => '>5\n> abc\n>foo',
      updateValue: vi.fn(),
    };
    await applyVditorFormat(editor as never, { type: 'clear-format' });
    // `>5` 单独 > 后是数字不是空白,保留
    // `> abc` 是引用,剥
    // `>foo` 后紧跟文本无空白(原 regex 会误伤),新版保留
    expect(editor.updateValue).toHaveBeenCalledWith('>5\nabc\n>foo');
  });

  it('codeblock-lang: replaces blank fenced code', async () => {
    const editor = {
      getValue: () => 'before\n```\nconsole.log(1);\n```\nafter',
      getSelection: () => '```\nconsole.log(1);\n```',
      updateValue: vi.fn(),
    };
    promptSpy.mockReturnValueOnce('typescript');
    await applyVditorFormat(editor as never, { type: 'codeblock-lang' });
    expect(editor.updateValue).toHaveBeenCalledWith('before\n```typescript\nconsole.log(1);\n```\nafter');
  });

  it('codeblock-lang: no-op when selection is not a fenced code block', async () => {
    const editor = {
      getValue: () => 'plain text',
      getSelection: () => 'plain text',
      updateValue: vi.fn(),
    };
    await applyVditorFormat(editor as never, { type: 'codeblock-lang' });
    expect(editor.updateValue).not.toHaveBeenCalled();
  });

  it('codeblock-lang: cancelled prompt leaves content untouched', async () => {
    const editor = {
      getValue: () => '```js\nx\n```',
      getSelection: () => '```js\nx\n```',
      updateValue: vi.fn(),
    };
    promptSpy.mockReturnValueOnce(null);
    await applyVditorFormat(editor as never, { type: 'codeblock-lang' });
    expect(editor.updateValue).not.toHaveBeenCalled();
  });
});

describe('transformQuoteLine (quote-up / quote-down 纯函数)', () => {
  it('upgrade 普通行 → 加一层 > ', () => {
    expect(transformQuoteLine('hello', true)).toBe('> hello');
  });

  it('upgrade 嵌套 quote 行 → 多一层 > ', () => {
    expect(transformQuoteLine('> hello', true)).toBe('>> hello');
  });

  it('upgrade `> > text`(`>` 之间有空格)按单层计(Markdown 同规范)', () => {
    expect(transformQuoteLine('> > nested', true)).toBe('>>> nested');
  });

  it('upgrade 深度为 2 的 `>> text` 行 → 多一层 `>>> text`', () => {
    expect(transformQuoteLine('>> hello', true)).toBe('>>> hello');
  });

  it('downgrade 嵌套 quote 行 → 剥一层', () => {
    expect(transformQuoteLine('>> hello', false)).toBe('> hello');
  });

  it('downgrade 普通行 → 不动(无引用可剥)', () => {
    expect(transformQuoteLine('hello', false)).toBe('hello');
  });

  it('保留缩进,压紧多余空格为 1', () => {
    expect(transformQuoteLine('  >  nested quote', true)).toBe('  >>  nested quote');
  });

  it('嵌套 `>> text` 行 → upgrade 后 `>>> text`', () => {
    expect(transformQuoteLine('>> hello', true)).toBe('>>> hello');
  });

  it('嵌套 `>> text` 行 → downgrade 后 `> text`', () => {
    expect(transformQuoteLine('>> nested quote', false)).toBe('> nested quote');
  });

  it('剥到 0 层:多余空格归 body 前,quote 清理', () => {
    expect(transformQuoteLine('  >  nested quote', false)).toBe('   nested quote');
  });
});
