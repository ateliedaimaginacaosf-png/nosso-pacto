import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify caller is admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify the caller with anon client
    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerId = claimsData.claims.sub;

    // Use service role client for admin operations
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Check if caller is admin
    const { data: adminRole } = await admin
      .from("user_roles")
      .select("id")
      .eq("user_id", callerId)
      .eq("role", "admin")
      .maybeSingle();

    if (!adminRole) {
      return new Response(JSON.stringify({ error: "Forbidden: admin role required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, ...params } = await req.json();

    switch (action) {
      case "list_families": {
        const { data: families } = await admin
          .from("familia")
          .select("id, nome, ativo, created_at, onboarding_dismissed")
          .order("created_at", { ascending: false });

        const enriched = [];
        for (const f of families || []) {
          const { data: members } = await admin
            .from("profiles")
            .select("user_id, nome, tipo_perfil, saldo_moedas, data_nascimento, created_at")
            .eq("familia_id", f.id);

          const memberDetails = [];
          for (const m of members || []) {
            const { data: authUser } = await admin.auth.admin.getUserById(m.user_id);
            memberDetails.push({
              ...m,
              email: authUser?.user?.email || "N/A",
              email_confirmed: !!authUser?.user?.email_confirmed_at,
              last_sign_in: authUser?.user?.last_sign_in_at,
            });
          }

          const { data: sub } = await admin
            .from("assinatura")
            .select("status, plataforma, data_ativacao, data_expiracao")
            .eq("familia_id", f.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          const { count: tarefaCount } = await admin
            .from("tarefa")
            .select("id", { count: "exact", head: true })
            .eq("familia_id", f.id);

          const { count: recompensaCount } = await admin
            .from("recompensa")
            .select("id", { count: "exact", head: true })
            .eq("familia_id", f.id);

          enriched.push({
            ...f,
            members: memberDetails,
            subscription: sub,
            tarefa_count: tarefaCount || 0,
            recompensa_count: recompensaCount || 0,
          });
        }

        return new Response(JSON.stringify(enriched), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "toggle_familia": {
        const { familia_id, ativo } = params;
        await admin.from("familia").update({ ativo }).eq("id", familia_id);
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "limpar_calendario": {
        const { familia_id } = params;
        // Delete task interactions
        await admin.from("tarefa_interacao").delete().eq("familia_id", familia_id);
        // Delete recurrence rules
        await admin.from("tarefa_recorrente").delete().eq("familia_id", familia_id);
        // Delete task instances
        await admin.from("tarefa").delete().eq("familia_id", familia_id);
        // Delete resgate interactions
        await admin.from("resgate_interacao").delete().eq("familia_id", familia_id);
        // Delete resgates
        await admin.from("resgate_recompensa").delete().eq("familia_id", familia_id);
        // Delete transactions and reset balances
        await admin.from("transacao").delete().eq("familia_id", familia_id);
        await admin.from("profiles").update({ saldo_moedas: 0 }).eq("familia_id", familia_id);
        // Delete regra ouro checkins and liberacoes
        await admin.from("regra_ouro_checkin").delete().eq("familia_id", familia_id);
        await admin.from("regra_ouro_liberacao").delete().eq("familia_id", familia_id);
        // Delete badges
        await admin.from("badge_desbloqueio").delete().eq("familia_id", familia_id);
        // Delete notifications
        await admin.from("notificacao").delete().eq("familia_id", familia_id);
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "delete_contrato": {
        const { familia_id } = params;
        // Delete contrato revisoes
        await admin.from("contrato_revisao").delete().eq("familia_id", familia_id);
        // Delete contrato versoes
        await admin.from("contrato_versao").delete().eq("familia_id", familia_id);
        // Reset configuracao_familia (clear regras_ouro, direitos, consequencias)
        await admin.from("configuracao_familia").update({
          regras_ouro: [],
          regras_ouro_inativas: [],
          direitos: [],
          consequencias_naturais: [],
        }).eq("familia_id", familia_id);
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "reset_tarefas_default": {
        const { familia_id, mode } = params; // mode: "delete" | "insert"
        if (mode === "delete") {
          // Check if any tarefa_recorrente references these
          await admin.from("tarefa_recorrente").delete().eq("familia_id", familia_id);
          await admin.from("tarefa_padrao").delete().eq("familia_id", familia_id);
        } else {
          // Get a responsavel from the family to use as criada_por
          const { data: resp } = await admin
            .from("profiles")
            .select("user_id")
            .eq("familia_id", familia_id)
            .eq("tipo_perfil", "responsavel")
            .limit(1)
            .maybeSingle();

          if (!resp) throw new Error("Nenhum responsável encontrado na família");

          // Delete existing defaults first
          await admin.from("tarefa_recorrente").delete().eq("familia_id", familia_id);
          await admin.from("tarefa_padrao").delete().eq("familia_id", familia_id);

          // Copy from global
          const { data: globals } = await admin
            .from("tarefa_padrao_global")
            .select("nome, descricao, categoria, valor_moedas");

          if (globals && globals.length > 0) {
            const inserts = globals.map((g: any) => ({
              familia_id,
              criada_por: resp.user_id,
              nome: g.nome,
              descricao: g.descricao,
              categoria: g.categoria,
              valor_moedas: g.valor_moedas,
            }));
            await admin.from("tarefa_padrao").insert(inserts);
          }
        }
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "reset_recompensas_default": {
        const { familia_id, mode } = params; // mode: "delete" | "insert"
        if (mode === "delete") {
          // Delete resgate interactions and resgates first
          await admin.from("resgate_interacao").delete().eq("familia_id", familia_id);
          await admin.from("resgate_recompensa").delete().eq("familia_id", familia_id);
          await admin.from("recompensa").delete().eq("familia_id", familia_id);
        } else {
          // Delete existing and re-insert from global
          await admin.from("resgate_interacao").delete().eq("familia_id", familia_id);
          await admin.from("resgate_recompensa").delete().eq("familia_id", familia_id);
          await admin.from("recompensa").delete().eq("familia_id", familia_id);

          const { data: globals } = await admin
            .from("recompensa_padrao_global")
            .select("nome, descricao, custo_moedas, exige_aprovacao");

          if (globals && globals.length > 0) {
            const inserts = globals.map((g: any) => ({
              familia_id,
              nome: g.nome,
              descricao: g.descricao,
              custo_moedas: g.custo_moedas,
              exige_aprovacao: g.exige_aprovacao,
            }));
            await admin.from("recompensa").insert(inserts);
          }
        }
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "insert_direitos_deveres": {
        const { familia_id } = params;
        // Get all children in the family with their birth dates
        const { data: children } = await admin
          .from("profiles")
          .select("user_id, data_nascimento")
          .eq("familia_id", familia_id)
          .eq("tipo_perfil", "crianca");

        if (!children || children.length === 0) {
          throw new Error("Nenhuma criança encontrada na família");
        }

        for (const child of children) {
          // Calculate age
          let idade: number | null = null;
          if (child.data_nascimento) {
            const birth = new Date(child.data_nascimento);
            const now = new Date();
            idade = now.getFullYear() - birth.getFullYear();
            const m = now.getMonth() - birth.getMonth();
            if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) {
              idade--;
            }
          }

          // Get defaults based on age
          const defaults = getContratoDefaultsPorIdade(idade);

          await admin.from("configuracao_familia").update({
            regras_ouro: defaults.regras_ouro,
            direitos: defaults.direitos,
            consequencias_naturais: defaults.consequencias_naturais,
            limite_resgate_diario: defaults.limite_resgate_diario,
          }).eq("familia_id", familia_id).eq("crianca_id", child.user_id);
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "delete_familia": {
        const { familia_id } = params;
        await admin.from("notificacao").delete().eq("familia_id", familia_id);
        await admin.from("badge_desbloqueio").delete().eq("familia_id", familia_id);
        await admin.from("regra_ouro_checkin").delete().eq("familia_id", familia_id);
        await admin.from("regra_ouro_liberacao").delete().eq("familia_id", familia_id);
        await admin.from("contrato_revisao").delete().eq("familia_id", familia_id);
        await admin.from("contrato_versao").delete().eq("familia_id", familia_id);
        await admin.from("configuracao_familia").delete().eq("familia_id", familia_id);
        await admin.from("tarefa_interacao").delete().eq("familia_id", familia_id);
        await admin.from("tarefa_recorrente").delete().eq("familia_id", familia_id);
        await admin.from("tarefa").delete().eq("familia_id", familia_id);
        await admin.from("tarefa_padrao").delete().eq("familia_id", familia_id);
        await admin.from("resgate_interacao").delete().eq("familia_id", familia_id);
        await admin.from("resgate_recompensa").delete().eq("familia_id", familia_id);
        await admin.from("recompensa").delete().eq("familia_id", familia_id);
        await admin.from("transacao").delete().eq("familia_id", familia_id);
        await admin.from("assinatura").delete().eq("familia_id", familia_id);

        const { data: members } = await admin
          .from("profiles")
          .select("user_id")
          .eq("familia_id", familia_id);

        for (const m of members || []) {
          await admin.from("push_subscription").delete().eq("user_id", m.user_id);
          await admin.from("user_roles").delete().eq("user_id", m.user_id);
          await admin.from("profiles").delete().eq("user_id", m.user_id);
          await admin.auth.admin.deleteUser(m.user_id);
        }

        await admin.from("familia").delete().eq("id", familia_id);

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "create_user": {
        const { email, password, nome, tipo_perfil, familia_id } = params;
        const { data: newUser, error: createError } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { nome, tipo_perfil, familia_id },
        });

        if (createError) throw createError;

        return new Response(JSON.stringify({ success: true, user_id: newUser.user.id }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "assign_admin": {
        const { email } = params;
        const { data: users } = await admin.auth.admin.listUsers();
        const user = users?.users?.find(
          (u: any) => u.email?.toLowerCase() === email.toLowerCase()
        );
        if (!user) throw new Error("User not found: " + email);

        const { data: existing } = await admin
          .from("user_roles")
          .select("id")
          .eq("user_id", user.id)
          .eq("role", "admin")
          .maybeSingle();

        if (!existing) {
          await admin.from("user_roles").insert({ user_id: user.id, role: "admin" });
        }

        return new Response(JSON.stringify({ success: true, user_id: user.id }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        return new Response(JSON.stringify({ error: "Unknown action" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (err) {
    console.error("Admin error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Helper: contract defaults by age (duplicated from frontend for edge function use)
type ContratoDefaults = {
  regras_ouro: string[];
  direitos: string[];
  consequencias_naturais: string[];
  limite_resgate_diario: number;
};

function getContratoDefaultsPorIdade(idade: number | null): ContratoDefaults {
  if (idade === null) return getDefaultsGenerico();
  if (idade <= 5) return getDefaults3a5();
  if (idade <= 8) return getDefaults6a8();
  if (idade <= 11) return getDefaults9a11();
  if (idade <= 14) return getDefaults12a14();
  return getDefaults15mais();
}

function getDefaults3a5(): ContratoDefaults {
  return {
    regras_ouro: ["Guardar os brinquedos depois de brincar","Escovar os dentes após as refeições (com ajuda)","Dizer 'por favor' e 'obrigado'","Dormir no horário combinado"],
    direitos: ["Escolher uma história antes de dormir","30 minutos de desenho por dia","Escolher a fruta do lanche","Brincar livremente após as tarefas"],
    consequencias_naturais: ["Se não guardar os brinquedos, eles ficam indisponíveis no dia seguinte","Se não escovar os dentes, não pode comer doce no próximo dia"],
    limite_resgate_diario: 20,
  };
}
function getDefaults6a8(): ContratoDefaults {
  return {
    regras_ouro: ["Arrumar a cama ao acordar","Escovar os dentes 3 vezes ao dia","Fazer a lição de casa antes de brincar","Colocar a roupa suja no cesto","Ser gentil com irmãos e colegas"],
    direitos: ["1 hora de tela por dia (após tarefas)","Escolher uma atividade no fim de semana","Convidar um amigo para brincar em casa","Participar da escolha do jantar uma vez por semana"],
    consequencias_naturais: ["Se não fizer a lição, perde o tempo de tela do dia","Se não arrumar a cama, não pode escolher atividade do fim de semana","Se tratar alguém com desrespeito, perde 15 minutos do tempo de lazer"],
    limite_resgate_diario: 30,
  };
}
function getDefaults9a11(): ContratoDefaults {
  return {
    regras_ouro: ["Manter o quarto organizado","Estudar pelo menos 30 minutos por dia","Tomar banho sem precisar ser lembrado","Ajudar a colocar/tirar a mesa","Respeitar horários de refeição e sono","Cuidar do material escolar"],
    direitos: ["1h30 de tela por dia (após tarefas e estudo)","Escolher um passeio mensal em família","Dormir mais tarde no fim de semana (até 22h)","Ter mesada proporcional às tarefas cumpridas","Opinar sobre as regras no contrato"],
    consequencias_naturais: ["Se não estudar, perde o tempo de tela do dia","Se não manter o quarto organizado, precisa organizá-lo antes de qualquer lazer","Se não ajudar na mesa, lava a louça sozinho(a)"],
    limite_resgate_diario: 40,
  };
}
function getDefaults12a14(): ContratoDefaults {
  return {
    regras_ouro: ["Manter o quarto e banheiro organizados","Estudar pelo menos 1 hora por dia","Respeitar horários de sono (22h em dias de escola)","Comunicar onde está e com quem quando sair","Ajudar nas tarefas domésticas combinadas","Usar celular/redes sociais com responsabilidade","Ser respeitoso na comunicação com a família"],
    direitos: ["2 horas de tela por dia","Sair com amigos nos finais de semana (com aprovação)","Ter privacidade no quarto","Participar das decisões familiares","Escolher roupas e estilo pessoal","Gerenciar parte do próprio dinheiro"],
    consequencias_naturais: ["Se não comunicar paradeiro, perde permissão de sair na próxima vez","Se usar celular de forma irresponsável, fica 24h sem ele","Se não estudar, perde tempo de tela e saídas do fim de semana","Se não ajudar em casa, não pode pedir favores extras"],
    limite_resgate_diario: 50,
  };
}
function getDefaults15mais(): ContratoDefaults {
  return {
    regras_ouro: ["Manter seus espaços organizados","Dedicar tempo adequado aos estudos","Respeitar horário de chegada combinado","Informar a família sobre planos e localização","Contribuir com tarefas domésticas semanais","Usar internet e redes sociais com consciência","Manter comunicação aberta e respeitosa"],
    direitos: ["Gerenciar o próprio tempo de tela","Sair com amigos com autonomia (comunicando)","Privacidade em seus espaços e dispositivos","Voz ativa nas decisões familiares","Gerenciar mesada com liberdade","Escolher atividades extracurriculares","Dormir no horário que considerar adequado nos fins de semana"],
    consequencias_naturais: ["Se não respeitar horário de chegada, perde autonomia de saída por uma semana","Se não contribuir em casa, perde privilégios extras","Se notas caírem, revisão do tempo livre até recuperação"],
    limite_resgate_diario: 60,
  };
}
function getDefaultsGenerico(): ContratoDefaults {
  return {
    regras_ouro: ["Manter o quarto organizado","Escovar os dentes após as refeições","Fazer as tarefas escolares no horário","Ser respeitoso com todos da família","Respeitar os horários combinados"],
    direitos: ["Tempo de lazer após cumprir as tarefas","Escolher uma atividade no fim de semana","Participar das decisões da família","Ter momentos de privacidade"],
    consequencias_naturais: ["Se não cumprir as tarefas, perde tempo de lazer do dia","Se não respeitar horários, perde privilégios do dia seguinte"],
    limite_resgate_diario: 50,
  };
}
