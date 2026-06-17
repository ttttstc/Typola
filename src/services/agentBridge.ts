import type { TerminalPanelHandle } from '../components/TerminalPanel';
import { detectAgent } from './agentService';

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
      // P1-E: 起 shell 前先探测 claude 是否存在。起 shell 不会因 claude 缺失而抛错——
      // "command not found" 只是终端文本(spec §0.1 不解析 TUI),catch 抓不到;
      // 用已有的 detectAgent(agent_detect) 前置探测,缺失时抛 not-found 让 UI 引导到设置。
      const detection = await detectAgent(command);
      if (!detection.available) {
        throw new Error(`Claude CLI not found: ${command}`);
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
