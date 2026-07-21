import type { DefaultEncoding } from '../services/settingsService';

export type LineEnding = 'LF' | 'CRLF';

export type DocumentFingerprint = {
  size: number;
  modifiedAt: number | null;
  hash: string;
};

export interface OpenedFile {
  path: string;
  name: string;
  content: string;
  dirty: boolean;
  lastSavedContent: string;
  fileType: 'markdown' | 'html' | 'docx';
  encoding?: DefaultEncoding;
  hasBom?: boolean;
  lineEnding?: LineEnding;
  fingerprint?: DocumentFingerprint;
  docxHtml?: string;
}

export interface TocItem {
  level: number;
  text: string;
  id: string;
}

export function createEmptyFile(name = '未命名'): OpenedFile {
  return {
    path: '',
    name,
    content: '',
    dirty: false,
    lastSavedContent: '',
    fileType: 'markdown',
    encoding: 'UTF-8',
    hasBom: false,
    lineEnding: 'LF',
  };
}
