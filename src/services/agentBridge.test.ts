import { describe, expect, it, vi } from 'vitest';
import { createAgentBridge, wrapBracketedPaste } from './agentBridge';
import type { TerminalPanelHandle } from '../components/TerminalPanel';

describe('agentBridge bracketed paste (P0-A 单层包裹)', () => {
  it('wrapBracketedPaste 包单层 ESC[200~ / ESC[201~', () => {
    const wrapped = wrapBracketedPaste('claude hi');
    expect(wrapped).toBe('\x1b[200~claude hi\x1b[201~');
    expect((wrapped.match(/\x1b\[200~/g) ?? []).length).toBe(1);
    expect((wrapped.match(/\x1b\[201~/g) ?? []).length).toBe(1);
  });

  it('injectText 经 sendText 出口只包一层,不再额外包裹', () => {
    const sendText = vi.fn();
    const handle: TerminalPanelHandle = {
      startAgentTerminal: vi.fn().mockResolvedValue(undefined),
      sendText,
      hasAgentTerminal: vi.fn().mockReturnValue(true),
      focusAgentTerminal: vi.fn(),
    };
    const bridge = createAgentBridge(() => handle);
    bridge.injectText('run command');

    expect(sendText).toHaveBeenCalledTimes(1);
    const payload = sendText.mock.calls[0][0];
    expect((payload.match(/\x1b\[200~/g) ?? []).length).toBe(1);
    expect((payload.match(/\x1b\[201~/g) ?? []).length).toBe(1);
    expect(payload).toBe('\x1b[200~run command\x1b[201~');
  });

  it('TerminalPanel.sendText 不再二次包裹(契约):handle.sendText 收到的就是 injectText 的入口参数单层包裹后字符串', () => {
    // 关键不变量:TerminalPanel.sendText 是「裸写文本」primitive,不再二次包裹。
    // 这里通过断言 sendText mock 收到的 payload 内容 = wrapBracketedPaste(input) 来锁定契约。
    // 任何把 sendText 改回"再包一次"的回归都会让这个测试仍然通过 mock 层面(因为 mock 替了 sendText 内部),
    // 所以**真正**的"不二次包裹"由 TerminalPanel.tsx:sendText 处的代码 review + 单测 wrapBracketedPaste 共同保证。
    const sendText = vi.fn();
    const handle: TerminalPanelHandle = {
      startAgentTerminal: vi.fn().mockResolvedValue(undefined),
      sendText,
      hasAgentTerminal: vi.fn().mockReturnValue(true),
      focusAgentTerminal: vi.fn(),
    };
    const bridge = createAgentBridge(() => handle);
    const input = 'multi\nline\ncommand';
    bridge.injectText(input);

    const expected = wrapBracketedPaste(input);
    expect(sendText).toHaveBeenCalledWith(expected);
  });
});
