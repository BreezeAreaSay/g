import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabaseClient";
import type { AuditLogEntry } from "@/types/database";

const PAGE_SIZE = 50;

export function AdminHistoryPage() {
  const { t, i18n } = useTranslation();
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data, error } = await supabase
        .from("audit_log")
        .select("*")
        .order("occurred_at", { ascending: false })
        .limit(PAGE_SIZE);
      if (!cancelled && !error) setEntries((data as AuditLogEntry[]) ?? []);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <p className="text-sm text-slate-500">{t("common.loading")}</p>;

  return (
    <div>
      <h1 className="text-xl font-bold text-slate-900">{t("history.title")}</h1>
      {entries.length === 0 ? (
        <p className="mt-4 text-sm text-slate-400">{t("history.empty")}</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {entries.map((entry) => (
            <li key={entry.id} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-900">
                  {t(`history.actions.${entry.action}`, { defaultValue: entry.action })}
                </span>
                <span className="text-xs text-slate-400">
                  {new Date(entry.occurred_at).toLocaleString(i18n.language, { dateStyle: "short", timeStyle: "short" })}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">{t(`history.actor.${entry.actor_type}`)}</p>
              <ValueDiff oldValue={entry.old_value} newValue={entry.new_value} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const SKIP_KEYS = new Set(["id", "created_at", "updated_at", "week_id"]);

function ValueDiff({ oldValue, newValue }: { oldValue: Record<string, unknown> | null; newValue: Record<string, unknown> | null }) {
  if (!oldValue && !newValue) return null;

  const keys = new Set([...Object.keys(oldValue ?? {}), ...Object.keys(newValue ?? {})]);
  const rows = [...keys]
    .filter((k) => !SKIP_KEYS.has(k))
    .map((k) => ({ key: k, before: oldValue?.[k], after: newValue?.[k] }))
    .filter((row) => oldValue === null || newValue === null || JSON.stringify(row.before) !== JSON.stringify(row.after));

  if (rows.length === 0) return null;

  return (
    <dl className="mt-1.5 space-y-0.5 text-xs text-slate-500">
      {rows.slice(0, 6).map((row) => (
        <div key={row.key} className="flex gap-1">
          <dt className="font-medium">{row.key}:</dt>
          <dd className="truncate">
            {oldValue && newValue ? `${format(row.before)} → ${format(row.after)}` : format(row.after ?? row.before)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function format(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
