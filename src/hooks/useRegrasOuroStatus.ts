import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays } from "date-fns";

/**
 * Hook to check if a child is blocked from redeeming rewards
 * based on yesterday's golden rules compliance.
 */
export function useRegrasOuroStatus(criancaId: string | undefined, familiaId: string | undefined) {
  const yesterday = format(subDays(new Date(), 1), "yyyy-MM-dd");
  const today = format(new Date(), "yyyy-MM-dd");

  // Get the active golden rules from family config PER CHILD
  const { data: config } = useQuery({
    queryKey: ["config-familia", familiaId, criancaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("configuracao_familia")
        .select("regras_ouro, direitos")
        .eq("familia_id", familiaId!)
        .eq("crianca_id", criancaId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!familiaId && !!criancaId,
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
      const uniqueDays = new Set(data.map((d) => d.data));
      return uniqueDays.size;
    },
    enabled: !!criancaId && !!familiaId,
  });

  const regrasOuro = config?.regras_ouro ?? [];
  const hasRules = regrasOuro.length > 0;

  // Determine if blocked: check if any rule was NOT fulfilled yesterday
  // BUT only if there are checkins for yesterday (first day = no block)
  let bloqueado = false;
  if (hasRules && checkinsOntem !== undefined && checkinsOntem.length > 0) {
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
