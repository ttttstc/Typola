import { useCallback, useEffect, useState } from 'react';
import type { ArtifactRecord } from '../services/artifacts/types';
import { scanArtifacts } from '../services/artifacts/scanner';

type UseArtifactLibraryOptions = {
  outputRoot?: string;
  refreshKey?: unknown;
};

export function useArtifactLibrary({ outputRoot, refreshKey }: UseArtifactLibraryOptions) {
  const [records, setRecords] = useState<ArtifactRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(() => {
    if (!outputRoot) {
      setRecords([]);
      return;
    }
    setLoading(true);
    void scanArtifacts(outputRoot)
      .then(setRecords)
      .catch((error) => {
        console.warn('Failed to scan artifacts:', error);
        setRecords([]);
      })
      .finally(() => setLoading(false));
  }, [outputRoot]);

  useEffect(() => {
    refresh();
  }, [refresh, refreshKey]);

  return { records, loading, refresh };
}
