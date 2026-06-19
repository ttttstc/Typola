export interface OpenedFile {
  path: string;
  name: string;
  content: string;
  dirty: boolean;
  lastSavedContent: string;
  fileType: 'markdown' | 'html' | 'docx';
  docxHtml?: string;
}

export interface TocItem {
  level: number;
  text: string;
  id: string;
}

export function createEmptyFile(name = '未命名'): OpenedFile {
  return { path: '', name, content: '', dirty: false, lastSavedContent: '', fileType: 'markdown' };
}
