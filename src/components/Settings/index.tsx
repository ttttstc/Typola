import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useUIStore, SettingsTab } from '../../store/ui';
import { X } from 'lucide-react';

function ShortcutsContent() {
  const { t } = useTranslation();

  const SHORTCUTS = [
    { label: t('shortcuts.save'), key: 'Ctrl+S' },
    { label: t('shortcuts.newFile'), key: 'Ctrl+N' },
    { label: t('shortcuts.toggleSidebar'), key: 'Ctrl+\\' },
    { label: t('shortcuts.toggleOutline'), key: 'Ctrl+Shift+\\' },
    { label: t('shortcuts.toggleTheme'), key: 'Ctrl+Shift+D' },
    { label: t('shortcuts.bold'), key: 'Ctrl+B' },
    { label: t('shortcuts.italic'), key: 'Ctrl+I' },
    { label: t('shortcuts.strikethrough'), key: 'Ctrl+Shift+S' },
    { label: t('shortcuts.inlineCode'), key: 'Ctrl+`' },
    { label: t('shortcuts.link'), key: 'Ctrl+K' },
    { label: t('shortcuts.body'), key: 'Ctrl+0' },
    { label: t('shortcuts.heading1'), key: 'Ctrl+1' },
    { label: t('shortcuts.heading2'), key: 'Ctrl+2' },
    { label: t('shortcuts.heading3'), key: 'Ctrl+3' },
    { label: t('shortcuts.openSettings'), key: 'Ctrl+,' },
  ];

  return (
    <div>
      <h2 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 600 }}>{t('shortcuts.title')}</h2>
      <div style={{ display: 'grid', gap: '8px' }}>
        {SHORTCUTS.map((s) => (
          <div
            key={s.label}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '8px 12px',
              background: 'var(--color-surface-sunken)',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            <span style={{ fontSize: '13px' }}>{s.label}</span>
            <kbd
              style={{
                padding: '4px 8px',
                background: 'var(--color-paper)',
                border: '1px solid var(--color-line-soft)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '12px',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {s.key}
            </kbd>
          </div>
        ))}
      </div>
    </div>
  );
}

function PlaceholderContent({ title }: { title: string }) {
  const { t } = useTranslation();
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '200px',
        color: 'var(--color-muted)',
        fontSize: '14px',
      }}
    >
      {title} - {t('settings.notImplemented')}
    </div>
  );
}

function GeneralContent() {
  const { t } = useTranslation();
  return <PlaceholderContent title={t('settings.general')} />;
}

function EditorContent() {
  const { t } = useTranslation();
  return <PlaceholderContent title={t('settings.editor')} />;
}

function AppearanceContent() {
  const { t } = useTranslation();
  return <PlaceholderContent title={t('settings.appearance')} />;
}

function TerminalContent() {
  const { t } = useTranslation();
  return <PlaceholderContent title={t('settings.terminal')} />;
}

function SettingsContent({ activeTab }: { activeTab: SettingsTab }) {
  switch (activeTab) {
    case 'shortcuts':
      return <ShortcutsContent />;
    case 'general':
      return <GeneralContent />;
    case 'editor':
      return <EditorContent />;
    case 'appearance':
      return <AppearanceContent />;
    case 'terminal':
      return <TerminalContent />;
    default:
      return <GeneralContent />;
  }
}

export function Settings() {
  const { t } = useTranslation();
  const settingsOpen = useUIStore((s) => s.settingsOpen);
  const settingsActiveTab = useUIStore((s) => s.settingsActiveTab);
  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen);
  const setSettingsActiveTab = useUIStore((s) => s.setSettingsActiveTab);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        setSettingsOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setSettingsOpen]);

  const TAB_GROUPS = [
    {
      label: t('settings.common') || 'Common',
      items: [
        { id: 'general' as SettingsTab, label: t('settings.general') },
        { id: 'editor' as SettingsTab, label: t('settings.editor') },
        { id: 'appearance' as SettingsTab, label: t('settings.appearance') },
      ],
    },
    {
      label: t('settings.advanced') || 'Advanced',
      items: [
        { id: 'terminal' as SettingsTab, label: t('settings.terminal') },
        { id: 'shortcuts' as SettingsTab, label: t('settings.shortcuts') },
      ],
    },
  ];

  if (!settingsOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 3000,
      }}
      onClick={() => setSettingsOpen(false)}
    >
      <div
        style={{
          background: 'var(--color-paper)',
          borderRadius: 'var(--radius-lg)',
          width: '700px',
          height: '500px',
          display: 'flex',
          overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left sidebar */}
        <div
          style={{
            width: '180px',
            borderRight: '1px solid var(--color-line-soft)',
            padding: '16px 0',
            overflow: 'auto',
          }}
        >
          {TAB_GROUPS.map((group) => (
            <div key={group.label} style={{ marginBottom: '16px' }}>
              <div
                style={{
                  padding: '6px 16px',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: 'var(--color-muted)',
                  textTransform: 'uppercase',
                }}
              >
                {group.label}
              </div>
              {group.items.map((item) => (
                <div
                  key={item.id}
                  onClick={() => setSettingsActiveTab(item.id)}
                  style={{
                    padding: '8px 16px',
                    fontSize: '13px',
                    cursor: 'pointer',
                    background:
                      settingsActiveTab === item.id
                        ? 'var(--color-surface-sunken)'
                        : 'transparent',
                    color:
                      settingsActiveTab === item.id
                        ? 'var(--color-ink)'
                        : 'var(--color-ink)',
                    borderLeft:
                      settingsActiveTab === item.id
                        ? '2px solid var(--color-accent)'
                        : '2px solid transparent',
                  }}
                  onMouseEnter={(e) => {
                    if (settingsActiveTab !== item.id) {
                      e.currentTarget.style.background = 'var(--color-surface-sunken)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (settingsActiveTab !== item.id) {
                      e.currentTarget.style.background = 'transparent';
                    }
                  }}
                >
                  {item.label}
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Right content */}
        <div style={{ flex: 1, padding: '24px', overflow: 'auto' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
            }}
          >
            <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>
              {TAB_GROUPS.flatMap((g) => g.items).find((i) => i.id === settingsActiveTab)?.label}
            </h1>
            <div
              onClick={() => setSettingsOpen(false)}
              style={{
                width: '28px',
                height: '28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                color: 'var(--color-muted)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--color-surface-sunken)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <X size={18} />
            </div>
          </div>
          <SettingsContent activeTab={settingsActiveTab} />
        </div>
      </div>
    </div>
  );
}
