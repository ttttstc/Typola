import type { Ctx } from '@milkdown/ctx';
import type { RenderType } from '@milkdown/components/table-block';
import { commandsCtx } from '@milkdown/core';
import { insertHardbreakCommand } from '@milkdown/preset-commonmark';
import { exitTable } from '@milkdown/preset-gfm';
import { findTable } from 'prosemirror-tables';
import { keymap } from 'prosemirror-keymap';

const TABLE_BUTTON_ICONS: Record<RenderType, string> = {
  add_row:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 12.5h10"/><path d="M8 10v5"/><rect x="2.5" y="2.5" width="11" height="6" rx="1.5"/></svg>',
  add_col:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12.5 3v10"/><path d="M10 8h5"/><rect x="2.5" y="2.5" width="6" height="11" rx="1.5"/></svg>',
  delete_row:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 12.5h10"/><rect x="2.5" y="2.5" width="11" height="6" rx="1.5"/></svg>',
  delete_col:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12.5 3v10"/><rect x="2.5" y="2.5" width="6" height="11" rx="1.5"/></svg>',
  align_col_left:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 4h10"/><path d="M3 8h7"/><path d="M3 12h10"/></svg>',
  align_col_center:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 4h10"/><path d="M4.5 8h7"/><path d="M3 12h10"/></svg>',
  align_col_right:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 4h10"/><path d="M6 8h7"/><path d="M3 12h10"/></svg>',
  col_drag_handle:
    '<svg viewBox="0 0 16 16" fill="currentColor"><circle cx="5" cy="5" r="1.2"/><circle cx="11" cy="5" r="1.2"/><circle cx="5" cy="11" r="1.2"/><circle cx="11" cy="11" r="1.2"/></svg>',
  row_drag_handle:
    '<svg viewBox="0 0 16 16" fill="currentColor"><circle cx="5" cy="5" r="1.2"/><circle cx="11" cy="5" r="1.2"/><circle cx="5" cy="11" r="1.2"/><circle cx="11" cy="11" r="1.2"/></svg>',
};

export function renderTableBlockButton(renderType: RenderType) {
  return TABLE_BUTTON_ICONS[renderType];
}

export function createTableKeyboardPlugin(ctx: Ctx) {
  const commands = ctx.get(commandsCtx);

  return keymap({
    Enter: (state) => {
      if (!findTable(state.selection.$from)) {
        return false;
      }

      return commands.call(insertHardbreakCommand.key);
    },
    'Mod-Enter': (state) => {
      if (!findTable(state.selection.$from)) {
        return false;
      }

      return commands.call(exitTable.key);
    },
    'Ctrl-Enter': (state) => {
      if (!findTable(state.selection.$from)) {
        return false;
      }

      return commands.call(exitTable.key);
    },
  });
}
