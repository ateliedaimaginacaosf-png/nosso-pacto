import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Verify caller is a responsavel
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "responsavel")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Apenas responsáveis podem gerenciar membros" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get caller's familia_id
    const { data: callerProfile } = await adminClient
      .from("profiles")
      .select("familia_id")
      .eq("user_id", caller.id)
      .single();

    if (!callerProfile) {
      return new Response(JSON.stringify({ error: "Perfil não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const action = body.action;
    // Support both child_user_id (backward compat) and member_user_id
    const targetUserId = body.member_user_id || body.child_user_id;
    const { email, password } = body;

    if (!targetUserId || !action) {
      return new Response(JSON.stringify({ error: "member_user_id e action são obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify target belongs to the same family
    const { data: targetProfile } = await adminClient
      .from("profiles")
      .select("familia_id, tipo_perfil")
      .eq("user_id", targetUserId)
      .single();

    if (!targetProfile || targetProfile.familia_id !== callerProfile.familia_id) {
      return new Response(JSON.stringify({ error: "Membro não encontrado na sua família" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Prevent self-delete/deactivate
    if ((action === "delete" || action === "deactivate") && targetUserId === caller.id) {
      return new Response(JSON.stringify({ error: "Você não pode realizar esta ação em si mesmo" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "get_info") {
      const { data: userData, error: userError } = await adminClient.auth.admin.getUserById(targetUserId);
      if (userError || !userData?.user) {
        return new Response(JSON.stringify({ error: "Usuário não encontrado" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({
        email: userData.user.email,
        banned: !!userData.user.banned_until && new Date(userData.user.banned_until) > new Date(),
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update_credentials") {
      const updates: Record<string, unknown> = {};
      if (email) updates.email = email;
      if (password) {
        if (password.length < 6) {
          return new Response(JSON.stringify({ error: "A senha deve ter pelo menos 6 caracteres" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        updates.password = password;
      }
      if (Object.keys(updates).length === 0) {
        return new Response(JSON.stringify({ error: "Informe email ou senha para atualizar" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error } = await adminClient.auth.admin.updateUserById(targetUserId, updates);
      if (error) {
        const msg = error.message.includes("already been registered")
          ? "Este email já está cadastrado"
          : error.message;
        return new Response(JSON.stringify({ error: msg }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, message: "Credenciais atualizadas" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "deactivate") {
      const { error } = await adminClient.auth.admin.updateUserById(targetUserId, {
        ban_duration: "876600h",
      });
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: true, message: "Perfil desativado" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "reactivate") {
      const { error } = await adminClient.auth.admin.updateUserById(targetUserId, {
        ban_duration: "none",
      });
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: true, message: "Perfil reativado" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete") {
      const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(targetUserId);
      if (deleteAuthError) {
        return new Response(JSON.stringify({ error: deleteAuthError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      await adminClient.from("profiles").delete().eq("user_id", targetUserId);
      await adminClient.from("user_roles").delete().eq("user_id", targetUserId);
      if (targetProfile.tipo_perfil === "crianca") {
        await adminClient.from("configuracao_familia").delete().eq("crianca_id", targetUserId);
      }

      return new Response(JSON.stringify({ success: true, message: "Perfil excluído" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Ação inválida" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
