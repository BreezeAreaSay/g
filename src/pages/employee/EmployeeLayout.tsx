import { Outlet } from "react-router-dom";
import { useEmployeeSession } from "@/context/EmployeeSessionContext";
import { LoadingScreen } from "@/components/LoadingScreen";
import { WelcomePage } from "./WelcomePage";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { supabase } from "@/lib/supabaseClient";
import type { SupportedLanguage } from "@/i18n";

export function EmployeeLayout() {
  const { status, employee } = useEmployeeSession();

  if (status === "loading") return <LoadingScreen />;
  if (status === "anonymous") return <WelcomePage />;

  async function persistLanguage(lang: SupportedLanguage) {
    if (!employee) return;
    // Best-effort: the switcher already changed what's on screen via i18n;
    // this just keeps preferred_language in sync so future push
    // notifications (sent server-side) come in the new language too.
    const { error } = await supabase.from("employees").update({ preferred_language: lang }).eq("id", employee.id);
    if (error) console.error("Failed to persist language preference", error);
  }

  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="sticky top-0 z-10 flex justify-end border-b border-slate-200 bg-white/95 px-4 py-2 backdrop-blur">
        <LanguageSwitcher onChange={(lang) => void persistLanguage(lang)} />
      </header>
      <main className="mx-auto max-w-md px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
