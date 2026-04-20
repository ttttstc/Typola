import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from '../src/store/editor';

describe('editor store', () => {
  beforeEach(() => {
    useEditorStore.getState().reset();
  });

  it('preserves a dirty draft when switching tabs', () => {
    const store = useEditorStore.getState();

    store.addOpenFile('C:\\workspace\\a.md');
    store.setLoadedContent('from disk', 'C:\\workspace\\a.md');
    store.setContent('local draft');

    store.addOpenFile('C:\\workspace\\b.md');
    store.setLoadedContent('other file', 'C:\\workspace\\b.md');
    store.setCurrentFile('C:\\workspace\\a.md');

    const nextState = useEditorStore.getState();
    expect(nextState.content).toBe('local draft');
    expect(nextState.isDirty).toBe(true);
  });

  it('clears editor state when the last tab closes', () => {
    const store = useEditorStore.getState();

    store.addOpenFile('C:\\workspace\\note.md');
    store.setLoadedContent('hello', 'C:\\workspace\\note.md');
    store.removeOpenFile('C:\\workspace\\note.md');

    const nextState = useEditorStore.getState();
    expect(nextState.currentFile).toBeNull();
    expect(nextState.content).toBe('');
    expect(nextState.isDirty).toBe(false);
  });

  it('remaps open paths when a directory is renamed', () => {
    const store = useEditorStore.getState();

    store.addOpenFile('C:\\workspace\\docs\\guide.md');
    store.setLoadedContent('guide', 'C:\\workspace\\docs\\guide.md');
    store.replacePathPrefix('C:\\workspace\\docs', 'C:\\workspace\\notes');

    const nextState = useEditorStore.getState();
    expect(nextState.currentFile).toBe('C:\\workspace\\notes\\guide.md');
    expect(nextState.openFiles[0].path).toBe('C:\\workspace\\notes\\guide.md');
    expect(nextState.content).toBe('guide');
  });

  it('keeps the active tab stable when updating a background draft path', () => {
    const store = useEditorStore.getState();

    store.addOpenFile('C:\\workspace\\active.md');
    store.setLoadedContent('active content', 'C:\\workspace\\active.md');
    store.setContent('still editing here');

    store.addOpenFile('C:\\workspace\\draft.md', { isDraft: true });
    store.setLoadedContent('draft content', 'C:\\workspace\\draft.md');
    store.setCurrentFile('C:\\workspace\\active.md');

    store.updateFilePath('C:\\workspace\\draft.md', 'C:\\workspace\\saved-draft.md');

    const nextState = useEditorStore.getState();
    expect(nextState.currentFile).toBe('C:\\workspace\\active.md');
    expect(nextState.content).toBe('still editing here');
    expect(nextState.isDirty).toBe(true);
    expect(nextState.openFiles.map((file) => file.path)).toContain('C:\\workspace\\saved-draft.md');
  });
});
