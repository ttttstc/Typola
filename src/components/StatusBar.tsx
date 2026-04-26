import { useTranslation } from 'react-i18next';
import { useEditorStore } from '../store/editor';
import { useWorkspaceStore } from '../store/workspace';
import { useAIStore } from '../store/ai';
import { useUIStore } from '../store/ui';

export function StatusBar() {
  const { t } = useTranslation();
  const { currentFile, content, isDirty, saveStatus } = useEditorStore();
  const workspaceRoot = useWorkspaceStore((s) => s.workspaceRoot);
  const aiSettings = useAIStore((s) => s.settings);
  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen);
  const setSettingsActiveTab = useUIStore((s) => s.setSettingsActiveTab);

  const wordCount = content.length;
  const relativePath =
    currentFile && workspaceRoot ? currentFile.replace(workspaceRoot, '').replace(/^[\\/]/, '') : null;

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
        <span>{wordCount} 字</span>
        <span>
          {isDirty && t('statusBar.unsaved')}
          {!isDirty && saveStatus === 'saved' && t('statusBar.saved')}
          {!isDirty && saveStatus === 'saving' && t('statusBar.saving')}
          {saveStatus === 'error' && t('statusBar.error')}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <button
          onClick={() => {
            setSettingsActiveTab('ai');
            setSettingsOpen(true);
          }}
          style={{
            border: 'none',
            background: 'transparent',
            color: 'var(--color-muted)',
            cursor: 'pointer',
            fontSize: '12px',
            padding: 0,
          }}
        >
          {aiSettings.configured ? aiSettings.providerLabel : t('statusBar.aiNotConfigured')}
        </button>
        {relativePath ? (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>{relativePath}</span>
        ) : null}
      </div>
    </div>
  );
}
