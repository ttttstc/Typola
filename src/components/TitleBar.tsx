import { Minus, Square, X } from 'lucide-react';
import { useUIStore } from '../store/ui';
import { useState, useEffect } from 'react';

export function TitleBar() {
  const theme = useUIStore((s) => s.theme);
  const toggleTheme = useUIStore((s) => s.toggleTheme);
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    const checkMaximized = async () => {
      setIsMaximized(await window.electronAPI.windowIsMaximized());
    };
    checkMaximized();

    const cleanup = window.electronAPI.onMaximizedChange((isMaximized: boolean) => {
      setIsMaximized(isMaximized);
    });

    return () => cleanup();
  }, []);

  const handleMinimize = () => window.electronAPI.windowMinimize();
  const handleMaximize = async () => {
    if (isMaximized) {
      await window.electronAPI.windowUnmaximize();
    } else {
      await window.electronAPI.windowMaximize();
    }
    setIsMaximized(!isMaximized);
  };
  const handleClose = () => window.electronAPI.windowClose();

  return (
    <div
      data-tauri-drag-region
      style={{
        height: 'var(--titlebar-height)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'var(--color-paper)',
        borderBottom: '1px solid var(--color-line-soft)',
        padding: '0 8px',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <img
          src="/resources/icons/32x32.png"
          alt="Typola"
          style={{
            width: '16px',
            height: '16px',
            borderRadius: '3px',
          }}
          onError={(e) => {
            // Fallback if icon not found
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
        <span
          style={{
            fontWeight: 600,
            fontSize: '13px',
            color: 'var(--color-ink)',
          }}
        >
          Typola
        </span>
      </div>

      <div
        data-tauri-drag-region
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          flex: 1,
          justifyContent: 'center',
        }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <button
          onClick={toggleTheme}
          title={`切换到${theme === 'light' ? '暗色' : '亮色'}主题 (Ctrl+Shift+D)`}
          style={{
            width: '28px',
            height: '28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--color-muted)',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
          }}
        >
          {theme === 'light' ? '🌙' : '☀️'}
        </button>
        <button
          onClick={handleMinimize}
          title="最小化"
          style={{
            width: '28px',
            height: '28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--color-muted)',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
          }}
        >
          <Minus size={14} />
        </button>
        <button
          onClick={handleMaximize}
          title={isMaximized ? '还原' : '最大化'}
          style={{
            width: '28px',
            height: '28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--color-muted)',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
          }}
        >
          {isMaximized ? (
            <svg width="12" height="12" viewBox="0 0 12 12">
              <rect x="2" y="4" width="6" height="6" fill="none" stroke="currentColor" strokeWidth="1"/>
              <path d="M4 4V2h6v6h-2" fill="none" stroke="currentColor" strokeWidth="1"/>
            </svg>
          ) : (
            <Square size={12} />
          )}
        </button>
        <button
          onClick={handleClose}
          title="关闭"
          style={{
            width: '28px',
            height: '28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--color-muted)',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#e81123';
            e.currentTarget.style.color = 'white';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'var(--color-muted)';
          }}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
