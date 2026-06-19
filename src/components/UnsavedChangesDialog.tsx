import { useEffect, useRef } from 'react';
import { useSettings } from '../hooks/useSettings';
import { translate } from '../services/i18n';

export type UnsavedDecision = 'save' | 'discard' | 'cancel';

type Props = {
  open: boolean;
  message: string;
  onChoice: (decision: UnsavedDecision) => void;
};

export function UnsavedChangesDialog({ open, message, onChoice }: Props) {
  const settings = useSettings();
  const t = (key: Parameters<typeof translate>[1]) => translate(settings.locale, key);
  const saveButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    saveButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onChoice('cancel');
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [open, onChoice]);

  if (!open) return null;

  return (
    <div
      className="unsaved-dialog-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="unsaved-dialog-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) onChoice('cancel');
      }}
    >
      <div className="unsaved-dialog">
        <h2 id="unsaved-dialog-title" className="unsaved-dialog-title">{t('unsavedDialogTitle')}</h2>
        <p className="unsaved-dialog-body">{message}</p>
        <div className="unsaved-dialog-actions">
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
            ref={saveButtonRef}
            type="button"
            className="unsaved-dialog-button save"
            data-action="save"
            onClick={() => onChoice('save')}
          >
            {t('unsavedDialogSave')}
          </button>
        </div>
      </div>
    </div>
  );
}