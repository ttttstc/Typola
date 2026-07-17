import { useCallback, useEffect, useState } from 'react';
import {
  listDocumentHistory,
  type DocumentHistoryEntry,
} from '../services/review/documentHistoryService';

export function useDocumentHistoryList(options: {
  outputBaseDir?: string;
  conversationId?: string;
  documentPath?: string;
  refreshKey?: unknown;
}): { histories: DocumentHistoryEntry[]; refresh: () => void } {
  const { outputBaseDir, conversationId, documentPath, refreshKey } = options;
  const [histories, setHistories] = useState<DocumentHistoryEntry[]>([]);
  const refresh = useCallback(() => {
    void listDocumentHistory({ outputBaseDir, conversationId, documentPath }).then(setHistories);
  }, [conversationId, documentPath, outputBaseDir]);

  useEffect(refresh, [refresh, refreshKey]);
  return { histories, refresh };
}
