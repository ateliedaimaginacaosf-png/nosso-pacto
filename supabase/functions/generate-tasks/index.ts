import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get all active recurrence rules
    const { data: rules, error: rulesError } = await supabase
      .from("tarefa_recorrente")
      .select("*, tarefa_padrao(*)")
      .eq("ativa", true);

    if (rulesError) throw rulesError;

    const today = new Date();
    const horizon = new Date(today);
    horizon.setDate(horizon.getDate() + 30); // Generate 30 days ahead

    let created = 0;

    for (const rule of rules || []) {
      const template = rule.tarefa_padrao;
      if (!template) continue;

      const dataFim = rule.data_fim ? new Date(rule.data_fim) : horizon;
      const endDate = dataFim < horizon ? dataFim : horizon;

      // Get existing instances for this rule in the range
      const { data: existing } = await supabase
        .from("tarefa")
        .select("data_prevista")
        .eq("tarefa_recorrente_id", rule.id)
        .gte("data_prevista", today.toISOString().split("T")[0])
        .lte("data_prevista", endDate.toISOString().split("T")[0]);

      const existingDates = new Set((existing || []).map((e: any) => e.data_prevista));

      // Generate dates
      const dates: string[] = [];
      const current = new Date(Math.max(today.getTime(), new Date(rule.data_inicio).getTime()));

      while (current <= endDate) {
        const dateStr = current.toISOString().split("T")[0];
        const dayOfWeek = current.getDay();

        let shouldCreate = false;

        if (rule.periodicidade === "diaria") {
          shouldCreate = true;
        } else if (rule.periodicidade === "semanal") {
          shouldCreate = (rule.dias_semana || []).includes(dayOfWeek);
        } else if (rule.periodicidade === "quinzenal") {
          if ((rule.dias_semana || []).includes(dayOfWeek)) {
            const startDate = new Date(rule.data_inicio);
            const weeksDiff = Math.floor((current.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000));
            shouldCreate = weeksDiff % 2 === 0;
          }
        } else if (rule.periodicidade === "mensal") {
          const startDay = new Date(rule.data_inicio).getDate();
          shouldCreate = current.getDate() === startDay;
        }

        if (shouldCreate && !existingDates.has(dateStr)) {
          dates.push(dateStr);
        }

        current.setDate(current.getDate() + 1);
      }

      // Insert missing instances in batches
      if (dates.length > 0) {
        const batchSize = 50;
        for (let i = 0; i < dates.length; i += batchSize) {
          const batch = dates.slice(i, i + batchSize).map((d) => ({
            nome: template.nome,
            descricao: template.descricao,
            categoria: template.categoria,
            valor_moedas: template.valor_moedas,
            atribuida_a: rule.atribuida_a,
            familia_id: rule.familia_id,
            criada_por: rule.atribuida_a, // system-generated
            data_prevista: d,
            tarefa_recorrente_id: rule.id,
          }));

          const { error } = await supabase.from("tarefa").insert(batch);
          if (error) {
            console.error(`Error inserting batch for rule ${rule.id}:`, error);
          } else {
            created += batch.length;
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, created }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in generate-tasks:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
