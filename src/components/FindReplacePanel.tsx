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
  openRequest: number;
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
  openRequest,
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
  const [replaceExpanded, setReplaceExpanded] = useState(false);
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
    setReplaceExpanded(focusTarget === 'replace');
    window.requestAnimationFrame(() => {
      const input = focusTarget === 'replace' ? replaceInputRef.current : findInputRef.current;
      input?.focus();
      input?.select();
    });
  }, [focusTarget, openRequest, visible]);

  useEffect(() => {
    if (!visible || matches.length === 0) return;
    onNavigate(matches[Math.min(activeIndex, matches.length - 1)], deferredQuery);
  }, [activeIndex, deferredQuery, matches, onNavigate, visible]);

  if (!visible) return null;

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
    <div className={replaceExpanded ? 'find-panel replace-expanded' : 'find-panel'} role="dialog" aria-label="文件内查找替换">
      <div className="find-row">
        <button
          type="button"
          className="find-mode-toggle"
          onClick={() => {
            setReplaceExpanded((expanded) => {
              const next = !expanded;
              window.requestAnimationFrame(() => {
                (next ? replaceInputRef.current : findInputRef.current)?.focus();
              });
              return next;
            });
          }}
          title={replaceExpanded ? '收起替换' : '展开替换'}
          aria-expanded={replaceExpanded}
        >
          查找
          <span aria-hidden="true">{replaceExpanded ? '⌃' : '⌄'}</span>
        </button>
        <div className="find-input-shell">
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
          <button type="button" className={options.caseSensitive ? 'active' : ''} onClick={() => toggleOption('caseSensitive')} title="区分大小写">Aa</button>
          <button type="button" className={options.wholeWord ? 'active' : ''} onClick={() => toggleOption('wholeWord')} title="全词匹配">▥</button>
        </div>
        <button type="button" className="find-icon-button" onClick={() => move(-1)} disabled={matches.length === 0} aria-label="上一个" title="上一个">⌃</button>
        <button type="button" className="find-icon-button" onClick={() => move(1)} disabled={matches.length === 0} aria-label="下一个" title="下一个">⌄</button>
        <button type="button" className="find-icon-button find-close-button" onClick={onClose} aria-label="关闭查找" title="关闭">×</button>
      </div>
      {replaceExpanded && (
        <div className="find-row find-replace-row">
          <span className="find-replace-label">替换</span>
          <input
            ref={replaceInputRef}
            className="find-input replace-input"
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
          <button type="button" onClick={replaceCurrent} disabled={readOnly || matches.length === 0}>替换</button>
          <button type="button" onClick={replaceAll} disabled={readOnly || matches.length === 0}>全部</button>
        </div>
      )}
    </div>
  );
}
