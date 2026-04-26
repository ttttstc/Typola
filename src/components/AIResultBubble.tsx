import { useMemo } from 'react';
import { useAIStore } from '../store/ai';
import { insertTextBelowSelection, replaceSelectionWithText } from '../ai/selection';

function getBubblePosition(rect: { left: number; top: number; bottom: number }) {
  const width = 360;
  const padding = 16;
  let left = rect.left;
  let top = rect.bottom + 12;

  if (left + width + padding > window.innerWidth) {
    left = window.innerWidth - width - padding;
  }

  if (left < padding) {
    left = padding;
  }

  if (top + 260 > window.innerHeight) {
    top = Math.max(padding, rect.top - 272);
  }

  return {
    left,
    top,
    width,
  };
}

export function AIResultBubble() {
  const resultState = useAIStore((state) => state.resultState);
  const clearResultState = useAIStore((state) => state.clearResultState);

  const bubblePosition = useMemo(() => {
    if (!resultState) return null;
    return getBubblePosition(resultState.selection.rect);
  }, [resultState]);

  if (!resultState || !bubblePosition) {
    return null;
  }

  const handleApply = () => {
    const applied = replaceSelectionWithText(resultState.selection, resultState.result.text);
    if (!applied) {
      useAIStore.setState({
        lastError: 'Could not apply the result to the current selection.',
      });
    }
    clearResultState();
  };

  const handleInsertBelow = () => {
    const inserted = insertTextBelowSelection(resultState.selection, resultState.result.text);
    if (!inserted) {
      useAIStore.setState({
        lastError: 'Could not insert the result below the selection.',
      });
    }
    clearResultState();
  };

  return (
    <div
      style={{
        position: 'fixed',
        left: bubblePosition.left,
        top: bubblePosition.top,
        width: bubblePosition.width,
        background: 'var(--color-paper)',
        border: '1px solid var(--color-line-soft)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: '0 12px 32px rgba(0, 0, 0, 0.16)',
        padding: '14px',
        zIndex: 3200,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          marginBottom: '10px',
        }}
      >
        <div style={{ fontSize: '12px', color: 'var(--color-muted)' }}>
          {resultState.result.providerLabel} · {resultState.result.model}
        </div>
        <button
          onClick={clearResultState}
          style={{
            border: 'none',
            background: 'transparent',
            color: 'var(--color-muted)',
            cursor: 'pointer',
            padding: 0,
            fontSize: '12px',
          }}
        >
          Discard
        </button>
      </div>

      <div
        style={{
          maxHeight: '220px',
          overflow: 'auto',
          whiteSpace: 'pre-wrap',
          fontSize: '13px',
          lineHeight: 1.6,
          color: 'var(--color-ink)',
          background: 'var(--color-surface-sunken)',
          borderRadius: 'var(--radius-md)',
          padding: '12px',
        }}
      >
        {resultState.result.text}
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '8px',
          marginTop: '12px',
        }}
      >
        <button
          onClick={clearResultState}
          style={{
            height: '32px',
            padding: '0 12px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--color-line-soft)',
            background: 'var(--color-paper)',
            color: 'var(--color-ink)',
            cursor: 'pointer',
          }}
        >
          丢弃
        </button>
        <button
          onClick={handleInsertBelow}
          style={{
            height: '32px',
            padding: '0 12px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--color-line-soft)',
            background: 'var(--color-surface-sunken)',
            color: 'var(--color-ink)',
            cursor: 'pointer',
          }}
        >
          插入下方
        </button>
        <button
          onClick={handleApply}
          style={{
            height: '32px',
            padding: '0 12px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid transparent',
            background: 'var(--color-ink)',
            color: 'var(--color-paper)',
            cursor: 'pointer',
          }}
        >
          应用
        </button>
      </div>
    </div>
  );
}
