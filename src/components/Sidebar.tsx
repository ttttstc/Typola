import { Files, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { FileTree } from './FileTree';
import { SearchPanel } from './SearchPanel';
import { useUIStore } from '../store/ui';

export function Sidebar() {
  const { t } = useTranslation();
  const sidebarTab = useUIStore((state) => state.sidebarTab);
  const setSidebarTab = useUIStore((state) => state.setSidebarTab);

  const tabs = [
    {
      id: 'files' as const,
      label: t('sidebar.files'),
      icon: Files,
    },
    {
      id: 'search' as const,
      label: t('sidebar.search'),
      icon: Search,
    },
  ];

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--color-paper)',
      }}
    >
      <div
        style={{
          display: 'flex',
          padding: '6px',
          gap: '6px',
          borderBottom: '1px solid var(--color-line-soft)',
        }}
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = tab.id === sidebarTab;

          return (
            <button
              key={tab.id}
              onClick={() => setSidebarTab(tab.id)}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                height: '30px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                cursor: 'pointer',
                fontSize: '12px',
                background: active ? 'var(--color-surface-sunken)' : 'transparent',
                color: 'var(--color-ink)',
              }}
              title={tab.label}
            >
              <Icon size={14} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {sidebarTab === 'files' ? <FileTree /> : <SearchPanel />}
      </div>
    </div>
  );
}
