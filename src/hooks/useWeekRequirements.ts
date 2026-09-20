import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { StaffingRequirement } from "@/types/database";

export function useWeekRequirements(weekId: string | null) {
  const [requirements, setRequirements] = useState<StaffingRequirement[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!weekId) return;
    const { data, error } = await supabase
      .from("staffing_requirements")
      .select("*")
      .eq("week_id", weekId)
      .order("start_time", { ascending: true });
    if (!error) setRequirements((data as StaffingRequirement[]) ?? []);
    setLoading(false);
  }, [weekId]);

  useEffect(() => {
    if (!weekId) return;
    void refetch();

    const channel = supabase
      .channel(`requirements-week-${weekId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "staffing_requirements" }, () => void refetch())
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [weekId, refetch]);

  return { requirements, loading, refetch };
}
