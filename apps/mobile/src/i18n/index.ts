import { getLocales } from 'expo-localization';
import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import { storage } from '@/lib/storage';
import en from './locales/en.json';
import pl from './locales/pl.json';

export const LANGUAGES = ['pl', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];

const LANGUAGE_KEY = 'language';

function isLanguage(value: unknown): value is Language {
  return LANGUAGES.includes(value as Language);
}

function initialLanguage(): Language {
  const saved = storage.getItem(LANGUAGE_KEY);
  if (isLanguage(saved)) return saved;
  const device = getLocales()[0]?.languageCode;
  return isLanguage(device) ? device : 'en';
}

const i18n = createInstance();

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, pl: { translation: pl } },
  lng: initialLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export function setLanguage(language: Language) {
  storage.setItem(LANGUAGE_KEY, language);
  void i18n.changeLanguage(language);
}

export default i18n;
