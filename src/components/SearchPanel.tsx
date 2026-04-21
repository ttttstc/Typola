import { useCallback, useEffect } from 'react';
import type { InputHTMLAttributes } from 'react';
import { Search, Replace } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useWorkspaceStore } from '../store/workspace';
import { useSearchStore } from '../store/search';
import { useEditorStore } from '../store/editor';

function SearchOptionToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '12px',
        color: 'var(--color-muted)',
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

function PanelInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={{
        width: '100%',
        padding: '8px 10px',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--color-line-soft)',
        background: 'var(--color-paper)',
        color: 'var(--color-ink)',
        fontSize: '13px',
        ...(props.style ?? {}),
      }}
    />
  );
}

export function SearchPanel() {
  const { t } = useTranslation();
  const workspaceRoot = useWorkspaceStore((state) => state.workspaceRoot);
  const {
    workspaceSearchQuery,
    workspaceReplaceQuery,
    workspaceSearchOptions,
    workspaceIncludeGlob,
    workspaceExcludeGlob,
    workspaceResults,
    workspaceReplacePreview,
    workspaceSearchLoading,
    workspaceReplaceLoading,
    setWorkspaceSearchQuery,
    setWorkspaceReplaceQuery,
    setWorkspaceSearchOptions,
    setWorkspaceGlobFilters,
    setWorkspaceResults,
    setWorkspaceReplacePreview,
    setWorkspaceSearchLoading,
    setWorkspaceReplaceLoading,
    clearWorkspacePreview,
    openFileSearchMatch,
  } = useSearchStore();

  const executeSearch = useCallback(async () => {
    if (!workspaceRoot || !workspaceSearchQuery.trim()) {
      setWorkspaceResults([]);
      return;
    }

    setWorkspaceSearchLoading(true);

    try {
      const results = await window.electronAPI.workspaceSearch(workspaceRoot, workspaceSearchQuery, {
        ...workspaceSearchOptions,
        includeGlob: workspaceIncludeGlob,
        excludeGlob: workspaceExcludeGlob,
      });
      setWorkspaceResults(results);
    } catch (error) {
      console.error('Failed to search workspace:', error);
      setWorkspaceResults([]);
    } finally {
      setWorkspaceSearchLoading(false);
    }
  }, [
    setWorkspaceResults,
    setWorkspaceSearchLoading,
    workspaceExcludeGlob,
    workspaceIncludeGlob,
    workspaceRoot,
    workspaceSearchOptions,
    workspaceSearchQuery,
  ]);

  useEffect(() => {
    if (!workspaceSearchQuery.trim()) {
      setWorkspaceResults([]);
      clearWorkspacePreview();
      return;
    }

    const timer = window.setTimeout(() => {
      void executeSearch();
    }, 180);

    return () => window.clearTimeout(timer);
  }, [clearWorkspacePreview, executeSearch, setWorkspaceResults, workspaceSearchQuery]);

  const handlePreviewReplace = async () => {
    if (!workspaceRoot || !workspaceSearchQuery.trim()) return;

    const dirtyOpenPaths = useEditorStore
      .getState()
      .openFiles.filter((file) => file.isDirty)
      .map((file) => file.path);

    setWorkspaceReplaceLoading(true);

    try {
      const preview = await window.electronAPI.previewWorkspaceReplace(
        workspaceRoot,
        workspaceSearchQuery,
        workspaceReplaceQuery,
        {
          ...workspaceSearchOptions,
          includeGlob: workspaceIncludeGlob,
          excludeGlob: workspaceExcludeGlob,
          skipPaths: dirtyOpenPaths,
        }
      );
      setWorkspaceReplacePreview(preview);
    } catch (error) {
      console.error('Failed to preview workspace replace:', error);
      setWorkspaceReplacePreview([]);
    } finally {
      setWorkspaceReplaceLoading(false);
    }
  };

  const handleApplyReplace = async () => {
    if (workspaceReplacePreview.length === 0) return;

    const confirmed = window.confirm(
      t('search.confirmWorkspaceReplace', {
        count: workspaceReplacePreview.reduce((sum, file) => sum + file.replacementCount, 0),
      })
    );
    if (!confirmed) return;

    setWorkspaceReplaceLoading(true);

    try {
      await window.electronAPI.applyWorkspaceReplace(
        workspaceReplacePreview.map((file) => ({
          filePath: file.filePath,
          nextContent: file.nextContent,
        }))
      );

      const editorState = useEditorStore.getState();
      for (const file of workspaceReplacePreview) {
        const isOpen = editorState.openFiles.some((openFile) => openFile.path === file.filePath);
        if (!isOpen) continue;

        editorState.setLoadedContent(file.nextContent, file.filePath);

        if (editorState.currentFile === file.filePath) {
          window.dispatchEvent(
            new CustomEvent('editor-set-content', {
              detail: {
                content: file.nextContent,
                dirty: false,
              },
            })
          );
        }
      }

      clearWorkspacePreview();
      await executeSearch();
    } catch (error) {
      console.error('Failed to apply workspace replace:', error);
    } finally {
      setWorkspaceReplaceLoading(false);
    }
  };

  const openMatch = (
    filePath: string,
    matchIndex: number
  ) => {
    useEditorStore.getState().addOpenFile(filePath);
    openFileSearchMatch({
      query: workspaceSearchQuery,
      activeIndex: matchIndex,
      options: workspaceSearchOptions,
    });
  };

  const totalMatchCount = workspaceResults.reduce((sum, file) => sum + file.totalMatches, 0);
  const previewCount = workspaceReplacePreview.reduce((sum, file) => sum + file.replacementCount, 0);

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--color-paper)',
      }}
    >
      <div
        style={{
          padding: '10px 12px',
          borderBottom: '1px solid var(--color-line-soft)',
          display: 'grid',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Search size={14} />
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase' }}>
            {t('search.workspaceTitle')}
          </span>
        </div>
        <PanelInput
          value={workspaceSearchQuery}
          placeholder={t('search.searchPlaceholder')}
          onChange={(event) => setWorkspaceSearchQuery(event.target.value)}
        />
        <PanelInput
          value={workspaceReplaceQuery}
          placeholder={t('search.replacePlaceholder')}
          onChange={(event) => setWorkspaceReplaceQuery(event.target.value)}
        />
        <div style={{ display: 'grid', gap: '6px' }}>
          <PanelInput
            value={workspaceIncludeGlob}
            placeholder={t('search.includePlaceholder')}
            onChange={(event) => setWorkspaceGlobFilters({ includeGlob: event.target.value })}
          />
          <PanelInput
            value={workspaceExcludeGlob}
            placeholder={t('search.excludePlaceholder')}
            onChange={(event) => setWorkspaceGlobFilters({ excludeGlob: event.target.value })}
          />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          <SearchOptionToggle
            label={t('search.caseSensitive')}
            checked={workspaceSearchOptions.caseSensitive}
            onChange={(checked) => setWorkspaceSearchOptions({ caseSensitive: checked })}
          />
          <SearchOptionToggle
            label={t('search.wholeWord')}
            checked={workspaceSearchOptions.wholeWord}
            onChange={(checked) => setWorkspaceSearchOptions({ wholeWord: checked })}
          />
          <SearchOptionToggle
            label={t('search.regex')}
            checked={workspaceSearchOptions.useRegex}
            onChange={(checked) => setWorkspaceSearchOptions({ useRegex: checked })}
          />
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => void executeSearch()}
            style={{
              flex: 1,
              height: '34px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              cursor: 'pointer',
              background: 'var(--color-surface-sunken)',
              color: 'var(--color-ink)',
              fontSize: '13px',
            }}
          >
            {workspaceSearchLoading ? t('search.searching') : t('search.searchAction')}
          </button>
          <button
            onClick={() => void handlePreviewReplace()}
            disabled={!workspaceSearchQuery.trim()}
            style={{
              flex: 1,
              height: '34px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              cursor: workspaceSearchQuery.trim() ? 'pointer' : 'not-allowed',
              background: 'var(--color-ink)',
              color: 'var(--color-paper)',
              fontSize: '13px',
              opacity: workspaceSearchQuery.trim() ? 1 : 0.5,
            }}
          >
            {workspaceReplaceLoading ? t('search.preparingReplace') : t('search.previewReplace')}
          </button>
        </div>
        <div style={{ fontSize: '12px', color: 'var(--color-muted)' }}>
          {workspaceSearchQuery.trim()
            ? t('search.resultSummary', {
                files: workspaceResults.length,
                matches: totalMatchCount,
              })
            : t('search.emptySearch')}
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
        {!workspaceRoot ? (
          <div style={{ padding: '16px 12px', fontSize: '13px', color: 'var(--color-muted)' }}>
            {t('search.openWorkspaceFirst')}
          </div>
        ) : workspaceReplacePreview.length > 0 ? (
          <div style={{ display: 'grid', gap: '10px', padding: '0 10px 12px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 10px',
                background: 'var(--color-surface-sunken)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '12px',
                color: 'var(--color-muted)',
              }}
            >
              <span>{t('search.previewSummary', { count: previewCount, files: workspaceReplacePreview.length })}</span>
              <button
                onClick={() => void handleApplyReplace()}
                style={{
                  height: '30px',
                  padding: '0 12px',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--color-ink)',
                  color: 'var(--color-paper)',
                  cursor: 'pointer',
                  fontSize: '12px',
                }}
              >
                {t('search.applyReplace')}
              </button>
            </div>
            {workspaceReplacePreview.map((file) => (
              <div
                key={file.filePath}
                style={{
                  border: '1px solid var(--color-line-soft)',
                  borderRadius: 'var(--radius-md)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    padding: '8px 10px',
                    background: 'var(--color-surface-sunken)',
                    fontSize: '12px',
                    fontWeight: 600,
                  }}
                >
                  {file.relativePath} · {file.replacementCount}
                </div>
                <div style={{ display: 'grid', gap: '8px', padding: '10px' }}>
                  {file.changes.map((change, index) => (
                    <div
                      key={`${file.filePath}-${change.lineNumber}-${index}`}
                      style={{
                        display: 'grid',
                        gap: '4px',
                        fontSize: '12px',
                        borderBottom: index === file.changes.length - 1 ? 'none' : '1px solid var(--color-line-soft)',
                        paddingBottom: index === file.changes.length - 1 ? 0 : '8px',
                      }}
                    >
                      <div style={{ color: 'var(--color-muted)' }}>
                        {t('search.lineLabel', { line: change.lineNumber })}
                      </div>
                      <div style={{ color: '#b91c1c', fontFamily: 'var(--font-mono)' }}>- {change.beforeLine}</div>
                      <div style={{ color: '#15803d', fontFamily: 'var(--font-mono)' }}>+ {change.afterLine}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : workspaceResults.length === 0 ? (
          <div style={{ padding: '16px 12px', fontSize: '13px', color: 'var(--color-muted)' }}>
            {workspaceSearchLoading ? t('search.searching') : t('search.noResults')}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '10px', padding: '0 10px 12px' }}>
            {workspaceResults.map((file) => (
              <div
                key={file.filePath}
                style={{
                  border: '1px solid var(--color-line-soft)',
                  borderRadius: 'var(--radius-md)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    padding: '8px 10px',
                    background: 'var(--color-surface-sunken)',
                    fontSize: '12px',
                    fontWeight: 600,
                  }}
                >
                  {file.relativePath} · {file.totalMatches}
                </div>
                <div style={{ display: 'grid', gap: '8px', padding: '10px' }}>
                  {file.matches.map((match, index) => (
                    <button
                      key={`${file.filePath}-${match.lineNumber}-${index}`}
                      onClick={() => openMatch(file.filePath, index)}
                      style={{
                        display: 'grid',
                        gap: '4px',
                        padding: '8px',
                        background: 'transparent',
                        border: '1px solid var(--color-line-soft)',
                        borderRadius: 'var(--radius-sm)',
                        textAlign: 'left',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--color-muted)' }}>
                        <Replace size={12} />
                        <span>{t('search.lineLabel', { line: match.lineNumber })}</span>
                      </div>
                      {match.contextBefore.map((line, contextIndex) => (
                        <div key={`before-${contextIndex}`} style={{ fontSize: '12px', color: 'var(--color-muted)', fontFamily: 'var(--font-mono)' }}>
                          {line}
                        </div>
                      ))}
                      <div style={{ fontSize: '12px', color: 'var(--color-ink)', fontFamily: 'var(--font-mono)' }}>
                        {match.lineText}
                      </div>
                      {match.contextAfter.map((line, contextIndex) => (
                        <div key={`after-${contextIndex}`} style={{ fontSize: '12px', color: 'var(--color-muted)', fontFamily: 'var(--font-mono)' }}>
                          {line}
                        </div>
                      ))}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
