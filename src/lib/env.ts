// Fails loudly at startup if the app was built without the required
// environment variables, instead of showing a confusing blank screen.
function readEnv(name: string): string {
  const value = import.meta.env[name];
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy .env.example to .env.local and fill it in ` +
        `(see README.md "Переменные окружения").`,
    );
  }
  return value;
}

export const SUPABASE_URL = readEnv("VITE_SUPABASE_URL");
export const SUPABASE_ANON_KEY = readEnv("VITE_SUPABASE_ANON_KEY");
// Optional: push notifications (added in Stage 4) degrade gracefully without it.
export const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) ?? "";
