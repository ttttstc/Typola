import { useEffect, useRef } from 'react';

export type CandidateNavigationChoice = 'apply' | 'save-as' | 'discard' | 'cancel';

export function CandidateNavigationDialog({
  open,
  onChoice,
}: {
  open: boolean;
  onChoice: (choice: CandidateNavigationChoice) => void;
}) {
  const applyRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    applyRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onChoice('cancel');
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onChoice, open]);

  if (!open) return null;
  return (
    <div
      className="unsaved-dialog-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="candidate-navigation-title"
      onClick={(event) => { if (event.target === event.currentTarget) onChoice('cancel'); }}
    >
      <div className="unsaved-dialog candidate-navigation-dialog">
        <h2 id="candidate-navigation-title" className="unsaved-dialog-title">当前候选稿尚未处理</h2>
        <p className="unsaved-dialog-body">切换文档前，请先处理当前候选稿。正式文档尚未被修改。</p>
        <div className="unsaved-dialog-actions candidate-navigation-actions">
          <button type="button" className="unsaved-dialog-button discard" onClick={() => onChoice('discard')}>放弃候选稿</button>
          <button type="button" className="unsaved-dialog-button cancel" onClick={() => onChoice('cancel')}>取消切换</button>
          <button type="button" className="unsaved-dialog-button" onClick={() => onChoice('save-as')}>另存为新文档</button>
          <button ref={applyRef} type="button" className="unsaved-dialog-button save" onClick={() => onChoice('apply')}>应用后切换</button>
        </div>
      </div>
    </div>
  );
}
