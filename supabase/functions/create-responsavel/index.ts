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
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: roleData } = await adminClient
      .from("user_roles").select("role").eq("user_id", caller.id).eq("role", "responsavel").maybeSingle();
    if (!roleData) {
      return new Response(JSON.stringify({ error: "Apenas responsáveis podem adicionar outros responsáveis" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: callerProfile } = await adminClient
      .from("profiles").select("familia_id").eq("user_id", caller.id).single();
    if (!callerProfile) {
      return new Response(JSON.stringify({ error: "Perfil não encontrado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { nome, email, password } = await req.json();
    if (!nome || !email || !password) {
      return new Response(JSON.stringify({ error: "Nome, email e senha são obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (password.length < 6) {
      return new Response(JSON.stringify({ error: "A senha deve ter pelo menos 6 caracteres" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create user - trigger will auto-create a NEW family for responsavel
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { nome, tipo_perfil: "responsavel" },
    });

    if (createError) {
      const msg = createError.message.includes("already been registered")
        ? "Este email já está cadastrado" : createError.message;
      return new Response(JSON.stringify({ error: msg }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get the auto-created (wrong) family from the trigger
    const { data: newProfile } = await adminClient
      .from("profiles").select("familia_id").eq("user_id", newUser.user.id).single();
    
    const orphanFamiliaId = newProfile?.familia_id;

    // Update profile to the correct family
    await adminClient
      .from("profiles")
      .update({ familia_id: callerProfile.familia_id })
      .eq("user_id", newUser.user.id);

    // Delete orphan family if different
    if (orphanFamiliaId && orphanFamiliaId !== callerProfile.familia_id) {
      await adminClient.from("familia").delete().eq("id", orphanFamiliaId);
    }

    return new Response(JSON.stringify({ success: true, userId: newUser.user.id }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
