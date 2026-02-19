import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { target } = await req.json(); // "crianca" or "responsavel"
    const today = new Date().toISOString().split('T')[0];
    const results: { user_id: string; sent: boolean; message?: string }[] = [];

    if (target === 'crianca') {
      // Get all children profiles
      const { data: children } = await supabase
        .from('profiles')
        .select('user_id, nome, familia_id')
        .eq('tipo_perfil', 'crianca');

      if (!children) {
        return new Response(JSON.stringify({ sent: 0, results: [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      for (const child of children) {
        // Count pending tasks for today
        const { count: tarefasPendentes } = await supabase
          .from('tarefa')
          .select('*', { count: 'exact', head: true })
          .eq('atribuida_a', child.user_id)
          .eq('familia_id', child.familia_id)
          .eq('status', 'a_fazer')
          .eq('data_prevista', today);

        // Count unchecked regras de ouro for today
        const { data: config } = await supabase
          .from('configuracao_familia')
          .select('regras_ouro, regras_ouro_inativas')
          .eq('crianca_id', child.user_id)
          .eq('familia_id', child.familia_id)
          .single();

        let deveresPendentes = 0;
        if (config?.regras_ouro) {
          const regrasAtivas = (config.regras_ouro as string[]).filter(
            (r: string) => !(config.regras_ouro_inativas as string[] || []).includes(r)
          );

          const { count: checkinsDone } = await supabase
            .from('regra_ouro_checkin')
            .select('*', { count: 'exact', head: true })
            .eq('crianca_id', child.user_id)
            .eq('familia_id', child.familia_id)
            .eq('data', today)
            .eq('cumprida', true);

          deveresPendentes = Math.max(0, regrasAtivas.length - (checkinsDone || 0));
        }

        // Only send if there's something to report
        if ((tarefasPendentes || 0) === 0 && deveresPendentes === 0) {
          results.push({ user_id: child.user_id, sent: false, message: 'Nothing to report' });
          continue;
        }

        const parts: string[] = [];
        if (tarefasPendentes && tarefasPendentes > 0) {
          parts.push(`${tarefasPendentes} tarefa${tarefasPendentes > 1 ? 's' : ''}`);
        }
        if (deveresPendentes > 0) {
          parts.push(`${deveresPendentes} dever${deveresPendentes > 1 ? 'es' : ''}`);
        }

        const body = `Bom dia, ${child.nome}! Hoje você tem ${parts.join(' e ')} pendente${parts.length > 1 || (tarefasPendentes || 0) + deveresPendentes > 1 ? 's' : ''}. Bora lá! 🚀`;

        // Call send-push edge function
        await sendPush(supabaseUrl, serviceRoleKey, {
          user_id: child.user_id,
          title: '☀️ Resumo do dia',
          body,
          url: '/crianca',
          tag: 'daily-digest',
        });

        results.push({ user_id: child.user_id, sent: true });
      }
    } else if (target === 'responsavel') {
      // Get all parent profiles
      const { data: parents } = await supabase
        .from('profiles')
        .select('user_id, nome, familia_id')
        .eq('tipo_perfil', 'responsavel');

      if (!parents) {
        return new Response(JSON.stringify({ sent: 0, results: [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      for (const parent of parents) {
        // Count tasks pending approval
        const { count: tarefasAprovacao } = await supabase
          .from('tarefa')
          .select('*', { count: 'exact', head: true })
          .eq('familia_id', parent.familia_id)
          .eq('status', 'pendente_aprovacao');

        // Count pending redemptions
        const { count: resgatesPendentes } = await supabase
          .from('resgate_recompensa')
          .select('*', { count: 'exact', head: true })
          .eq('familia_id', parent.familia_id)
          .eq('status', 'pendente');

        // Count dispensa requests
        const { count: dispensas } = await supabase
          .from('tarefa')
          .select('*', { count: 'exact', head: true })
          .eq('familia_id', parent.familia_id)
          .eq('status', 'dispensa_solicitada');

        const total = (tarefasAprovacao || 0) + (resgatesPendentes || 0) + (dispensas || 0);

        if (total === 0) {
          results.push({ user_id: parent.user_id, sent: false, message: 'Nothing to report' });
          continue;
        }

        const parts: string[] = [];
        if (tarefasAprovacao && tarefasAprovacao > 0) {
          parts.push(`${tarefasAprovacao} tarefa${tarefasAprovacao > 1 ? 's' : ''} aguardando aprovação`);
        }
        if (resgatesPendentes && resgatesPendentes > 0) {
          parts.push(`${resgatesPendentes} resgate${resgatesPendentes > 1 ? 's' : ''} pendente${resgatesPendentes > 1 ? 's' : ''}`);
        }
        if (dispensas && dispensas > 0) {
          parts.push(`${dispensas} pedido${dispensas > 1 ? 's' : ''} de dispensa`);
        }

        const body = `Resumo: ${parts.join(', ')}. Veja agora 📋`;

        await sendPush(supabaseUrl, serviceRoleKey, {
          user_id: parent.user_id,
          title: '📊 Resumo do dia',
          body,
          url: '/responsavel',
          tag: 'daily-digest',
        });

        results.push({ user_id: parent.user_id, sent: true });
      }
    } else {
      return new Response(
        JSON.stringify({ error: 'target must be "crianca" or "responsavel"' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ sent: results.filter(r => r.sent).length, total: results.length, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function sendPush(
  supabaseUrl: string,
  serviceRoleKey: string,
  payload: { user_id: string; title: string; body: string; url?: string; tag?: string }
) {
  const response = await fetch(`${supabaseUrl}/functions/v1/send-push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify(payload),
  });
  return response;
}
