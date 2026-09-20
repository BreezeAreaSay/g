import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { ShortageRequest, ShortageResponse } from "@/types/database";

export function useShortageRequests(weekId: string | null) {
  const [requests, setRequests] = useState<ShortageRequest[]>([]);
  const [myResponses, setMyResponses] = useState<ShortageResponse[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!weekId) return;
    const [{ data: reqData, error: reqError }, { data: respData, error: respError }] = await Promise.all([
      supabase.from("shortage_requests").select("*").eq("week_id", weekId),
      // RLS already scopes this to "my own responses" for a non-admin session.
      supabase.from("shortage_responses").select("*"),
    ]);
    if (!reqError) setRequests((reqData as ShortageRequest[]) ?? []);
    if (!respError) setMyResponses((respData as ShortageResponse[]) ?? []);
    setLoading(false);
  }, [weekId]);

  useEffect(() => {
    if (!weekId) return;
    void refetch();
    const channel = supabase
      .channel(`shortage-requests-${weekId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "shortage_requests" }, () => void refetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "shortage_responses" }, () => void refetch())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [weekId, refetch]);

  return { requests, myResponses, loading, refetch };
}
