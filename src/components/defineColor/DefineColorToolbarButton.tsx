import { useState } from 'react';
import { Paintbrush } from 'lucide-react';
import {
  FloatingFocusManager, FloatingPortal, flip, offset, shift,
  useClick, useDismiss, useFloating, useInteractions, useRole,
} from '@floating-ui/react';
import { useDefineColorSettings } from '../../hooks/useDefineColorSettings';
import type { AppSettings } from '../../services/settingsService';
import { updateSettings } from '../../services/settingsService';
import { DefineColorPopover } from './DefineColorPopover';

/* eslint-disable react-hooks/refs -- Floating UI's supported API exposes ref-backed context, refs, and styles during render. */
export function DefineColorToolbarButton({ settings }: { settings: AppSettings }) {
  const [open, setOpen] = useState(false);
  const { draft, preview, commit, flush } = useDefineColorSettings(settings.defineColorSettings);
  const floating = useFloating({
    open,
    onOpenChange: (next) => {
      setOpen(next);
      if (next) updateSettings({ appearanceColorSystem: 'define-color' });
      else flush();
    },
    placement: 'bottom-start',
    middleware: [offset(8), flip({ padding: 8 }), shift({ padding: 8 })],
  });
  const click = useClick(floating.context);
  const dismiss = useDismiss(floating.context, { escapeKey: true, outsidePress: true });
  const role = useRole(floating.context, { role: 'dialog' });
  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss, role]);
  return (
    <>
      <button
        ref={floating.refs.setReference}
        type="button"
        data-no-window-drag="true"
        data-tooltip="编辑主题颜色"
        title="编辑主题颜色"
        aria-label="编辑主题颜色"
        aria-expanded={open}
        className={settings.appearanceColorSystem === 'define-color' ? 'active' : ''}
        {...getReferenceProps()}
      ><Paintbrush size={18} strokeWidth={1.6} /></button>
      {open && (
        <FloatingPortal>
          <FloatingFocusManager context={floating.context} modal={false} returnFocus>
            <div ref={floating.refs.setFloating} style={{ ...floating.floatingStyles, zIndex: 10000 }} {...getFloatingProps()}>
              <DefineColorPopover settings={draft} onPreview={preview} onCommit={commit} />
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      )}
    </>
  );
}
