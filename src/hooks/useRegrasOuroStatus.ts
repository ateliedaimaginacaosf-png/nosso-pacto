import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays } from "date-fns";

/**
 * Hook to check if a child is blocked from redeeming rewards
 * based on yesterday's golden rules compliance.
 * 
 * Returns:
 * - bloqueado: true if any golden rule was not fulfilled yesterday
 * - liberacao: override data if parent has unblocked for today
 * - regrasOntem: yesterday's checkin data
 * - diasDescumpridos: number of recent days with non-compliance (last 30 days)
 */
export function useRegrasOuroStatus(criancaId: string | undefined, familiaId: string | undefined) {
  const yesterday = format(subDays(new Date(), 1), "yyyy-MM-dd");
  const today = format(new Date(), "yyyy-MM-dd");

  // Get the active golden rules from family config
  const { data: config } = useQuery({
    queryKey: ["config-familia", familiaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("configuracao_familia")
        .select("regras_ouro")
        .eq("familia_id", familiaId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!familiaId,
  });

  // Get yesterday's checkins for this child
  const { data: checkinsOntem } = useQuery({
    queryKey: ["regra-ouro-checkin", criancaId, yesterday],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("regra_ouro_checkin")
        .select("*")
        .eq("crianca_id", criancaId!)
        .eq("familia_id", familiaId!)
        .eq("data", yesterday);
      if (error) throw error;
      return data;
    },
    enabled: !!criancaId && !!familiaId,
  });

  // Get today's liberation override
  const { data: liberacao } = useQuery({
    queryKey: ["regra-ouro-liberacao", criancaId, today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("regra_ouro_liberacao")
        .select("*")
        .eq("crianca_id", criancaId!)
        .eq("familia_id", familiaId!)
        .eq("data", today)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!criancaId && !!familiaId,
  });

  // Count non-compliance days in last 30 days
  const thirtyDaysAgo = format(subDays(new Date(), 30), "yyyy-MM-dd");
  const { data: diasDescumpridos } = useQuery({
    queryKey: ["regra-ouro-descumprimentos", criancaId, thirtyDaysAgo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("regra_ouro_checkin")
        .select("data, cumprida")
        .eq("crianca_id", criancaId!)
        .eq("familia_id", familiaId!)
        .eq("cumprida", false)
        .gte("data", thirtyDaysAgo);
      if (error) throw error;
      // Count unique days with at least one non-compliance
      const uniqueDays = new Set(data.map((d) => d.data));
      return uniqueDays.size;
    },
    enabled: !!criancaId && !!familiaId,
  });

  const regrasOuro = config?.regras_ouro ?? [];
  const hasRules = regrasOuro.length > 0;

  // Determine if blocked: check if any rule was NOT fulfilled yesterday
  let bloqueado = false;
  if (hasRules && checkinsOntem !== undefined) {
    const checkinMap = new Map(checkinsOntem.map((c) => [c.regra, c.cumprida]));
    // Blocked if any rule is missing or marked as not fulfilled
    bloqueado = regrasOuro.some((regra) => !checkinMap.get(regra));
  }

  // If parent has overridden, check the type
  const efetivamenteBloqueado = bloqueado && !liberacao;
  const limiteLiberdade = liberacao?.tipo === "limite_moedas" ? liberacao.limite_moedas : null;

  return {
    bloqueado: efetivamenteBloqueado,
    bloqueadoOriginal: bloqueado,
    liberacao,
    limiteLiberdade,
    regrasOuro,
    hasRules,
    checkinsOntem,
    diasDescumpridos: diasDescumpridos ?? 0,
  };
}
