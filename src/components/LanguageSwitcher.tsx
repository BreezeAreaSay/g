import { useState } from "react";
import { useTranslation } from "react-i18next";
import { changeLanguage, SUPPORTED_LANGUAGES, type SupportedLanguage } from "@/i18n";

const FLAGS: Record<SupportedLanguage, string> = { ru: "🇷🇺", en: "🇬🇧", pt: "🇵🇹" };
const LABELS: Record<SupportedLanguage, string> = { ru: "Русский", en: "English", pt: "Português" };

/** Compact switcher for the header — unlike LanguagePicker (full-screen, first visit only). */
export function LanguageSwitcher({ onChange }: { onChange?: (lang: SupportedLanguage) => void }) {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const current: SupportedLanguage = (SUPPORTED_LANGUAGES as readonly string[]).includes(i18n.language)
    ? (i18n.language as SupportedLanguage)
    : "ru";

  async function pick(lang: SupportedLanguage) {
    setOpen(false);
    if (lang === current) return;
    await changeLanguage(lang);
    onChange?.(lang);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Language / Язык / Idioma"
        className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-lg shadow-sm active:bg-slate-100"
      >
        {FLAGS[current]}
      </button>
      {open && (
        <>
          {/* Full-screen click-catcher to close on outside tap — sits below the menu, above everything else. */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 w-44 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
            {SUPPORTED_LANGUAGES.map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => void pick(lang)}
                className={`flex min-h-12 w-full items-center gap-3 px-4 text-left text-sm font-medium ${
                  lang === current ? "bg-slate-100 text-slate-900" : "text-slate-700 active:bg-slate-50"
                }`}
              >
                <span className="text-lg">{FLAGS[lang]}</span>
                {LABELS[lang]}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
