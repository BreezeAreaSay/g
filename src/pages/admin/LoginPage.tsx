import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAdminSession } from "@/context/AdminSessionContext";
import { Button } from "@/components/Button";

export function AdminLoginPage() {
  const { t } = useTranslation();
  const { status, signIn, signOut } = useAdminSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
    } catch {
      setError(t("admin.login.error"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col justify-center bg-slate-50 px-6 py-10">
      <div className="mx-auto w-full max-w-sm">
        <h1 className="text-2xl font-bold text-slate-900">{t("admin.login.title")}</h1>

        {status === "not-admin" && (
          <div className="mt-4 space-y-3 rounded-2xl border border-amber-300 bg-amber-50 p-4">
            <p className="text-sm font-medium text-amber-800">{t("admin.login.notAdmin")}</p>
            <Button variant="secondary" onClick={() => void signOut()}>
              {t("common.logout")}
            </Button>
          </div>
        )}

        <form onSubmit={(e) => void handleSubmit(e)} className="mt-8 space-y-5">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-700">
              {t("admin.login.email")}
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="min-h-14 w-full rounded-2xl border border-slate-300 bg-white px-4 text-base"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-700">
              {t("admin.login.password")}
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="min-h-14 w-full rounded-2xl border border-slate-300 bg-white px-4 text-base"
            />
          </div>

          {error && <p className="text-sm font-medium text-red-600">{error}</p>}

          <Button type="submit" disabled={submitting}>
            {t("admin.login.submit")}
          </Button>
        </form>
      </div>
    </div>
  );
}
