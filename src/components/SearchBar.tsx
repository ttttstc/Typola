import { useEffect, useMemo, useRef } from 'react';
import { ChevronDown, ChevronUp, Replace, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useEditorStore } from '../store/editor';
import { useSearchStore } from '../store/search';
import { createSearchRegex, replaceSingleMatch, searchText, previewReplaceText } from '../shared/search';

const SEARCH_HIGHLIGHT_KEY = 'typola-search-match';
const ACTIVE_SEARCH_HIGHLIGHT_KEY = 'typola-search-active';

function clearHighlights() {
  const highlights = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights;
  highlights?.delete(SEARCH_HIGHLIGHT_KEY);
  highlights?.delete(ACTIVE_SEARCH_HIGHLIGHT_KEY);
}

function collectMatchRanges(root: HTMLElement, query: string, options: { caseSensitive: boolean; wholeWord: boolean; useRegex: boolean }) {
  const regex = createSearchRegex(query, options);
  if (!regex) return [];

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.textContent?.trim()) {
        return NodeFilter.FILTER_REJECT;
      }

      if (node.parentElement?.closest('.copy-btn')) {
        return NodeFilter.FILTER_REJECT;
      }

      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const ranges: Range[] = [];
  let current = walker.nextNode();

  while (current) {
    const text = current.textContent ?? '';
    regex.lastIndex = 0;
    let match = regex.exec(text);

    while (match) {
      if (match[0].length === 0) {
        regex.lastIndex += 1;
        match = regex.exec(text);
        continue;
      }

      const range = document.createRange();
      range.setStart(current, match.index);
      range.setEnd(current, match.index + match[0].length);
      ranges.push(range);
      match = regex.exec(text);
    }

    current = walker.nextNode();
  }

  return ranges;
}

export function SearchBar() {
  const { t } = useTranslation();
  const content = useEditorStore((state) => state.content);
  const {
    fileSearchOpen,
    fileSearchQuery,
    fileReplaceQuery,
    fileSearchOptions,
    fileSearchMatchCount,
    fileSearchActiveIndex,
    searchFileOpen,
    closeFileSearch,
    setFileSearchQuery,
    setFileReplaceQuery,
    setFileSearchOptions,
    setFileSearchMetrics,
    moveFileSearchIndex,
  } = useSearchStore();

  const searchInputRef = useRef<HTMLInputElement>(null);

  const contentMatches = useMemo(
    () => searchText(content, fileSearchQuery, fileSearchOptions, 0),
    [content, fileSearchOptions, fileSearchQuery]
  );

  useEffect(() => {
    if (fileSearchOpen) {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }
  }, [fileSearchOpen]);

  useEffect(() => {
    const editor = document.querySelector('.ProseMirror');
    if (!fileSearchOpen || !(editor instanceof HTMLElement) || !fileSearchQuery.trim()) {
      clearHighlights();
      setFileSearchMetrics(0, 0);
      return;
    }

    const ranges = collectMatchRanges(editor, fileSearchQuery, fileSearchOptions);
    const nextMatchCount = ranges.length;
    const nextActiveIndex =
      nextMatchCount === 0 ? 0 : Math.min(fileSearchActiveIndex, nextMatchCount - 1);

    setFileSearchMetrics(nextMatchCount, nextActiveIndex);

    const HighlightCtor = (window as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
    const highlights = (CSS as unknown as {
      highlights?: {
        set: (name: string, value: unknown) => void;
        delete: (name: string) => void;
      };
    }).highlights;

    clearHighlights();

    if (!HighlightCtor || !highlights || ranges.length === 0) {
      return;
    }

    highlights.set(SEARCH_HIGHLIGHT_KEY, new HighlightCtor(...ranges));
    if (ranges[nextActiveIndex]) {
      highlights.set(ACTIVE_SEARCH_HIGHLIGHT_KEY, new HighlightCtor(ranges[nextActiveIndex]));
      const target = ranges[nextActiveIndex].startContainer.parentElement;
      target?.scrollIntoView({ block: 'center', inline: 'nearest' });
    }

    return () => clearHighlights();
  }, [
    fileSearchActiveIndex,
    fileSearchOpen,
    fileSearchOptions,
    fileSearchQuery,
    setFileSearchMetrics,
  ]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f' && !event.shiftKey) {
        event.preventDefault();
        searchFileOpen(true);
      }

      if (!fileSearchOpen) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        closeFileSearch();
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        moveFileSearchIndex(event.shiftKey ? -1 : 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeFileSearch, fileSearchOpen, moveFileSearchIndex, searchFileOpen]);

  if (!fileSearchOpen) return null;

  const pushEditorContent = (nextContent: string, dirty: boolean) => {
    window.dispatchEvent(
      new CustomEvent('editor-set-content', {
        detail: {
          content: nextContent,
          dirty,
        },
      })
    );
  };

  const replaceCurrent = () => {
    const currentIndex = Math.min(fileSearchActiveIndex, Math.max(0, contentMatches.length - 1));
    const result = replaceSingleMatch(
      content,
      fileSearchQuery,
      fileReplaceQuery,
      fileSearchOptions,
      currentIndex
    );

    if (result.replaced) {
      pushEditorContent(result.nextContent, true);
    }
  };

  const replaceAll = () => {
    const result = previewReplaceText(content, fileSearchQuery, fileReplaceQuery, fileSearchOptions);
    if (result.replacementCount > 0) {
      pushEditorContent(result.nextContent, true);
    }
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: '12px',
        right: '16px',
        zIndex: 50,
        width: '440px',
        padding: '12px',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--color-line-soft)',
        background: 'var(--color-paper)',
        boxShadow: '0 12px 32px rgba(0,0,0,0.15)',
        display: 'grid',
        gap: '8px',
      }}
    >
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <input
          ref={searchInputRef}
          value={fileSearchQuery}
          placeholder={t('search.searchPlaceholder')}
          onChange={(event) => setFileSearchQuery(event.target.value)}
          style={{
            flex: 1,
            height: '34px',
            padding: '0 10px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--color-line-soft)',
            background: 'var(--color-paper)',
            color: 'var(--color-ink)',
          }}
        />
        <button
          onClick={() => moveFileSearchIndex(-1)}
          style={{
            width: '34px',
            height: '34px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--color-line-soft)',
            background: 'transparent',
            cursor: 'pointer',
          }}
        >
          <ChevronUp size={16} />
        </button>
        <button
          onClick={() => moveFileSearchIndex(1)}
          style={{
            width: '34px',
            height: '34px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--color-line-soft)',
            background: 'transparent',
            cursor: 'pointer',
          }}
        >
          <ChevronDown size={16} />
        </button>
        <button
          onClick={closeFileSearch}
          style={{
            width: '34px',
            height: '34px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--color-line-soft)',
            background: 'transparent',
            cursor: 'pointer',
          }}
        >
          <X size={16} />
        </button>
      </div>

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <input
          value={fileReplaceQuery}
          placeholder={t('search.replacePlaceholder')}
          onChange={(event) => setFileReplaceQuery(event.target.value)}
          style={{
            flex: 1,
            height: '34px',
            padding: '0 10px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--color-line-soft)',
            background: 'var(--color-paper)',
            color: 'var(--color-ink)',
          }}
        />
        <button
          onClick={replaceCurrent}
          style={{
            height: '34px',
            padding: '0 12px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--color-line-soft)',
            background: 'transparent',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {t('search.replaceCurrent')}
        </button>
        <button
          onClick={replaceAll}
          style={{
            height: '34px',
            padding: '0 12px',
            borderRadius: 'var(--radius-sm)',
            border: 'none',
            background: 'var(--color-ink)',
            color: 'var(--color-paper)',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {t('search.replaceAll')}
        </button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--color-muted)' }}>
          <input
            type="checkbox"
            checked={fileSearchOptions.caseSensitive}
            onChange={(event) => setFileSearchOptions({ caseSensitive: event.target.checked })}
          />
          <span>{t('search.caseSensitive')}</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--color-muted)' }}>
          <input
            type="checkbox"
            checked={fileSearchOptions.wholeWord}
            onChange={(event) => setFileSearchOptions({ wholeWord: event.target.checked })}
          />
          <span>{t('search.wholeWord')}</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--color-muted)' }}>
          <input
            type="checkbox"
            checked={fileSearchOptions.useRegex}
            onChange={(event) => setFileSearchOptions({ useRegex: event.target.checked })}
          />
          <span>{t('search.regex')}</span>
        </label>
        <div style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--color-muted)' }}>
          {fileSearchMatchCount === 0
            ? t('search.noResults')
            : t('search.inlineSummary', {
                current: Math.min(fileSearchActiveIndex + 1, fileSearchMatchCount),
                total: fileSearchMatchCount,
              })}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--color-muted)' }}>
        <Replace size={14} />
        <span>{t('search.inlineHint')}</span>
      </div>
    </div>
  );
}
