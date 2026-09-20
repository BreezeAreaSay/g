import { useTranslation } from "react-i18next";

export function LoadingScreen() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-50">
      <p className="text-slate-500">{t("common.loading")}</p>
    </div>
  );
}
