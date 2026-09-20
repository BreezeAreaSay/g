import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { ScheduleWeek } from "@/types/database";

/**
 * Loads the single active week (spec §36: v1 supports exactly one). Reads
 * are cheap and this rarely changes, so a plain fetch-on-mount is enough —
 * no realtime subscription needed here.
 */
export function useActiveWeek() {
  const [week, setWeek] = useState<ScheduleWeek | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data, error } = await supabase
        .from("schedule_weeks")
        .select("*")
        .eq("is_active", true)
        .maybeSingle();
      if (cancelled) return;
      if (error) setError(error.message);
      else setWeek(data as ScheduleWeek | null);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { week, loading, error };
}
