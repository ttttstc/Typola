import { useMemo, useState } from 'react';
import { COMPOSER_COMMANDS, findComposerCommand } from './commandRegistry';

type SlashCommandOptions = {
  onClear: () => void;
  onOpenMcp: () => void;
};

export function useSlashCommands({ onClear, onOpenMcp }: SlashCommandOptions) {
  const [helpVisible, setHelpVisible] = useState(false);

  const commands = useMemo(() => COMPOSER_COMMANDS, []);

  const runLocalCommand = (input: string): boolean => {
    const command = findComposerCommand(input);
    if (!command) {
      setHelpVisible(false);
      return false;
    }

    if (command.id === 'clear') {
      onClear();
      setHelpVisible(false);
      return true;
    }

    if (command.id === 'mcp') {
      onOpenMcp();
      setHelpVisible(false);
      return true;
    }

    setHelpVisible(true);
    return true;
  };

  return {
    commands,
    helpVisible,
    hideHelp: () => setHelpVisible(false),
    runLocalCommand,
  };
}
