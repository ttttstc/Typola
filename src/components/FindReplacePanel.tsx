import { useEffect, useMemo, useRef, useState } from 'react';
import {
  findSearchMatches,
  replaceAllSearchMatches,
  replaceSearchMatch,
  type SearchMatch,
  type SearchOptions,
} from '../services/documentSearchService';
import { useDebouncedValue } from '../hooks/useDebouncedValue';

type FindReplacePanelProps = {
  visible: boolean;
  focusTarget: 'find' | 'replace';
  source: string;
  readOnly: boolean;
  onClose: () => void;
  onReplaceSource: (source: string) => void;
  onNavigate: (match: SearchMatch, query: string, backwards?: boolean) => void;
};

const defaultOptions: SearchOptions = {
  caseSensitive: false,
  wholeWord: false,
  regex: false,
};

export function FindReplacePanel({
  visible,
  focusTarget,
  source,
  readOnly,
  onClose,
  onReplaceSource,
  onNavigate,
}: FindReplacePanelProps) {
  const findInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [options, setOptions] = useState(defaultOptions);
  const [activeIndex, setActiveIndex] = useState(0);
  const deferredQuery = useDebouncedValue(query, 120);
  const deferredSource = useDebouncedValue(source, 120);
  const matches = useMemo(
    () => findSearchMatches(deferredSource, deferredQuery, options),
    [deferredQuery, deferredSource, options],
  );

  useEffect(() => {
    if (!visible) return;
    setActiveIndex(0);
  }, [deferredQuery, options, visible]);

  useEffect(() => {
    if (!visible) return;
    window.requestAnimationFrame(() => {
      const input = focusTarget === 'replace' ? replaceInputRef.current : findInputRef.current;
      input?.focus();
      input?.select();
    });
  }, [focusTarget, visible]);

  useEffect(() => {
    if (!visible || matches.length === 0) return;
    onNavigate(matches[Math.min(activeIndex, matches.length - 1)], deferredQuery);
  }, [activeIndex, deferredQuery, matches, onNavigate, visible]);

  if (!visible) return null;

  const current = matches.length === 0 ? 0 : Math.min(activeIndex + 1, matches.length);

  const move = (direction: 1 | -1) => {
    if (matches.length === 0) return;
    const next = (activeIndex + direction + matches.length) % matches.length;
    setActiveIndex(next);
    onNavigate(matches[next], deferredQuery, direction < 0);
  };

  const replaceCurrent = () => {
    const match = matches[activeIndex];
    if (!match || readOnly) return;
    const next = replaceSearchMatch(source, match, replacement);
    onReplaceSource(next);
    setActiveIndex(Math.max(0, activeIndex - 1));
  };

  const replaceAll = () => {
    if (matches.length === 0 || readOnly) return;
    onReplaceSource(replaceAllSearchMatches(source, matches, replacement));
    setActiveIndex(0);
  };

  const toggleOption = (key: keyof SearchOptions) => {
    setOptions((current) => ({ ...current, [key]: !current[key] }));
  };

  return (
    <div className="find-panel" role="dialog" aria-label="文件内查找替换">
      <input
        ref={findInputRef}
        className="find-input"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            move(event.shiftKey ? -1 : 1);
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            onClose();
          }
        }}
        placeholder="查找"
      />
      <input
        ref={replaceInputRef}
        className="find-input"
        value={replacement}
        onChange={(event) => setReplacement(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            replaceCurrent();
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            onClose();
          }
        }}
        placeholder="替换为"
        disabled={readOnly}
      />
      <span className="find-count">{current}/{matches.length}</span>
      <button type="button" onClick={() => move(-1)} disabled={matches.length === 0}>上一个</button>
      <button type="button" onClick={() => move(1)} disabled={matches.length === 0}>下一个</button>
      <button type="button" onClick={replaceCurrent} disabled={readOnly || matches.length === 0}>替换</button>
      <button type="button" onClick={replaceAll} disabled={readOnly || matches.length === 0}>全部</button>
      <button type="button" className={options.caseSensitive ? 'active' : ''} onClick={() => toggleOption('caseSensitive')}>Aa</button>
      <button type="button" className={options.wholeWord ? 'active' : ''} onClick={() => toggleOption('wholeWord')}>词</button>
      <button type="button" className={options.regex ? 'active' : ''} onClick={() => toggleOption('regex')}>.*</button>
      <button type="button" onClick={onClose} aria-label="关闭查找">×</button>
    </div>
  );
}
