import { getThemeDefinition } from './themeRegistry';

export const THEME_TRANSITION_DURATION_MS = 260;

const transitionTimers = new WeakMap<Document, number>();

export function applyThemeToDocument(targetDocument: Document, themeId: unknown): void {
  const theme = getThemeDefinition(themeId);
  const root = targetDocument.documentElement;
  const shouldTransition = Boolean(root.dataset.themeId && root.dataset.themeId !== theme.id);

  root.dataset.themeId = theme.id;
  root.dataset.colorScheme = theme.scheme;
  delete root.dataset.theme;
  root.style.colorScheme = theme.scheme;

  const win = targetDocument.defaultView;
  if (!shouldTransition || !win) return;

  const previousTimer = transitionTimers.get(targetDocument);
  if (previousTimer !== undefined) {
    win.clearTimeout(previousTimer);
  }

  root.dataset.themeTransition = 'true';
  const timer = win.setTimeout(() => {
    delete root.dataset.themeTransition;
    transitionTimers.delete(targetDocument);
  }, THEME_TRANSITION_DURATION_MS);
  transitionTimers.set(targetDocument, timer);
}
