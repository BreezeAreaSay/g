import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { currentPermission, isPushSupported } from "@/lib/push";

export function NotificationPermissionBanner({ onEnable }: { onEnable: () => Promise<boolean> }) {
  const { t } = useTranslation();
  const [permission, setPermission] = useState(currentPermission());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPermission(currentPermission());
  }, []);

  if (!isPushSupported() || permission === "granted") return null;

  async function handleEnable() {
    setBusy(true);
    try {
      await onEnable();
    } finally {
      setBusy(false);
      setPermission(currentPermission());
    }
  }

  return (
    <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-semibold text-slate-900">{t("notificationsPermission.title")}</p>
      <p className="mt-1 text-sm text-slate-500">{t("notificationsPermission.body")}</p>
      {permission === "denied" ? (
        <p className="mt-2 text-xs font-medium text-amber-600">{t("notificationsPermission.denied")}</p>
      ) : (
        <button
          disabled={busy}
          onClick={() => void handleEnable()}
          className="mt-3 min-h-11 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white"
        >
          {t("notificationsPermission.enable")}
        </button>
      )}
    </div>
  );
}
