import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useEmployeeSession } from "@/context/EmployeeSessionContext";
import { hasChosenLanguage } from "@/i18n";
import { LanguagePicker } from "@/components/LanguagePicker";
import { Button } from "@/components/Button";
import type { StaffRole } from "@/types/database";
import { STAFF_ROLES } from "@/types/database";

export function WelcomePage() {
  const { t } = useTranslation();
  const { register } = useEmployeeSession();
  const [languageChosen, setLanguageChosen] = useState(hasChosenLanguage());
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [roles, setRoles] = useState<StaffRole[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!languageChosen) {
    return <LanguagePicker onChosen={() => setLanguageChosen(true)} />;
  }

  function toggleRole(role: StaffRole) {
    setRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) return setError(t("register.errorNameRequired"));
    if (!phone.trim()) return setError(t("register.errorPhoneRequired"));
    if (roles.length === 0) return setError(t("register.errorRoleRequired"));

    setSubmitting(true);
    try {
      await register(name.trim(), phone.trim(), roles);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/anonymous/i.test(message)) {
        setError(t("register.errorAuthUnavailable"));
      } else {
        setError(t("common.unknownError"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col justify-center bg-slate-50 px-6 py-10">
      <div className="mx-auto w-full max-w-sm">
        <h1 className="text-2xl font-bold text-slate-900">{t("register.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("register.subtitle")}</p>

        <form onSubmit={(e) => void handleSubmit(e)} className="mt-8 space-y-5">
          <div>
            <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-slate-700">
              {t("register.nameLabel")}
            </label>
            <input
              id="name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("register.namePlaceholder")}
              className="min-h-14 w-full rounded-2xl border border-slate-300 bg-white px-4 text-base"
            />
          </div>

          <div>
            <label htmlFor="phone" className="mb-1.5 block text-sm font-medium text-slate-700">
              {t("register.phoneLabel")}
            </label>
            <input
              id="phone"
              type="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={t("register.phonePlaceholder")}
              className="min-h-14 w-full rounded-2xl border border-slate-300 bg-white px-4 text-base"
            />
            <p className="mt-1.5 text-xs text-slate-500">{t("register.phoneHint")}</p>
          </div>

          <div>
            <span className="mb-1.5 block text-sm font-medium text-slate-700">{t("register.rolesLabel")}</span>
            <div className="flex gap-3">
              {STAFF_ROLES.map((role) => {
                const active = roles.includes(role);
                return (
                  <button
                    type="button"
                    key={role}
                    onClick={() => toggleRole(role)}
                    aria-pressed={active}
                    className={`min-h-14 flex-1 rounded-2xl border px-4 text-sm font-semibold ${
                      active
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-300 bg-white text-slate-700"
                    }`}
                  >
                    {t(`roles.${role}`)}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-xs text-slate-500">{t("register.rolesHint")}</p>
          </div>

          {error && <p className="text-sm font-medium text-red-600">{error}</p>}

          <Button type="submit" disabled={submitting}>
            {t("register.submit")}
          </Button>
        </form>
      </div>
    </div>
  );
}
