export type AppLanguage = 'zh' | 'en';

export function normalizeLanguage(language: string | null | undefined): AppLanguage | null {
  if (!language) return null;

  const normalized = language.toLowerCase();

  if (normalized.startsWith('zh')) {
    return 'zh';
  }

  if (normalized.startsWith('en')) {
    return 'en';
  }

  return null;
}

export function resolveLanguage(
  language: string | null | undefined,
  fallback: AppLanguage = 'en'
): AppLanguage {
  return normalizeLanguage(language) ?? fallback;
}
