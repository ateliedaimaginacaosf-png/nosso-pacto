import { useEffect, useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

interface BadgeDef {
  id: string;
  nome: string;
  emoji: string;
  criterio: string;
  meta_valor: number | null;
}

interface NewBadge {
  nome: string;
  emoji: string;
}

export function useBadgeChecker(userId?: string, familiaId?: string) {
  const queryClient = useQueryClient();
  const [newBadge, setNewBadge] = useState<NewBadge | null>(null);

  const checkBadges = useCallback(async () => {
    if (!userId || !familiaId) return;

    // Fetch all badge definitions
    const { data: allBadges } = await supabase
      .from("badge")
      .select("id, nome, emoji, criterio, meta_valor");
    if (!allBadges?.length) return;

    // Fetch already unlocked badges
    const { data: unlocked } = await supabase
      .from("badge_desbloqueio")
      .select("badge_id")
      .eq("user_id", userId);
    const unlockedIds = new Set((unlocked ?? []).map((u) => u.badge_id));

    // Filter to only check locked badges
    const locked = (allBadges as BadgeDef[]).filter((b) => !unlockedIds.has(b.id));
    if (!locked.length) return;

    // Gather stats needed for checks
    const [tarefasRes, resgatesRes, transacoesRes] = await Promise.all([
      supabase
        .from("tarefa")
        .select("id, data_prevista, status", { count: "exact" })
        .eq("atribuida_a", userId)
        .eq("status", "concluida"),
      supabase
        .from("resgate_recompensa")
        .select("id", { count: "exact" })
        .eq("crianca_id", userId)
        .in("status", ["aprovada", "utilizada"]),
      supabase
        .from("transacao")
        .select("saldo_posterior")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1),
    ]);

    const tarefasConcluidas = tarefasRes.count ?? 0;
    const resgatesFeitos = resgatesRes.count ?? 0;
    const maxSaldo = (transacoesRes.data?.[0]?.saldo_posterior as number) ?? 0;

    // Check total coins ever earned
    const { data: totalGanhoData } = await supabase
      .from("transacao")
      .select("quantidade_moedas")
      .eq("user_id", userId)
      .in("tipo", ["ganho_tarefa", "bonus"]);
    const totalGanho = (totalGanhoData ?? []).reduce((s, t) => s + t.quantidade_moedas, 0);

    for (const badge of locked) {
      let shouldUnlock = false;

      switch (badge.criterio) {
        case "primeira_tarefa":
          shouldUnlock = tarefasConcluidas >= (badge.meta_valor ?? 1);
          break;
        case "primeiro_resgate":
          shouldUnlock = resgatesFeitos >= (badge.meta_valor ?? 1);
          break;
        case "moedas_acumuladas":
          shouldUnlock = totalGanho >= (badge.meta_valor ?? 100);
          break;
        case "tarefas_concluidas":
          shouldUnlock = tarefasConcluidas >= (badge.meta_valor ?? 10);
          break;
        case "dia_perfeito": {
          // Check if today all tasks are completed
          const hoje = new Date().toISOString().slice(0, 10);
          const { count: totalHoje } = await supabase
            .from("tarefa")
            .select("id", { count: "exact", head: true })
            .eq("atribuida_a", userId)
            .eq("data_prevista", hoje)
            .not("status", "eq", "arquivada");
          const { count: concluidasHoje } = await supabase
            .from("tarefa")
            .select("id", { count: "exact", head: true })
            .eq("atribuida_a", userId)
            .eq("data_prevista", hoje)
            .eq("status", "concluida");
          shouldUnlock = (totalHoje ?? 0) > 0 && totalHoje === concluidasHoje;
          break;
        }
        case "streak_deveres": {
          // Check consecutive days with all golden rules fulfilled
          const meta = badge.meta_valor ?? 7;
          const { data: configData } = await supabase
            .from("configuracao_familia")
            .select("regras_ouro")
            .eq("crianca_id", userId)
            .eq("familia_id", familiaId)
            .maybeSingle();
          const regras = (configData?.regras_ouro as string[] | null) ?? [];
          if (regras.length === 0) break;

          let streak = 0;
          for (let d = 1; d <= meta + 5; d++) {
            const date = new Date();
            date.setDate(date.getDate() - d);
            const dateStr = date.toISOString().slice(0, 10);
            const { data: checkins } = await supabase
              .from("regra_ouro_checkin")
              .select("regra, cumprida")
              .eq("crianca_id", userId)
              .eq("familia_id", familiaId)
              .eq("data", dateStr);
            const cumpridas = (checkins ?? []).filter((c) => c.cumprida).map((c) => c.regra);
            const allDone = regras.every((r) => cumpridas.includes(r));
            if (allDone) {
              streak++;
              if (streak >= meta) break;
            } else {
              break;
            }
          }
          shouldUnlock = streak >= meta;
          break;
        }
        // dias_todas_tarefas — skip for now (complex)
        default:
          break;
      }

      if (shouldUnlock) {
        const { error } = await supabase.from("badge_desbloqueio").insert({
          badge_id: badge.id,
          user_id: userId,
          familia_id: familiaId,
        });
        if (!error) {
          setNewBadge({ nome: badge.nome, emoji: badge.emoji });
          queryClient.invalidateQueries({ queryKey: ["badges-desbloqueados"] });
          queryClient.invalidateQueries({ queryKey: ["badges-todos"] });
        }
      }
    }
  }, [userId, familiaId, queryClient]);

  return { checkBadges, newBadge, clearNewBadge: () => setNewBadge(null) };
}
