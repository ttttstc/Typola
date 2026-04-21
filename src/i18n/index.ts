import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import zh from '../locales/zh.json';
import en from '../locales/en.json';
import { resolveLanguage, type AppLanguage } from '../shared/language';

const resources = {
  zh: { translation: zh },
  en: { translation: en },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    supportedLngs: ['zh', 'en'],
    load: 'languageOnly',
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
  });

export function getInitialLanguage(): AppLanguage {
  return resolveLanguage(
    i18n.resolvedLanguage ?? i18n.language,
    resolveLanguage(typeof navigator !== 'undefined' ? navigator.language : undefined, 'en')
  );
}

export default i18n;
