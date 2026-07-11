import { useCallback, useEffect, useRef, useState } from 'react';
import { applyDefineColorToDocument } from '../services/defineColorSystem/applyDefineColorToDocument';
import { normalizeDefineColorSettings } from '../services/defineColorSystem/normalizeDefineColorSettings';
import type { DefineColorSettings } from '../services/defineColorSystem/types';
import { updateSettings } from '../services/settingsService';

export function useDefineColorSettings(source: DefineColorSettings) {
  const [draft, setDraft] = useState(source);
  const latest = useRef(source);
  const frame = useRef<number | null>(null);
  const lastPaint = useRef(-Infinity);

  useEffect(() => {
    if (frame.current !== null) return;
    latest.current = source;
    setDraft(source);
  }, [source]);

  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
  }, []);

  const preview = useCallback((patch: Partial<DefineColorSettings>) => {
    const next = normalizeDefineColorSettings({ ...latest.current, ...patch });
    latest.current = next;
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
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    setDraft(next);
    applyDefineColorToDocument(document, next);
    lastPaint.current = performance.now();
    updateSettings({ appearanceColorSystem: 'define-color', defineColorSettings: next });
    return next;
  }, []);

  return { draft, preview, commit };
}
