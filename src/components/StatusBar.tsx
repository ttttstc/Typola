import { useEffect, useRef, useState } from 'react';
import { writeText } from '../services/clipboardService';
import type { DocumentStats } from '../services/documentStatsService';
import { useSettings } from '../hooks/useSettings';
import { translate } from '../services/i18n';
import type { SaveVisualState } from '../hooks/useFileTabs';

type StatusBarProps = {
  filePath: string;
  dirty: boolean;
  saveState?: SaveVisualState;
  message?: string;
  stats?: DocumentStats;
};

type CopyOutcome = 'copied' | 'failed';
type CopyMarker = { path: string; outcome: CopyOutcome } | null;

const COPY_FEEDBACK_RESET_MS = 1200;
const NUMBER_TWEEN_MS = 80;

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function useTweenedNumber(value: number): number {
  const [displayValue, setDisplayValue] = useState(value);
  const previousValueRef = useRef(value);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const from = previousValueRef.current;
    previousValueRef.current = value;
    if (from === value || prefersReducedMotion()) {
      setDisplayValue(value);
      return undefined;
    }

    const startedAt = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / NUMBER_TWEEN_MS);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(from + (value - from) * eased));
      if (progress < 1) {
        frameRef.current = window.requestAnimationFrame(tick);
      } else {
        frameRef.current = null;
      }
    };
    frameRef.current = window.requestAnimationFrame(tick);

    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [value]);

  return displayValue;
}

function getSaveStateLabel(state: SaveVisualState, t: (key: Parameters<typeof translate>[1]) => string): string {
  if (state === 'saving') return t('statusBarSaving');
  if (state === 'saved') return t('statusBarSaved');
  if (state === 'error') return t('statusBarSaveFailed');
  return t('statusBarUnsaved');
}

export function StatusBar({ filePath, dirty, saveState, message, stats }: StatusBarProps) {
  const settings = useSettings();
  const t = (key: Parameters<typeof translate>[1]) => translate(settings.locale, key);
  const hasPath = filePath.length > 0;
  const [copyMarker, setCopyMarker] = useState<CopyMarker>(null);
  const resetTimerRef = useRef<number | null>(null);
  const displayWords = useTweenedNumber(stats?.words ?? 0);
  const displayReadingMinutes = useTweenedNumber(stats?.readingMinutes ?? 0);
  const effectiveSaveState: SaveVisualState = saveState
    ?? (dirty ? 'dirty' : 'idle');

  useEffect(() => {
    return () => {
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
        resetTimerRef.current = null;
      }
    };
  }, []);

  const scheduleFeedbackReset = () => {
    if (resetTimerRef.current !== null) {
      window.clearTimeout(resetTimerRef.current);
    }
    resetTimerRef.current = window.setTimeout(() => {
      setCopyMarker(null);
      resetTimerRef.current = null;
    }, COPY_FEEDBACK_RESET_MS);
  };

  const handleDoubleClick = () => {
    if (!hasPath) return;
    void writeText(filePath)
      .then(() => {
        setCopyMarker({ path: filePath, outcome: 'copied' });
      })
      .catch(() => {
        setCopyMarker({ path: filePath, outcome: 'failed' });
      })
      .finally(() => {
        scheduleFeedbackReset();
      });
  };

  const copyState: 'idle' | CopyOutcome =
    copyMarker && copyMarker.path === filePath && hasPath
      ? copyMarker.outcome
      : 'idle';

  return (
    <div className="status-bar">
      <span
        className="status-path"
        data-copy-state={copyState}
        onDoubleClick={hasPath ? handleDoubleClick : undefined}
        title={hasPath ? t('statusBarCopyPathTitle') : undefined}
        style={
          hasPath ? { cursor: 'text', userSelect: 'text' } : undefined
        }
      >
        {hasPath ? filePath : t('statusBarNoFile')}
      </span>
      {copyState !== 'idle' && (
        <span
          className="status-copy-feedback"
          data-copy-state={copyState}
          style={{
            color: copyState === 'copied' ? 'var(--success)' : 'var(--danger)',
            fontWeight: 500,
          }}
        >
          {copyState === 'copied' ? t('statusBarCopied') : t('statusBarCopyFailed')}
        </span>
      )}
      {effectiveSaveState !== 'idle' && (
        <span
          className="status-save-state"
          data-save-state={effectiveSaveState}
          role={effectiveSaveState === 'error' ? 'alert' : 'status'}
          aria-live={effectiveSaveState === 'error' ? 'assertive' : 'polite'}
        >
          <span className="status-save-dot" aria-hidden="true" />
          <span className="status-dirty">{getSaveStateLabel(effectiveSaveState, t)}</span>
        </span>
      )}
      {message && <span className="status-message" role="status">{message}</span>}
      {stats && (
        <span className="status-stats" title={`${stats.characters} chars · ${stats.paragraphs} para`}>
          {displayWords} {settings.locale === 'zh-CN' ? '词' : settings.locale === 'ja-JP' ? '語' : 'words'} · {displayReadingMinutes} {settings.locale === 'zh-CN' ? '分钟' : settings.locale === 'ja-JP' ? '分' : 'min'}
        </span>
      )}
    </div>
  );
}
