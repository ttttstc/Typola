export type ComposerCommandId = 'clear' | 'mcp' | 'help';

export type ComposerCommand = {
  id: ComposerCommandId;
  slash: string;
  title: string;
  description: string;
};

export const COMPOSER_COMMANDS: ComposerCommand[] = [
  {
    id: 'clear',
    slash: '/clear',
    title: '清空当前会话',
    description: '只清空 Typola 当前会话，不发送给 AI。',
  },
  {
    id: 'mcp',
    slash: '/mcp',
    title: '打开 MCP 设置',
    description: '打开当前工作区的 .mcp.json 编辑面板。',
  },
  {
    id: 'help',
    slash: '/help',
    title: '查看命令帮助',
    description: '显示 Typola 支持的本地 slash 命令。',
  },
];

export function findComposerCommand(input: string): ComposerCommand | undefined {
  const normalized = input.trim().toLowerCase();
  return COMPOSER_COMMANDS.find((command) => normalized === command.slash);
}
