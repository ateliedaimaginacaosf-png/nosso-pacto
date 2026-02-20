import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

type RealtimeTable =
  | "tarefa"
  | "resgate_recompensa"
  | "transacao"
  | "regra_ouro_checkin"
  | "notificacao"
  | "profiles";

/**
 * Subscribes to realtime changes on specified tables and automatically
 * invalidates the related React Query cache keys.
 * Uses debounce to prevent cascading refetches that can freeze the app.
 */
export function useRealtimeSubscription(
  tables: RealtimeTable[],
  queryKeys: string[][]
) {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const familiaId = profile?.familia_id;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debouncedInvalidate = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      queryKeys.forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });
    }, 800);
  }, [queryClient, queryKeys.map(k => k.join(",")).join("|")]);

  useEffect(() => {
    if (!familiaId || tables.length === 0) return;

    const channel = supabase.channel(`realtime-${tables.join("-")}`);

    tables.forEach((table) => {
      channel.on(
        "postgres_changes" as any,
        {
          event: "*",
          schema: "public",
          table,
          filter: `familia_id=eq.${familiaId}`,
        },
        () => {
          debouncedInvalidate();
        }
      );
    });

    channel.subscribe();

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      supabase.removeChannel(channel);
    };
  }, [familiaId, tables.join(","), debouncedInvalidate]);
}
