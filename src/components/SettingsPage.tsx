import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { AppUpdateState, UpdateCheckResult } from '../services/updateService';
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
  preloadImageSection,
  preloadPreviewSection,
  preloadTerminalSection,
} from './settings/preloadSections';

type SettingsSection =
  | 'general'
  | 'editor'
  | 'image'
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
const ImageSection = lazy(preloadImageSection);
const PreviewSection = lazy(preloadPreviewSection);
const AppearanceSection = lazy(preloadAppearanceSection);
const ExportSection = lazy(preloadExportSection);
const HtmlExportSection = lazy(preloadHtmlExportSection);
const TerminalSection = lazy(preloadTerminalSection);
const AiCliSection = lazy(preloadAiCliSection);
const AboutSection = lazy(preloadAboutSection);

interface SettingsPageProps {
  onClose: () => void;
  onCheckForUpdate: () => Promise<UpdateCheckResult>;
  updateState: AppUpdateState;
  onUpdateAction: () => void;
  onIgnoreUpdate: () => void;
  onShowIgnoredUpdate: () => void;
  // P1-E:从外部指定打开的初始段(例如场景卡「未找到 Claude」→ 'aiCli')
  initialSection?: SettingsSection;
}

type NavItem = { id: SettingsSection; labelKey: Parameters<typeof translate>[1] };

const NAV_GROUPS: Array<{
  labelKey: Parameters<typeof translate>[1];
  items: NavItem[];
}> = [
  {
    labelKey: 'settingsGroupWriting',
    items: [
      { id: 'general', labelKey: 'navGeneral' },
      { id: 'editor', labelKey: 'navEditor' },
      { id: 'image', labelKey: 'navImage' },
    ],
  },
  {
    labelKey: 'settingsGroupPresentation',
    items: [
      { id: 'preview', labelKey: 'navPreview' },
      { id: 'appearance', labelKey: 'navAppearance' },
      { id: 'export', labelKey: 'navExport' },
      { id: 'htmlExport', labelKey: 'navHtmlExport' },
    ],
  },
  {
    labelKey: 'settingsGroupTools',
    items: [
      { id: 'terminal', labelKey: 'navTerminal' },
      { id: 'aiCli', labelKey: 'navAiCli' },
    ],
  },
];

const ABOUT_ITEM: NavItem = { id: 'about', labelKey: 'navAbout' };

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

export function SettingsPage({
  onClose,
  onCheckForUpdate,
  updateState,
  onUpdateAction,
  onIgnoreUpdate,
  onShowIgnoredUpdate,
  initialSection,
}: SettingsPageProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>(initialSection ?? 'general');
  const settings = useSettings();
  const t = (key: Parameters<typeof translate>[1]) => translate(settings.locale, key);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }, [onClose]);

  useEffect(() => {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      openerRef.current?.focus();
    };
  }, [handleKeyDown]);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
    ) ?? []).filter((element) => !element.hasAttribute('hidden'));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="settings-overlay" onClick={handleOverlayClick}>
      <div
        ref={dialogRef}
        className="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
        onKeyDown={handleDialogKeyDown}
      >
        <div className="settings-modal-sidebar">
          <h2 id="settings-dialog-title" className="settings-title">{t('settingsTitle')}</h2>
          <nav className="settings-nav" aria-label={t('settingsNavLabel')}>
            {NAV_GROUPS.map((group) => (
              <div className="settings-nav-group" key={group.labelKey}>
                <div className="settings-nav-group-label">{t(group.labelKey)}</div>
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    className={`settings-nav-item ${activeSection === item.id ? 'active' : ''}`}
                    aria-current={activeSection === item.id ? 'page' : undefined}
                    onClick={() => setActiveSection(item.id)}
                  >
                    {t(item.labelKey)}
                  </button>
                ))}
              </div>
            ))}
            <div className="settings-nav-footer">
              <button
                className={`settings-nav-item ${activeSection === ABOUT_ITEM.id ? 'active' : ''}`}
                aria-current={activeSection === ABOUT_ITEM.id ? 'page' : undefined}
                onClick={() => setActiveSection(ABOUT_ITEM.id)}
              >
                {t(ABOUT_ITEM.labelKey)}
              </button>
            </div>
          </nav>
        </div>
        <div className="settings-modal-content">
          <button
            ref={closeButtonRef}
            type="button"
            className="settings-modal-close"
            onClick={onClose}
            aria-label={t('settingsCloseLabel')}
            title={t('settingsCloseLabel')}
          >
            <X size={16} strokeWidth={1.7} />
          </button>
          <Suspense fallback={<SectionFallback />}>
            {activeSection === 'general' && <GeneralSection />}
            {activeSection === 'editor' && <EditorSection />}
            {activeSection === 'image' && <ImageSection />}
            {activeSection === 'preview' && <PreviewSection />}
            {activeSection === 'appearance' && <AppearanceSection />}
            {activeSection === 'export' && <ExportSection />}
            {activeSection === 'htmlExport' && <HtmlExportSection />}
            {activeSection === 'terminal' && <TerminalSection />}
            {activeSection === 'aiCli' && <AiCliSection />}
            {activeSection === 'about' && (
              <AboutSection
                onCheckForUpdate={onCheckForUpdate}
                updateState={updateState}
                onUpdateAction={onUpdateAction}
                onIgnoreUpdate={onIgnoreUpdate}
                onShowIgnoredUpdate={onShowIgnoredUpdate}
              />
            )}
          </Suspense>
        </div>
      </div>
    </div>
  );
}
