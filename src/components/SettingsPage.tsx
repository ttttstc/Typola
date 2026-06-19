import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import type { UpdateCheckResult } from '../services/updateService';
import { useSettings } from '../hooks/useSettings';
import { translate } from '../services/i18n';
import {
  preloadAboutSection,
  preloadAppearanceSection,
  preloadEditorSection,
  preloadExportSection,
  preloadGeneralSection,
  preloadHtmlExportSection,
  preloadAiCliSection,
  preloadPreviewSection,
  preloadTerminalSection,
} from './settings/preloadSections';

type AvailableUpdate = Extract<UpdateCheckResult, { status: 'available' }>;
type SettingsSection =
  | 'general'
  | 'editor'
  | 'preview'
  | 'appearance'
  | 'export'
  | 'htmlExport'
  | 'terminal'
  | 'aiCli'
  | 'about';

// Each section becomes its own chunk so opening the modal only downloads
// the default tab, and switching tabs pulls in the corresponding chunk on
// demand. Section preload helpers live in `preloadSections.ts` so this file
// stays a pure component file (required by react-refresh).
const GeneralSection = lazy(preloadGeneralSection);
const EditorSection = lazy(preloadEditorSection);
const PreviewSection = lazy(preloadPreviewSection);
const AppearanceSection = lazy(preloadAppearanceSection);
const ExportSection = lazy(preloadExportSection);
const HtmlExportSection = lazy(preloadHtmlExportSection);
const TerminalSection = lazy(preloadTerminalSection);
const AiCliSection = lazy(preloadAiCliSection);
const AboutSection = lazy(preloadAboutSection);

interface SettingsPageProps {
  onClose: () => void;
  onUpdateAvailable: (update: AvailableUpdate) => void;
  // P1-E:从外部指定打开的初始段(例如场景卡「未找到 Claude」→ 'aiCli')
  initialSection?: SettingsSection;
}

const NAV_ITEMS: { id: SettingsSection; labelKey: Parameters<typeof translate>[1] }[] = [
  { id: 'general', labelKey: 'navGeneral' },
  { id: 'editor', labelKey: 'navEditor' },
  { id: 'preview', labelKey: 'navPreview' },
  { id: 'appearance', labelKey: 'navAppearance' },
  { id: 'export', labelKey: 'navExport' },
  { id: 'htmlExport', labelKey: 'navHtmlExport' },
  { id: 'terminal', labelKey: 'navTerminal' },
  { id: 'aiCli', labelKey: 'navAiCli' },
  { id: 'about', labelKey: 'navAbout' },
];

function SectionFallback() {
  return (
    <div className="settings-section settings-section-loading" aria-hidden="true">
      <div className="settings-skeleton-heading" />
      <div className="settings-skeleton-row" />
      <div className="settings-skeleton-row" />
      <div className="settings-skeleton-row short" />
    </div>
  );
}

export function SettingsPage({ onClose, onUpdateAvailable, initialSection }: SettingsPageProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>(initialSection ?? 'general');
  const settings = useSettings();
  const t = (key: Parameters<typeof translate>[1]) => translate(settings.locale, key);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }, [onClose]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="settings-overlay" onClick={handleOverlayClick}>
      <div className="settings-modal">
        <div className="settings-modal-sidebar">
          <h2 className="settings-title">{t('settingsTitle')}</h2>
          <nav className="settings-nav">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                className={`settings-nav-item ${activeSection === item.id ? 'active' : ''}`}
                onClick={() => setActiveSection(item.id)}
              >
                {t(item.labelKey)}
              </button>
            ))}
          </nav>
        </div>
        <div className="settings-modal-content">
          <Suspense fallback={<SectionFallback />}>
            {activeSection === 'general' && <GeneralSection />}
            {activeSection === 'editor' && <EditorSection />}
            {activeSection === 'preview' && <PreviewSection />}
            {activeSection === 'appearance' && <AppearanceSection />}
            {activeSection === 'export' && <ExportSection />}
            {activeSection === 'htmlExport' && <HtmlExportSection />}
            {activeSection === 'terminal' && <TerminalSection />}
            {activeSection === 'aiCli' && <AiCliSection />}
            {activeSection === 'about' && <AboutSection onUpdateAvailable={onUpdateAvailable} />}
          </Suspense>
        </div>
      </div>
    </div>
  );
}
