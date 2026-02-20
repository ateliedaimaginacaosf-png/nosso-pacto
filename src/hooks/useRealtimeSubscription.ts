import { useEffect, useRef, useCallback, useMemo } from "react";
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
 * Uses throttle+debounce to prevent cascading refetches.
 */
export function useRealtimeSubscription(
  tables: RealtimeTable[],
  queryKeys: string[][]
) {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const familiaId = profile?.familia_id;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastInvalidateRef = useRef(0);

  // Stabilize arrays to prevent unnecessary effect re-runs
  const tablesKey = useMemo(() => tables.sort().join(","), [tables.join(",")]);
  const queryKeysKey = useMemo(() => queryKeys.map(k => k.join(",")).join("|"), [queryKeys.map(k => k.join(",")).join("|")]);

  const invalidate = useCallback(() => {
    const now = Date.now();
    // Throttle: skip if we invalidated less than 500ms ago
    if (now - lastInvalidateRef.current < 500) return;
    lastInvalidateRef.current = now;

    queryKeys.forEach((key) => {
      queryClient.invalidateQueries({ queryKey: key });
    });
  }, [queryClient, queryKeysKey]);

  const debouncedInvalidate = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      invalidate();
    }, 1000);
  }, [invalidate]);

  useEffect(() => {
    if (!familiaId || !tablesKey) return;

    const channelName = `rt-${familiaId.slice(0, 8)}-${tablesKey}`;
    const channel = supabase.channel(channelName);

    tablesKey.split(",").forEach((table) => {
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
  }, [familiaId, tablesKey, debouncedInvalidate]);
}
