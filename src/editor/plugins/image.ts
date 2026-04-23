import { useWorkspaceStore } from '../../store/workspace';
import { insertImage } from '../formatting';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB

const MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp',
};

function extFromMime(mime: string): string | null {
  const normalized = mime.toLowerCase();
  if (MIME_TO_EXT[normalized]) return MIME_TO_EXT[normalized];
  if (normalized.startsWith('image/')) {
    const candidate = normalized.split('/')[1]?.split(';')[0]?.trim();
    return candidate || null;
  }
  return null;
}

export async function saveImage(data: Uint8Array, ext: string): Promise<string | null> {
  const workspaceRoot = useWorkspaceStore.getState().workspaceRoot;
  if (!workspaceRoot) {
    console.warn('Skipping image save: no workspace root.');
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
  return relativePath;
}

async function handleImageFile(file: File) {
  if (file.size > MAX_IMAGE_BYTES) {
    console.warn(`Image "${file.name}" exceeds ${MAX_IMAGE_BYTES} bytes; skipping.`);
    return;
  }

  const ext = extFromMime(file.type) ?? 'png';
  try {
    const buffer = await file.arrayBuffer();
    const data = new Uint8Array(buffer);
    const relativePath = await saveImage(data, ext);
    if (relativePath) {
      const altText = file.name ? file.name.replace(/\.[^.]+$/, '') : 'image';
      insertImage(`./${relativePath}`, altText);
    }
  } catch (error) {
    console.error('Failed to process image:', error);
  }
}

function collectImageFiles(fileList: FileList | null | undefined): File[] {
  if (!fileList || fileList.length === 0) return [];
  const images: File[] = [];
  for (const file of Array.from(fileList)) {
    if (file.type.startsWith('image/')) {
      images.push(file);
    }
  }
  return images;
}

export function setupImageHandler() {
  const editor = document.querySelector('.ProseMirror');
  if (!editor) return () => {};

  const handlePaste = (e: Event) => {
    const clipboardEvent = e as ClipboardEvent;
    const items = clipboardEvent.clipboardData?.items;
    if (!items) return;

    const imageFiles: File[] = [];
    for (const item of Array.from(items)) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }

    if (imageFiles.length === 0) return;
    e.preventDefault();
    void Promise.all(imageFiles.map(handleImageFile));
  };

  const handleDrop = (e: Event) => {
    const dragEvent = e as DragEvent;
    const imageFiles = collectImageFiles(dragEvent.dataTransfer?.files);
    if (imageFiles.length === 0) return;
    e.preventDefault();
    void Promise.all(imageFiles.map(handleImageFile));
  };

  editor.addEventListener('paste', handlePaste);
  editor.addEventListener('drop', handleDrop);

  return () => {
    editor.removeEventListener('paste', handlePaste);
    editor.removeEventListener('drop', handleDrop);
  };
}
