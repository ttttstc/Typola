import { Minus, Square, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import appIcon from '../../resources/icon.png';
import { useUIStore } from '../store/ui';

export function TitleBar() {
  const { t } = useTranslation();
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
    const nextState = await window.electronAPI.windowToggleMaximize();
    setIsMaximized(nextState);
  };
  const handleClose = () => window.electronAPI.windowClose();

  return (
    <div className="titlebar-drag">
      <div className="titlebar-icon">
        <img
          src={appIcon}
          alt="Typola"
          style={{
            width: '16px',
            height: '16px',
            borderRadius: '3px',
          }}
          onError={(e) => {
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

      <div className="titlebar-spacer" />

      <div className="titlebar-no-drag">
        <button
          onClick={toggleTheme}
          title={t('titleBar.switchThemeTo', {
            theme: theme === 'light' ? t('titleBar.darkTheme') : t('titleBar.lightTheme'),
          })}
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
          title={t('titleBar.minimize')}
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
          title={isMaximized ? t('titleBar.restore') : t('titleBar.maximize')}
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
          title={t('titleBar.close')}
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
