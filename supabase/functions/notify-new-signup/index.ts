import { Resend } from "npm:resend@4.0.0";

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
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      throw new Error("RESEND_API_KEY not configured");
    }

    const resend = new Resend(resendKey);
    const { nome, email } = await req.json();

    if (!nome || !email) {
      return new Response(
        JSON.stringify({ error: "nome and email are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const now = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

    const { error } = await resend.emails.send({
      from: "Nosso Pacto <onboarding@resend.dev>",
      to: ["nossopactoapp@gmail.com"],
      subject: `🆕 Novo cadastro: ${nome}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #333;">Novo cadastro no Nosso Pacto! 🎉</h2>
          <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
            <tr>
              <td style="padding: 8px 12px; font-weight: bold; color: #555; border-bottom: 1px solid #eee;">Nome</td>
              <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">${nome}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; font-weight: bold; color: #555; border-bottom: 1px solid #eee;">E-mail</td>
              <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">${email}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; font-weight: bold; color: #555;">Data/Hora</td>
              <td style="padding: 8px 12px;">${now}</td>
            </tr>
          </table>
          <p style="margin-top: 20px; color: #888; font-size: 12px;">Este é um e-mail automático do sistema Nosso Pacto.</p>
        </div>
      `,
    });

    if (error) {
      console.error("Resend error:", error);
      throw new Error(JSON.stringify(error));
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
