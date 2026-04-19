import { useEditorStore } from '../store/editor';
import { useWorkspaceStore } from '../store/workspace';

export function StatusBar() {
  const { currentFile, content, saveStatus } = useEditorStore();
  const workspaceRoot = useWorkspaceStore((s) => s.workspaceRoot);

  const wordCount = content.length;

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
        <span>{wordCount} 字</span>
        <span>
          {saveStatus === 'saved' && '已保存'}
          {saveStatus === 'saving' && '保存中...'}
          {saveStatus === 'error' && '保存失败'}
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
