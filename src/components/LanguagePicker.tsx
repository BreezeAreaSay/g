import { changeLanguage, type SupportedLanguage } from "@/i18n";
import { useTranslation } from "react-i18next";

const OPTIONS: { code: SupportedLanguage; label: string; flag: string }[] = [
  { code: "ru", label: "Русский", flag: "🇷🇺" },
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "pt", label: "Português", flag: "🇵🇹" },
];

export function LanguagePicker({ onChosen }: { onChosen: () => void }) {
  const { t } = useTranslation();

  async function pick(code: SupportedLanguage) {
    await changeLanguage(code);
    onChosen();
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-slate-50 px-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-slate-900">{t("language.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("language.subtitle")}</p>
      </div>
      <div className="w-full max-w-sm space-y-3">
        {OPTIONS.map((opt) => (
          <button
            key={opt.code}
            onClick={() => void pick(opt.code)}
            className="flex min-h-16 w-full items-center gap-4 rounded-2xl border border-slate-200 bg-white px-6 text-lg font-medium text-slate-900 shadow-sm active:bg-slate-100"
          >
            <span className="text-2xl">{opt.flag}</span>
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
