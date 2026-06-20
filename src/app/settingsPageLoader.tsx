import { lazy } from 'react';

const loadSettingsPage = () =>
  import('../components/SettingsPage').then(async (module) => {
    // Warm the default section chunk alongside the settings page so the
    // first tab is interactive as soon as the modal mounts.
    const { preloadGeneralSection } = await import('../components/settings/preloadSections');
    void preloadGeneralSection();
    return { default: module.SettingsPage };
  });

let settingsPagePreload: ReturnType<typeof loadSettingsPage> | undefined;

export function preloadSettingsPage() {
  settingsPagePreload ??= loadSettingsPage();
  return settingsPagePreload;
}

export function preloadSettingsPageInBackground() {
  if (import.meta.env.MODE === 'test') return;
  void preloadSettingsPage();
}

export const SettingsPage = lazy(preloadSettingsPage);

export function SettingsPageFallback() {
  return (
    <div className="settings-overlay settings-overlay--loading" aria-hidden="true">
      <div className="settings-modal settings-modal-skeleton">
        <div className="settings-modal-sidebar settings-skeleton-sidebar">
          <div className="settings-skeleton-title" />
          <div className="settings-skeleton-nav">
            {Array.from({ length: 8 }, (_, index) => (
              <div key={index} className="settings-skeleton-line" />
            ))}
          </div>
        </div>
        <div className="settings-modal-content settings-skeleton-content">
          <div className="settings-skeleton-heading" />
          <div className="settings-skeleton-row" />
          <div className="settings-skeleton-row" />
          <div className="settings-skeleton-row short" />
        </div>
      </div>
    </div>
  );
}
