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

    // Validate webhook secret via Hotmart's X-Hotmart-Hottok header, or fallback to query param / custom header
    const token = req.headers.get("x-hotmart-hottok") || req.headers.get("x-webhook-token") || new URL(req.url).searchParams.get("token");
    if (webhookSecret && token !== webhookSecret) {
      console.log("Unauthorized webhook attempt");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    console.log("Webhook received:", JSON.stringify(body).substring(0, 500));

    // Normalize Hotmart payload format
    // Hotmart sends: { event, data: { buyer: { email }, purchase: { transaction, status }, subscription: { status } } }
    const hotmartEvent = body.event || "";
    const hotmartData = body.data || {};
    const hotmartBuyer = hotmartData.buyer || {};
    const hotmartPurchase = hotmartData.purchase || {};
    const hotmartSubscription = hotmartData.subscription || {};

    // Extract email: Hotmart format first, then generic fallback
    const email = (hotmartBuyer.email || body.email || body.buyer?.email || body.customer?.email || "").toLowerCase().trim();
    
    // Determine platform
    const plataforma = hotmartEvent ? "hotmart" : (body.plataforma || body.platform || "desconhecida");
    
    // Extract transaction ID
    const transactionId = hotmartPurchase.transaction || body.transaction_id || body.transaction || body.id || null;

    // Map Hotmart events to internal actions
    const hotmartEventMap: Record<string, string> = {
      "PURCHASE_APPROVED": "approved",
      "PURCHASE_CANCELED": "canceled",
      "PURCHASE_REFUNDED": "refunded",
      "PURCHASE_EXPIRED": "expired",
      "SUBSCRIPTION_CANCELLATION": "subscription_cancellation",
    };
    
    const rawAction = hotmartEvent 
      ? (hotmartEventMap[hotmartEvent] || hotmartEvent.toLowerCase())
      : (body.action || body.status || "approved").toLowerCase().trim();
    
    console.log(`Processed: email=${email}, action=${rawAction}, platform=${plataforma}, tx=${transactionId}`);

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
      const mappedStatus = ["approved", "active", "reactivated"].includes(rawAction) ? "ativa" 
        : rawAction === "refunded" ? "reembolsada" 
        : "cancelada";
      const { error: insertErr } = await supabase.from("assinatura").insert({
        familia_id: "00000000-0000-0000-0000-000000000000",
        plataforma,
        plataforma_transaction_id: transactionId,
        email_comprador: email,
        status: mappedStatus,
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

    // Normalize action into categories
    const activateActions = ["approved", "active", "reactivated"];
    const deactivateActions = ["canceled", "refunded", "expired", "subscription_cancellation", "overdue", "past_due"];

    if (activateActions.includes(rawAction)) {
      // Activate family
      await supabase.from("familia").update({ ativo: true }).eq("id", familiaId);

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
        data_ativacao: new Date().toISOString(),
      });

    } else if (deactivateActions.includes(rawAction)) {
      // Deactivate family
      await supabase.from("familia").update({ ativo: false }).eq("id", familiaId);

      const statusMap: Record<string, string> = {
        refunded: "reembolsada",
        canceled: "cancelada",
        subscription_cancellation: "cancelada",
        expired: "expirada",
        overdue: "inadimplente",
        past_due: "inadimplente",
      };

      await supabase
        .from("assinatura")
        .update({ status: statusMap[rawAction] || "cancelada" })
        .eq("familia_id", familiaId)
        .eq("status", "ativa");

    } else {
      console.log(`Unknown action: ${rawAction}, ignoring`);
    }

    return new Response(
      JSON.stringify({ success: true, familia_id: familiaId, action: rawAction }),
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
