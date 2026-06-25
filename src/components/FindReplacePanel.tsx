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
  onNavigate: (match: SearchMatch, query: string, options: SearchOptions, backwards?: boolean) => void;
};

const defaultOptions: SearchOptions = {
  caseSensitive: false,
  wholeWord: false,
  regex: false,
};

// 见 focus useEffect 内注释。
const EARLY_RETRY_MS = 50;
const LATE_RETRY_MS = 200;

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
  // 展开状态(对齐 Typora 范式):面板每次打开默认折叠(只显示查找),Ctrl+H 触发时
  // 才展开第二行;面板打开期间用户可手动 toggle 且不会被 focusTarget 后续变化覆盖。
  // 关闭重新打开重置初始状态。
  const [expanded, setExpanded] = useState(false);
  const wasVisibleRef = useRef(visible);
  useEffect(() => {
    if (visible && !wasVisibleRef.current) {
      setExpanded(focusTarget === 'replace');
    }
    wasVisibleRef.current = visible;
  }, [focusTarget, visible]);
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
    // 多次 focus 兜底 Vditor IR selectionchange 异步抢回焦点的场景:
    // Esc 关搜索后 IR 抢焦 → 再 Ctrl+F → 必须确保 input 拿到并保持焦点,
    // 否则后续 type 会注入文档(破坏内容)。
    //
    // 三段抢焦的时间点是实测推导:
    // - 立即 + rAF:覆盖 React commit 后第一帧
    // - EARLY_RETRY_MS = 50ms:覆盖 Vditor selectionchange 在 microtask 回调里
    //   call editor.focus() 的链路
    // - LATE_RETRY_MS = 200ms:兜底 Windows WebView2 偶发的 input focus reset
    //   (实测 Tauri Webview 在快速键盘输入时会丢一次 focus 事件)
    const grab = () => {
      const input = focusTarget === 'replace' ? replaceInputRef.current : findInputRef.current;
      if (!input) return;
      input.focus();
      input.select();
    };
    grab();
    const raf = window.requestAnimationFrame(grab);
    const t1 = window.setTimeout(grab, EARLY_RETRY_MS);
    const t2 = window.setTimeout(grab, LATE_RETRY_MS);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [focusTarget, visible]);

  useEffect(() => {
    if (!visible || matches.length === 0) return;
    onNavigate(matches[Math.min(activeIndex, matches.length - 1)], deferredQuery, options);
  }, [activeIndex, deferredQuery, matches, onNavigate, options, visible]);

  // F3 / Shift+F3 桥接:AppLayout 全局快捷键 dispatch CustomEvent,
  // 面板收到后自己 advance activeIndex。比把整套 search state(query/options/matches/index)
  // 上提到 AppLayout 改动小,不引入新 store。
  useEffect(() => {
    if (!visible) return;
    const onHop = (event: Event) => {
      const dir = (event as CustomEvent<1 | -1>).detail;
      if (matches.length === 0) return;
      const next = (activeIndex + dir + matches.length) % matches.length;
      setActiveIndex(next);
      onNavigate(matches[next], deferredQuery, options, dir < 0);
    };
    window.addEventListener('typola:find-hop', onHop);
    return () => window.removeEventListener('typola:find-hop', onHop);
  }, [activeIndex, deferredQuery, matches, onNavigate, options, visible]);

  if (!visible) return null;

  const current = matches.length === 0 ? 0 : Math.min(activeIndex + 1, matches.length);

  const move = (direction: 1 | -1) => {
    if (matches.length === 0) return;
    const next = (activeIndex + direction + matches.length) % matches.length;
    setActiveIndex(next);
    onNavigate(matches[next], deferredQuery, options, direction < 0);
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

  // 替换行默认折叠;Ctrl+H 触发时(focusTarget='replace')自动展开;用户可手动 toggle。
  // 不用 useState 持久化 expanded 在 visible 切换间 —— 关闭再打开应该回到默认状态。
  return (
    <div className="find-panel" role="dialog" aria-label="文件内查找替换" data-expanded={expanded}>
      <button
        type="button"
        className="find-toggle"
        aria-label={expanded ? '收起替换' : '展开替换'}
        title={expanded ? '收起替换' : '展开替换'}
        onClick={() => setExpanded((v) => !v)}
        disabled={readOnly && !expanded}
      >
        <span className={`find-toggle-caret ${expanded ? 'open' : ''}`}>▶</span>
      </button>
      <div className="find-rows">
        <div className="find-row">
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
          <span className="find-count">{current}/{matches.length}</span>
          <button type="button" className={options.caseSensitive ? 'find-opt active' : 'find-opt'} onClick={() => toggleOption('caseSensitive')} title="区分大小写">Aa</button>
          <button type="button" className={options.wholeWord ? 'find-opt active' : 'find-opt'} onClick={() => toggleOption('wholeWord')} title="全字匹配">词</button>
          <button type="button" className={options.regex ? 'find-opt active' : 'find-opt'} onClick={() => toggleOption('regex')} title="正则表达式">.*</button>
          <button type="button" className="find-nav" onClick={() => move(-1)} disabled={matches.length === 0} title="上一个 (Shift+Enter)">▲</button>
          <button type="button" className="find-nav" onClick={() => move(1)} disabled={matches.length === 0} title="下一个 (Enter)">▼</button>
          <button type="button" className="find-close" onClick={onClose} aria-label="关闭查找" title="关闭 (Esc)">×</button>
        </div>
        {expanded && (
          <div className="find-row">
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
            <button type="button" className="find-action" onClick={replaceCurrent} disabled={readOnly || matches.length === 0} title="替换 (Enter)">替换</button>
            <button type="button" className="find-action" onClick={replaceAll} disabled={readOnly || matches.length === 0} title="全部替换">全部</button>
          </div>
        )}
      </div>
    </div>
  );
}
