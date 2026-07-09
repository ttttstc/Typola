// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyVditorFormat } from './vditorFormatService';

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
