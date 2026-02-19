import { useEffect } from "react";
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
 */
export function useRealtimeSubscription(
  tables: RealtimeTable[],
  queryKeys: string[][]
) {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const familiaId = profile?.familia_id;

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
          // Invalidate all related query keys
          queryKeys.forEach((key) => {
            queryClient.invalidateQueries({ queryKey: key });
          });
        }
      );
    });

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [familiaId, tables.join(","), queryClient]);
}
