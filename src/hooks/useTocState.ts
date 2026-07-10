import { useCallback, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { TocItem } from '../types/document';
import { updateSettings } from '../services/settingsService';
import type { SourceHeadingScrollRequest } from '../components/EditorPane';

type UseTocStateOptions = {
  alwaysPinned: boolean;
  setSourceHeadingScrollRequest: Dispatch<SetStateAction<SourceHeadingScrollRequest | undefined>>;
};

type UseTocStateResult = {
  toc: TocItem[];
  setToc: Dispatch<SetStateAction<TocItem[]>>;
  activeTocIndex: number;
  tocPinned: boolean;
  handleTocNavigate: (item: TocItem, index: number) => void;
  handleTocPinnedChange: (nextPinned: boolean) => void;
  handleTocAlwaysPinnedChange: (nextAlwaysPinned: boolean) => void;
  handleEditorHeadingChange: (index: number) => void;
};

/**
 * Holds TOC pinning, active heading tracking, and source-mode TOC jumps.
 */
export function useTocState({
  alwaysPinned,
  setSourceHeadingScrollRequest,
}: UseTocStateOptions): UseTocStateResult {
  const [toc, setToc] = useState<TocItem[]>([]);
  const [tocSessionPinned, setTocSessionPinned] = useState(false);
  const [activeTocIndex, setActiveTocIndex] = useState(0);
  const pendingNavigationRef = useRef<number | null>(null);

  const tocPinned = tocSessionPinned || alwaysPinned;

  const handleTocNavigate = useCallback((_item: TocItem, index: number) => {
    pendingNavigationRef.current = index;
    setSourceHeadingScrollRequest((current) => ({
      index,
      requestId: (current?.requestId ?? 0) + 1,
    }));
    setActiveTocIndex(index);
    window.setTimeout(() => {
      if (pendingNavigationRef.current === index) pendingNavigationRef.current = null;
    }, 300);
  }, [setSourceHeadingScrollRequest]);

  const handleTocPinnedChange = useCallback((nextPinned: boolean) => {
    setTocSessionPinned(nextPinned);
    if (!nextPinned && alwaysPinned) {
      updateSettings({ tocAlwaysPinned: false });
    }
  }, [alwaysPinned]);

  const handleTocAlwaysPinnedChange = useCallback((nextAlwaysPinned: boolean) => {
    if (!nextAlwaysPinned) {
      setTocSessionPinned(true);
    }
    updateSettings({ tocAlwaysPinned: nextAlwaysPinned });
  }, []);

  const handleEditorHeadingChange = useCallback((index: number) => {
    if (pendingNavigationRef.current !== null) {
      pendingNavigationRef.current = null;
      return;
    }
    if (index >= 0) setActiveTocIndex(index);
  }, []);

  return {
    toc,
    setToc,
    activeTocIndex,
    tocPinned,
    handleTocNavigate,
    handleTocPinnedChange,
    handleTocAlwaysPinnedChange,
    handleEditorHeadingChange,
  };
}
