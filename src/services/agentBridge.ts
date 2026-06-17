import type { TerminalPanelHandle } from '../components/TerminalPanel';

const BRACKETED_PASTE_START = '\x1b[200~';
const BRACKETED_PASTE_END = '\x1b[201~';

export function wrapBracketedPaste(text: string): string {
  return `${BRACKETED_PASTE_START}${text}${BRACKETED_PASTE_END}`;
}

export type AgentBridge = {
  ensureTerminal: (command: string, cwd?: string) => Promise<void>;
  injectText: (text: string) => void;
  hasTerminal: () => boolean;
  focus: () => void;
};

export function createAgentBridge(getHandle: () => TerminalPanelHandle | null): AgentBridge {
  return {
    ensureTerminal: async (command: string, cwd?: string) => {
      const handle = getHandle();
      if (!handle) {
        throw new Error('TerminalPanel 未挂载,无法启动 agent 终端');
      }
      await handle.startAgentTerminal({ command, cwd });
    },
    injectText: (text: string) => {
      const handle = getHandle();
      if (!handle) {
        console.warn('agentBridge.injectText: no terminal handle yet');
        return;
      }
      // 场景卡注入: bracketed paste 包裹,不加 \r
      handle.sendText(wrapBracketedPaste(text));
      handle.focusAgentTerminal();
    },
    hasTerminal: () => Boolean(getHandle()?.hasAgentTerminal()),
    focus: () => {
      getHandle()?.focusAgentTerminal();
    },
  };
}
