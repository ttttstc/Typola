import { useCallback, useEffect, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { TocItem } from '../types/document';
import { updateSettings } from '../services/settingsService';
import type { EditorMode } from '../components/Toolbar';
import type { SourceHeadingScrollRequest } from '../components/EditorPane';

type UseTocStateOptions = {
  editorMode: EditorMode;
  alwaysPinned: boolean;
  mainContentRef: MutableRefObject<HTMLDivElement | null>;
  resolveTocHeading: (item: TocItem, index: number) => HTMLElement | null;
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
};

/**
 * Holds TOC pinning, active heading tracking, and source-mode TOC jumps.
 */
export function useTocState({
  editorMode,
  alwaysPinned,
  mainContentRef,
  resolveTocHeading,
  setSourceHeadingScrollRequest,
}: UseTocStateOptions): UseTocStateResult {
  const [toc, setToc] = useState<TocItem[]>([]);
  const [tocSessionPinned, setTocSessionPinned] = useState(false);
  const [activeTocIndex, setActiveTocIndex] = useState(0);

  const tocPinned = tocSessionPinned || alwaysPinned;

  const handleTocNavigate = useCallback((_item: TocItem, index: number) => {
    setSourceHeadingScrollRequest((current) => ({
      index,
      requestId: (current?.requestId ?? 0) + 1,
    }));
    setActiveTocIndex(index);
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

  useEffect(() => {
    if (toc.length === 0) return;
    if (editorMode === 'source') return;

    const updateActiveHeading = () => {
      const rootRect = mainContentRef.current?.getBoundingClientRect();
      const anchorTop = (rootRect?.top ?? 0) + 96;
      let nextActive = 0;

      toc.forEach((item, index) => {
        const heading = resolveTocHeading(item, index);
        if (!heading) return;
        if (heading.getBoundingClientRect().top <= anchorTop) {
          nextActive = index;
        }
      });

      setActiveTocIndex((current) => current === nextActive ? current : nextActive);
    };

    const root = mainContentRef.current;
    let frame: number | null = null;
    const scheduleUpdate = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        updateActiveHeading();
      });
    };
    const observer = new MutationObserver(scheduleUpdate);

    root?.addEventListener('scroll', scheduleUpdate, { capture: true, passive: true });
    window.addEventListener('resize', scheduleUpdate);
    if (root) {
      observer.observe(root, { childList: true, subtree: true });
    }
    scheduleUpdate();

    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      root?.removeEventListener('scroll', scheduleUpdate, true);
      window.removeEventListener('resize', scheduleUpdate);
      observer.disconnect();
    };
  }, [editorMode, mainContentRef, resolveTocHeading, toc]);

  return {
    toc,
    setToc,
    activeTocIndex,
    tocPinned,
    handleTocNavigate,
    handleTocPinnedChange,
    handleTocAlwaysPinnedChange,
  };
}
