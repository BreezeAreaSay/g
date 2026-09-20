// Shown instead of the app when VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
// are missing from the build. This is a deploy/setup diagnostic, not a
// feature employees are meant to ever see — so unlike the rest of the app
// it's not run through i18n (ru/en fixed text is enough to unblock whoever
// is setting the site up, in whichever of those two they read).
export function ConfigMissingScreen() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-50 p-6">
      <div className="max-w-md space-y-4 text-center">
        <p className="text-lg font-semibold text-slate-900">
          Сайт ещё не настроен
        </p>
        <p className="text-sm text-slate-600">
          Не заданы ключи Supabase (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY).
          Задайте их и пересоберите сайт — подробности в README.md, раздел
          «Настройка Supabase».
        </p>
        <hr className="border-slate-200" />
        <p className="text-xs text-slate-400">
          Site is not configured yet: Supabase keys (VITE_SUPABASE_URL,
          VITE_SUPABASE_ANON_KEY) are missing from this build. See README.md
          for setup steps, then rebuild and redeploy.
        </p>
      </div>
    </div>
  );
}
