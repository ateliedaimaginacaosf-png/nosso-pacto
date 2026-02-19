import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Find active subscriptions that have expired
    const { data: expired, error: fetchErr } = await supabase
      .from("assinatura")
      .select("id, familia_id")
      .eq("status", "ativa")
      .lt("data_expiracao", new Date().toISOString());

    if (fetchErr) throw fetchErr;

    if (!expired || expired.length === 0) {
      return new Response(
        JSON.stringify({ message: "No expired subscriptions found", count: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let deactivatedCount = 0;

    for (const sub of expired) {
      // Mark subscription as expired
      await supabase
        .from("assinatura")
        .update({ status: "expirada" })
        .eq("id", sub.id);

      // Check if family has any other active subscription
      const { data: otherActive } = await supabase
        .from("assinatura")
        .select("id")
        .eq("familia_id", sub.familia_id)
        .eq("status", "ativa")
        .limit(1);

      // If no other active subscription, deactivate family
      if (!otherActive || otherActive.length === 0) {
        await supabase
          .from("familia")
          .update({ ativo: false })
          .eq("id", sub.familia_id);
        deactivatedCount++;
      }
    }

    console.log(`Processed ${expired.length} expired subscriptions, deactivated ${deactivatedCount} families`);

    return new Response(
      JSON.stringify({
        success: true,
        expired_subscriptions: expired.length,
        deactivated_families: deactivatedCount,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Check subscriptions error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
