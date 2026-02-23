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
        // Get all families with members count and subscription info
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

          // Get emails for members
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

      case "delete_tarefas": {
        const { familia_id } = params;
        // Delete interactions first
        await admin.from("tarefa_interacao").delete().eq("familia_id", familia_id);
        // Delete recurrence rules
        await admin.from("tarefa_recorrente").delete().eq("familia_id", familia_id);
        // Delete tasks
        await admin.from("tarefa").delete().eq("familia_id", familia_id);
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "delete_recompensas": {
        const { familia_id } = params;
        // Delete resgate interactions
        await admin.from("resgate_interacao").delete().eq("familia_id", familia_id);
        // Delete resgates
        await admin.from("resgate_recompensa").delete().eq("familia_id", familia_id);
        // Delete recompensas
        await admin.from("recompensa").delete().eq("familia_id", familia_id);
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "delete_transacoes": {
        const { familia_id } = params;
        await admin.from("transacao").delete().eq("familia_id", familia_id);
        // Reset saldo
        await admin.from("profiles").update({ saldo_moedas: 0 }).eq("familia_id", familia_id);
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "delete_familia": {
        const { familia_id } = params;
        // Delete all related data in order
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

        // Get members to delete auth users
        const { data: members } = await admin
          .from("profiles")
          .select("user_id")
          .eq("familia_id", familia_id);

        // Delete push subscriptions, profiles, roles, then auth users
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
        // Find user by email
        const { data: users } = await admin.auth.admin.listUsers();
        const user = users?.users?.find(
          (u: any) => u.email?.toLowerCase() === email.toLowerCase()
        );
        if (!user) throw new Error("User not found: " + email);

        // Check if already admin
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
