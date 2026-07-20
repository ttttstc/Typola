import { useEffect } from 'react';

export function useDismissableDialog(open: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    const onKeyTrap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const dialog = document.querySelector<HTMLElement>('.cm6-edit-popover');
      if (!dialog) return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>('input, button, select, textarea')].filter((element) => !element.hasAttribute('disabled'));
      if (focusable.length === 0) return;
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest('.cm6-edit-popover')) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keydown', onKeyTrap);
    window.addEventListener('mousedown', onMouseDown);
    return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keydown', onKeyTrap); window.removeEventListener('mousedown', onMouseDown); };
  }, [open, onClose]);
}
