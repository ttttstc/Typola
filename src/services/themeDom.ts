import { getThemeDefinition } from './themeRegistry';

export function applyThemeToDocument(targetDocument: Document, themeId: unknown): void {
  const theme = getThemeDefinition(themeId);
  const root = targetDocument.documentElement;

  root.dataset.themeId = theme.id;
  root.dataset.colorScheme = theme.scheme;
  delete root.dataset.theme;
  root.style.colorScheme = theme.scheme;
}
