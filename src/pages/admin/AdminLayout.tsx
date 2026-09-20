import { NavLink, Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAdminSession } from "@/context/AdminSessionContext";
import { LoadingScreen } from "@/components/LoadingScreen";
import { AdminLoginPage } from "./LoginPage";

const TABS = [
  { to: "/admin", label: "admin.nav.dashboard", end: true },
  { to: "/admin/employees", label: "admin.nav.employees" },
];

export function AdminLayout() {
  const { t } = useTranslation();
  const { status, signOut } = useAdminSession();

  if (status === "loading") return <LoadingScreen />;
  if (status !== "admin") return <AdminLoginPage />;

  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center justify-between px-4 py-3">
          <nav className="flex gap-1 overflow-x-auto">
            {TABS.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  `whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium ${
                    isActive ? "bg-slate-900 text-white" : "text-slate-600"
                  }`
                }
              >
                {t(tab.label)}
              </NavLink>
            ))}
          </nav>
          <button onClick={() => void signOut()} className="text-sm font-medium text-slate-500">
            {t("common.logout")}
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-md px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
