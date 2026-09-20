import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { ShiftScheduleEntry } from "@/types/database";

/**
 * All shifts for the week, with employee names resolved (via the
 * phone-free shift_schedule view). Refetches on any realtime change to
 * `shifts` — at ~20 employees / 1 week, refetching the whole list is far
 * simpler than patching individual rows and is plenty fast.
 */
export function useWeekShifts(weekId: string | null) {
  const [shifts, setShifts] = useState<ShiftScheduleEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!weekId) return;
    const { data, error } = await supabase
      .from("shift_schedule")
      .select("*")
      .eq("week_id", weekId)
      .order("start_time", { ascending: true });
    if (!error) setShifts((data as ShiftScheduleEntry[]) ?? []);
    setLoading(false);
  }, [weekId]);

  useEffect(() => {
    if (!weekId) return;
    void refetch();

    const channel = supabase
      .channel(`shifts-week-${weekId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "shifts" }, () => void refetch())
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [weekId, refetch]);

  return { shifts, loading, refetch };
}
