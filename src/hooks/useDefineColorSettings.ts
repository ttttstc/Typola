import { useCallback, useEffect, useRef, useState } from 'react';
import { applyDefineColorToDocument } from '../services/defineColorSystem/applyDefineColorToDocument';
import { normalizeDefineColorSettings } from '../services/defineColorSystem/normalizeDefineColorSettings';
import type { DefineColorSettings } from '../services/defineColorSystem/types';
import { updateSettings } from '../services/settingsService';

export function useDefineColorSettings(source: DefineColorSettings) {
  const [draft, setDraft] = useState(source);
  const latest = useRef(source);
  const frame = useRef<number | null>(null);
  const persistTimer = useRef<number | null>(null);
  const hasUnpersistedPreview = useRef(false);
  const lastPaint = useRef(-Infinity);

  useEffect(() => {
    if (frame.current !== null) return;
    latest.current = source;
    setDraft(source);
  }, [source]);

  const persist = useCallback(() => {
    if (!hasUnpersistedPreview.current) return;
    hasUnpersistedPreview.current = false;
    updateSettings({ appearanceColorSystem: 'define-color', defineColorSettings: latest.current });
  }, []);

  const flush = useCallback(() => {
    if (persistTimer.current !== null) clearTimeout(persistTimer.current);
    persistTimer.current = null;
    persist();
  }, [persist]);

  const schedulePersist = useCallback(() => {
    if (persistTimer.current !== null) clearTimeout(persistTimer.current);
    persistTimer.current = window.setTimeout(() => {
      persistTimer.current = null;
      persist();
    }, 180);
  }, [persist]);

  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    flush();
  }, [flush]);

  const preview = useCallback((patch: Partial<DefineColorSettings>) => {
    const next = normalizeDefineColorSettings({ ...latest.current, ...patch });
    latest.current = next;
    hasUnpersistedPreview.current = true;
    schedulePersist();
    if (frame.current !== null) return next;
    const flush = (timestamp: number) => {
      if (timestamp - lastPaint.current < 42) {
        frame.current = requestAnimationFrame(flush);
        return;
      }
      const pending = latest.current;
      setDraft(pending);
      applyDefineColorToDocument(document, pending);
      lastPaint.current = timestamp;
      frame.current = null;
    };
    frame.current = requestAnimationFrame(flush);
    return next;
  }, []);

  const commit = useCallback((patch: Partial<DefineColorSettings> = {}) => {
    const next = normalizeDefineColorSettings({ ...latest.current, ...patch });
    latest.current = next;
    hasUnpersistedPreview.current = true;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    setDraft(next);
    applyDefineColorToDocument(document, next);
    lastPaint.current = performance.now();
    flush();
    return next;
  }, [flush]);

  return { draft, preview, commit, flush };
}
