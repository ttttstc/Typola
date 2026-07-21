import { useEffect, useRef } from 'react';
import { useSettings } from '../hooks/useSettings';
import { translate } from '../services/i18n';

export type UnsavedDecision = 'save' | 'save-all' | 'discard' | 'discard-all' | 'cancel';

type Props = {
  open: boolean;
  message: string;
  allowSaveAll?: boolean;
  allowDiscardAll?: boolean;
  onChoice: (decision: UnsavedDecision) => void;
};

export function UnsavedChangesDialog({
  open,
  message,
  allowSaveAll = false,
  allowDiscardAll = false,
  onChoice,
}: Props) {
  const settings = useSettings();
  const t = (key: Parameters<typeof translate>[1]) => translate(settings.locale, key);
  const dialogRef = useRef<HTMLDivElement>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    saveButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onChoice('cancel');
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
      ) ?? []);
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (target instanceof Node && !dialogRef.current?.contains(target)) {
        saveButtonRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('focusin', handleFocusIn, true);
    const overlay = dialogRef.current?.parentElement;
    const siblings = overlay
      ? Array.from(overlay.parentElement?.children ?? []).filter((element) => element !== overlay)
      : [];
    siblings.forEach((element) => element.setAttribute('inert', ''));
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('focusin', handleFocusIn, true);
      siblings.forEach((element) => element.removeAttribute('inert'));
      if (restoreFocusRef.current?.isConnected) restoreFocusRef.current.focus();
    };
  }, [open, onChoice]);

  if (!open) return null;

  return (
    <div
      className="unsaved-dialog-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="unsaved-dialog-title"
    >
      <div ref={dialogRef} className="unsaved-dialog">
        <h2 id="unsaved-dialog-title" className="unsaved-dialog-title">{t('unsavedDialogTitle')}</h2>
        <p className="unsaved-dialog-body">{message}</p>
        <div className="unsaved-dialog-actions">
          {allowDiscardAll && (
            <button
              type="button"
              className="unsaved-dialog-button discard"
              data-action="discard-all"
              onClick={() => onChoice('discard-all')}
            >
              {t('unsavedDialogDiscardAll')}
            </button>
          )}
          <button
            type="button"
            className="unsaved-dialog-button discard"
            data-action="discard"
            onClick={() => onChoice('discard')}
          >
            {t('unsavedDialogDiscard')}
          </button>
          <button
            type="button"
            className="unsaved-dialog-button cancel"
            data-action="cancel"
            onClick={() => onChoice('cancel')}
          >
            {t('unsavedDialogCancel')}
          </button>
          <button
            ref={allowSaveAll ? undefined : saveButtonRef}
            type="button"
            className="unsaved-dialog-button save"
            data-action="save"
            onClick={() => onChoice('save')}
          >
            {t('unsavedDialogSave')}
          </button>
          {allowSaveAll && (
            <button
              ref={saveButtonRef}
              type="button"
              className="unsaved-dialog-button save"
              data-action="save-all"
              onClick={() => onChoice('save-all')}
            >
              {t('unsavedDialogSaveAll')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
