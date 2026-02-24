import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const prompt = `Create a professional, clean infographic-style flowchart image for a family task management app called "Nosso Pacto" (Our Pact). The image should be in PORTUGUESE (Brazilian Portuguese) and show 3 main phases connected by arrows, with a modern, colorful, child-friendly design using icons and illustrations.

PHASE 1 - "CONFIGURAÇÃO INICIAL" (left column, blue theme):
Title: "🔧 Configuração Inicial"
Steps (top to bottom with icons):
1. "📝 Cadastro do Responsável" - Parent registers account
2. "👧👦 Cadastrar Filhos" - Add children members  
3. "✅ Personalizar Tarefas" - Customize task templates
4. "🎁 Definir Recompensas" - Set up rewards with coin costs
5. "⭐ Regras de Ouro" - Define golden rules (duties)
6. "📋 Contrato de Autonomia" - Create autonomy contract

PHASE 2 - "DIA A DIA DO RESPONSÁVEL" (center column, green theme):
Title: "👨‍👩‍👧 Dia a Dia do Responsável"
Steps:
1. "📊 Painel de Acompanhamento" - Dashboard overview
2. "✅❌ Aprovar/Rejeitar Tarefas" - Review completed tasks
3. "🪙 Moedas creditadas automaticamente" - Coins auto-credited on approval
4. "🎁 Gerenciar Resgates" - Manage reward redemptions
5. "💬 Registrar Interações" - Log praise/feedback
6. "📈 Consultar Histórico" - View coin history

PHASE 3 - "DIA A DIA DA CRIANÇA" (right column, orange/yellow theme):
Title: "🧒 Dia a Dia da Criança"
Steps:
1. "📋 Ver Tarefas do Dia" - View daily tasks
2. "✅ Marcar como Concluída" - Mark tasks complete
3. "⏳ Aguardar Aprovação" - Wait for parent approval
4. "🪙 Receber Moedas" - Receive coins
5. "🛒 Loja de Recompensas" - Browse reward store
6. "🏆 Conquistas e Badges" - Achievements & badges
7. "⭐ Regras de Ouro" - Check golden rules daily

At the bottom, show a circular arrow connecting all 3 phases with the text "Ciclo Contínuo de Autonomia e Responsabilidade"

Use a landscape/wide format (16:9 aspect ratio). Make it visually appealing with rounded boxes, soft shadows, and a light background. Use emojis as icons. The style should be modern, professional but friendly - suitable for marketing material.`;

    console.log("Calling AI gateway to generate flow image...");

    const aiResponse = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-pro-image-preview",
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
          modalities: ["image", "text"],
        }),
      }
    );

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Tente novamente em alguns minutos." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos insuficientes. Adicione créditos ao workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error(`AI gateway error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    console.log("AI response received, extracting image...");

    const images = aiData.choices?.[0]?.message?.images;
    if (!images || images.length === 0) {
      throw new Error("No image returned from AI model");
    }

    const imageDataUrl = images[0].image_url.url;
    // Extract base64 data from data URL
    const base64Match = imageDataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!base64Match) {
      throw new Error("Invalid image data format");
    }

    const imageFormat = base64Match[1]; // png, jpeg, etc.
    const base64Data = base64Match[2];

    // Decode base64 to Uint8Array
    const binaryStr = atob(base64Data);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    // Upload to storage
    const fileName = `fluxo-nosso-pacto-${Date.now()}.${imageFormat}`;
    const { error: uploadError } = await supabase.storage
      .from("flow-images")
      .upload(fileName, bytes, {
        contentType: `image/${imageFormat}`,
        upsert: true,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      throw new Error(`Failed to upload image: ${uploadError.message}`);
    }

    const { data: publicUrl } = supabase.storage
      .from("flow-images")
      .getPublicUrl(fileName);

    console.log("Image uploaded successfully:", publicUrl.publicUrl);

    return new Response(
      JSON.stringify({
        success: true,
        url: publicUrl.publicUrl,
        fileName,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("generate-flow-image error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
