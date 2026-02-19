import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Generate VAPID keys using Web Crypto API
    const keyPair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"]
    );

    const publicKeyBuffer = await crypto.subtle.exportKey("raw", keyPair.publicKey);
    const privateKeyBuffer = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);

    // Convert to URL-safe base64
    const publicKey = btoa(String.fromCharCode(...new Uint8Array(publicKeyBuffer)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    
    // For VAPID, we need the raw 32-byte private key, not PKCS8
    // PKCS8 for P-256 has a fixed header, the raw key starts at byte 36
    const pkcs8Array = new Uint8Array(privateKeyBuffer);
    const rawPrivateKey = pkcs8Array.slice(36, 68);
    const privateKey = btoa(String.fromCharCode(...rawPrivateKey))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    return new Response(
      JSON.stringify({ publicKey, privateKey }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
