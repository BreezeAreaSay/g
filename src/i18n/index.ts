import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import ru from "./locales/ru.json";
import en from "./locales/en.json";
import pt from "./locales/pt.json";

export const SUPPORTED_LANGUAGES = ["ru", "en", "pt"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_STORAGE_KEY = "restaurant-schedule.language";

export function getStoredLanguage(): SupportedLanguage | null {
  try {
    const value = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return (SUPPORTED_LANGUAGES as readonly string[]).includes(value ?? "")
      ? (value as SupportedLanguage)
      : null;
  } catch {
    // localStorage can throw in private-browsing modes; treat as "no choice yet".
    return null;
  }
}

export function setStoredLanguage(lang: SupportedLanguage) {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  } catch {
    // ignore — worst case the user picks their language again next visit
  }
}

/** True once the visitor has explicitly picked a language (spec §2: manual choice, no auto-detection). */
export function hasChosenLanguage(): boolean {
  return getStoredLanguage() !== null;
}

export async function changeLanguage(lang: SupportedLanguage) {
  setStoredLanguage(lang);
  await i18n.changeLanguage(lang);
}

void i18n
  .use(initReactI18next)
  .init({
    resources: {
      ru: { translation: ru },
      en: { translation: en },
      pt: { translation: pt },
    },
    lng: getStoredLanguage() ?? "ru",
    fallbackLng: "ru",
    interpolation: { escapeValue: false },
    returnNull: false,
  });

export default i18n;
