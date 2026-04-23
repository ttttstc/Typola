import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Settings } from '../src/components/Settings';
import { DEFAULT_TERMINAL_SETTINGS } from '../src/shared/terminal';
import { useUIStore } from '../src/store/ui';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    initReactI18next: {
      type: '3rdParty',
      init: () => {},
    },
    useTranslation: () => ({
      t: (key: string) => {
        const dictionary: Record<string, string> = {
          'settings.common': 'Common',
          'settings.advanced': 'Advanced',
          'settings.general': 'General',
          'settings.editor': 'Editor',
          'settings.appearance': 'Appearance',
          'settings.export': 'Export',
          'settings.terminal': 'Terminal',
          'settings.shortcuts': 'Shortcuts',
          'settings.enableByDefault': 'Enable by default',
          'terminal.shellPath': 'Shell Path',
          'terminal.shellPathDescription': 'Shell path description',
          'terminal.fontFamily': 'Font Family',
          'terminal.fontFamilyDescription': 'Font family description',
          'terminal.fontSize': 'Font Size',
          'terminal.fontSizeDescription': 'Font size description',
          'terminal.cursorStyle': 'Cursor Style',
          'terminal.cursorStyleDescription': 'Cursor style description',
          'terminal.cursorBlock': 'Block',
          'terminal.cursorBar': 'Bar',
          'terminal.cursorUnderline': 'Underline',
          'terminal.cursorBlink': 'Blinking Cursor',
          'terminal.cursorBlinkDescription': 'Cursor blink description',
          'terminal.shortcutPreset': 'Shortcut Preset',
          'terminal.shortcutPresetDescription': 'Shortcut preset description',
          'terminal.shortcutPresetWindows': 'Windows',
          'terminal.shortcutPresetLinux': 'Linux',
          'terminal.confirmMultilinePaste': 'Confirm multiline paste',
          'terminal.confirmMultilinePasteDescription': 'Confirm multiline paste description',
          'terminal.autoShellWindows': 'Auto (powershell.exe)',
          'terminal.autoShellPosix': 'Auto ($SHELL / /bin/bash)',
        };

        return dictionary[key] ?? key;
      },
    }),
  };
});

describe('Settings terminal tab', () => {
  beforeEach(() => {
    useUIStore.setState({
      settingsOpen: true,
      settingsActiveTab: 'terminal',
      terminalSettings: { ...DEFAULT_TERMINAL_SETTINGS },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders terminal settings and updates the store', () => {
    render(<Settings />);

    const textboxes = screen.getAllByRole('textbox');
    const shellInput = textboxes[0];
    fireEvent.change(shellInput, { target: { value: 'C:\\Windows\\System32\\cmd.exe' } });

    const fontInput = screen.getByDisplayValue(DEFAULT_TERMINAL_SETTINGS.fontFamily);
    fireEvent.change(fontInput, { target: { value: 'JetBrains Mono, monospace' } });

    const sizeInput = screen.getByDisplayValue(String(DEFAULT_TERMINAL_SETTINGS.fontSize));
    fireEvent.change(sizeInput, { target: { value: '15' } });

    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'underline' } });
    fireEvent.change(selects[1], { target: { value: 'linux' } });

    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);

    const state = useUIStore.getState().terminalSettings;
    expect(state.shellPath).toBe('C:\\Windows\\System32\\cmd.exe');
    expect(state.fontFamily).toBe('JetBrains Mono, monospace');
    expect(state.fontSize).toBe(15);
    expect(state.cursorStyle).toBe('underline');
    expect(state.cursorBlink).toBe(false);
    expect(state.shortcutPreset).toBe('linux');
    expect(state.confirmMultilinePaste).toBe(false);
  });
});
