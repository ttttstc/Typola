import { useWorkspaceStore } from '../../store/workspace';

export async function saveImage(data: Uint8Array, ext: string): Promise<string | null> {
  const workspaceRoot = useWorkspaceStore.getState().workspaceRoot;
  if (!workspaceRoot) {
    console.error('No workspace root set');
    return null;
  }

  try {
    const relativePath = await window.electronAPI.saveImage(workspaceRoot, Array.from(data), ext);
    return relativePath;
  } catch (error) {
    console.error('Failed to save image:', error);
    return null;
  }
}

export function getImageUrl(relativePath: string): string {
  // For Electron, images are accessed via file:// protocol
  // The relative path is returned from the main process
  return relativePath;
}

export function setupImageHandler() {
  const editor = document.querySelector('.ProseMirror');
  if (!editor) return () => {};

  const handlePaste = (e: Event) => {
    const clipboardEvent = e as ClipboardEvent;
    const items = clipboardEvent.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;

        const ext = item.type.split('/')[1] || 'png';
        file.arrayBuffer().then((buffer) => {
          const data = new Uint8Array(buffer);
          saveImage(data, ext).then((relativePath) => {
            if (relativePath) {
              document.execCommand('insertText', false, `![image](./${relativePath})`);
            }
          });
        });
      }
    }
  };

  const handleDrop = (e: Event) => {
    const dragEvent = e as DragEvent;
    const files = dragEvent.dataTransfer?.files;
    if (!files || files.length === 0) return;

    for (const file of files) {
      if (file.type.startsWith('image/')) {
        e.preventDefault();
        const ext = file.type.split('/')[1] || 'png';
        file.arrayBuffer().then((buffer) => {
          const data = new Uint8Array(buffer);
          saveImage(data, ext).then((relativePath) => {
            if (relativePath) {
              document.execCommand('insertText', false, `![image](./${relativePath})`);
            }
          });
        });
      }
    }
  };

  editor.addEventListener('paste', handlePaste);
  editor.addEventListener('drop', handleDrop);

  return () => {
    editor.removeEventListener('paste', handlePaste);
    editor.removeEventListener('drop', handleDrop);
  };
}
