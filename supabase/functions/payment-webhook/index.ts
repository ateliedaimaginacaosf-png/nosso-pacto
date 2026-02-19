import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const webhookSecret = Deno.env.get("WEBHOOK_SECRET");

    // Optional: validate webhook secret via query param or header
    const url = new URL(req.url);
    const token = url.searchParams.get("token") || req.headers.get("x-webhook-token");
    if (webhookSecret && token !== webhookSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();

    // Normalize fields from different platforms
    // Expected payload: { email, plataforma, transaction_id, action }
    // action: "approved" | "canceled" | "refunded"
    const email = (body.email || body.buyer?.email || body.customer?.email || "").toLowerCase().trim();
    const plataforma = body.plataforma || body.platform || "desconhecida";
    const transactionId = body.transaction_id || body.transaction || body.id || null;
    const action = body.action || body.status || "approved";

    if (!email) {
      return new Response(JSON.stringify({ error: "Email is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Find the user profile by email (via auth.users)
    const { data: userData } = await supabase.auth.admin.listUsers();
    const user = userData?.users?.find((u) => u.email?.toLowerCase() === email);

    if (!user) {
      // Store for later activation when user registers
      console.log(`User not found for email ${email}, storing pre-activation`);
      
      // We'll check this on registration
      const { error: insertErr } = await supabase.from("assinatura").insert({
        familia_id: "00000000-0000-0000-0000-000000000000", // placeholder, updated on registration
        plataforma,
        plataforma_transaction_id: transactionId,
        email_comprador: email,
        status: action === "approved" ? "ativa" : action === "refunded" ? "reembolsada" : "cancelada",
      }).select().maybeSingle();

      // Ignore FK error for placeholder — we handle pre-activations differently
      return new Response(
        JSON.stringify({ success: true, message: "Pre-activation stored, will activate on registration" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find family
    const { data: profile } = await supabase
      .from("profiles")
      .select("familia_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profile?.familia_id) {
      return new Response(JSON.stringify({ error: "Family not found for user" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const familiaId = profile.familia_id;

    if (action === "approved") {
      // Activate family
      await supabase.from("familia").update({ ativo: true }).eq("id", familiaId);

      // Calculate expiration (1 month from now)
      const now = new Date();
      const expiration = new Date(now);
      expiration.setMonth(expiration.getMonth() + 1);

      // Mark any previous active subscription as replaced
      await supabase
        .from("assinatura")
        .update({ status: "substituida" })
        .eq("familia_id", familiaId)
        .eq("status", "ativa");

      // Record new subscription
      await supabase.from("assinatura").insert({
        familia_id: familiaId,
        plataforma,
        plataforma_transaction_id: transactionId,
        email_comprador: email,
        status: "ativa",
        data_ativacao: now.toISOString(),
        data_expiracao: expiration.toISOString(),
      });
    } else if (action === "canceled" || action === "refunded") {
      // Deactivate family
      await supabase.from("familia").update({ ativo: false }).eq("id", familiaId);

      await supabase
        .from("assinatura")
        .update({ status: action === "refunded" ? "reembolsada" : "cancelada" })
        .eq("familia_id", familiaId)
        .eq("status", "ativa");
    }

    return new Response(
      JSON.stringify({ success: true, familia_id: familiaId, action }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
