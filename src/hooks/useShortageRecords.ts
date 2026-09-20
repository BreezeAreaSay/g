import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { ShortageRecord } from "@/types/database";

export function useShortageRecords(weekId: string | null) {
  const [records, setRecords] = useState<ShortageRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!weekId) return;
    const { data, error } = await supabase.from("shortage_records").select("*").eq("week_id", weekId);
    if (!error) setRecords((data as ShortageRecord[]) ?? []);
    setLoading(false);
  }, [weekId]);

  useEffect(() => {
    if (!weekId) return;
    void refetch();
    const channel = supabase
      .channel(`shortage-records-${weekId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "shortage_records" }, () => void refetch())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [weekId, refetch]);

  return { records, loading, refetch };
}
