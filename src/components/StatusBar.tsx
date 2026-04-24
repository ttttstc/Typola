import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useEditorStore } from '../store/editor';
import { useWorkspaceStore } from '../store/workspace';
import { computeDocStats } from '../shared/docStats';

export function StatusBar() {
  const { t } = useTranslation();
  const { currentFile, content, isDirty, saveStatus } = useEditorStore();
  const workspaceRoot = useWorkspaceStore((s) => s.workspaceRoot);

  const stats = useMemo(() => computeDocStats(content), [content]);

  const relativePath = currentFile && workspaceRoot
    ? currentFile.replace(workspaceRoot, '').replace(/^[\\/]/, '')
    : null;

  return (
    <div
      style={{
        height: 'var(--statusbar-height)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 12px',
        background: 'var(--color-paper)',
        borderTop: '1px solid var(--color-line-soft)',
        fontSize: '12px',
        color: 'var(--color-muted)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <span>{t('statusBar.words', { count: stats.words })}</span>
        <span>{t('statusBar.characters', { count: stats.characters })}</span>
        <span>{t('statusBar.lines', { count: stats.lines })}</span>
        <span>
          {isDirty && t('statusBar.unsaved')}
          {!isDirty && saveStatus === 'saved' && t('statusBar.saved')}
          {!isDirty && saveStatus === 'saving' && t('statusBar.saving')}
          {saveStatus === 'error' && t('statusBar.error')}
        </span>
      </div>
      {relativePath && (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
          {relativePath}
        </span>
      )}
    </div>
  );
}
