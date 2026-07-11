import type { AppSettings } from './settingsService';
import { applyDefineColorToDocument, clearDefineColorFromDocument } from './defineColorSystem/applyDefineColorToDocument';
import { applyThemeToDocument } from './themeDom';
import { syncThemeTitleBarColor } from './windowChrome';

export function applyAppearanceToDocument(targetDocument: Document, settings: AppSettings): void {
  if (settings.appearanceColorSystem === 'define-color') {
    applyDefineColorToDocument(targetDocument, settings.defineColorSettings);
    return;
  }
  clearDefineColorFromDocument(targetDocument);
  targetDocument.documentElement.dataset.colorSystem = 'static-theme';
  applyThemeToDocument(targetDocument, settings.themeId);
  syncThemeTitleBarColor(targetDocument);
}
