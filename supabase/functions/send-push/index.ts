import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Web Push with VAPID using Web Crypto API
async function generateVapidAuthHeader(
  endpoint: string,
  publicKey: string,
  privateKey: string,
  sub: string
) {
  // Decode URL-safe base64
  function decodeBase64Url(str: string): Uint8Array {
    const padding = '='.repeat((4 - (str.length % 4)) % 4);
    const base64 = (str + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const arr = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    return arr;
  }

  function encodeBase64Url(arr: Uint8Array): string {
    return btoa(String.fromCharCode(...arr))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  const url = new URL(endpoint);
  const audience = `${url.protocol}//${url.host}`;

  const header = { typ: 'JWT', alg: 'ES256' };
  const now = Math.floor(Date.now() / 1000);
  const payload = { aud: audience, exp: now + 12 * 3600, sub };

  const enc = new TextEncoder();
  const headerB64 = encodeBase64Url(enc.encode(JSON.stringify(header)));
  const payloadB64 = encodeBase64Url(enc.encode(JSON.stringify(payload)));
  const unsignedToken = `${headerB64}.${payloadB64}`;

  // Import private key
  const privateKeyBytes = decodeBase64Url(privateKey);
  // Build PKCS8 from raw 32-byte key
  const pkcs8Header = new Uint8Array([
    0x30, 0x41, 0x02, 0x01, 0x00, 0x30, 0x13, 0x06, 0x07,
    0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, 0x06, 0x08,
    0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, 0x04,
    0x27, 0x30, 0x25, 0x02, 0x01, 0x01, 0x04, 0x20,
  ]);
  const pkcs8 = new Uint8Array(pkcs8Header.length + privateKeyBytes.length);
  pkcs8.set(pkcs8Header);
  pkcs8.set(privateKeyBytes, pkcs8Header.length);

  const key = await crypto.subtle.importKey(
    'pkcs8', pkcs8, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']
  );

  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(unsignedToken)
  );

  // Convert DER signature to raw r||s format
  const sigBytes = new Uint8Array(signature);
  let r: Uint8Array, s: Uint8Array;
  
  if (sigBytes.length === 64) {
    // Already raw format
    r = sigBytes.slice(0, 32);
    s = sigBytes.slice(32, 64);
  } else {
    // DER format
    const rLen = sigBytes[3];
    const rStart = 4;
    const rBytes = sigBytes.slice(rStart, rStart + rLen);
    const sLen = sigBytes[rStart + rLen + 1];
    const sStart = rStart + rLen + 2;
    const sBytes = sigBytes.slice(sStart, sStart + sLen);
    
    r = new Uint8Array(32);
    s = new Uint8Array(32);
    r.set(rBytes.length > 32 ? rBytes.slice(rBytes.length - 32) : rBytes, 32 - Math.min(rBytes.length, 32));
    s.set(sBytes.length > 32 ? sBytes.slice(sBytes.length - 32) : sBytes, 32 - Math.min(sBytes.length, 32));
  }
  
  const rawSig = new Uint8Array(64);
  rawSig.set(r, 0);
  rawSig.set(s, 32);

  const jwt = `${unsignedToken}.${encodeBase64Url(rawSig)}`;

  return {
    authorization: `vapid t=${jwt}, k=${publicKey}`,
  };
}

async function sendPushNotification(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: object,
  vapidPublicKey: string,
  vapidPrivateKey: string
) {
  const payloadStr = JSON.stringify(payload);
  const enc = new TextEncoder();
  const payloadBytes = enc.encode(payloadStr);

  // For simplicity, send unencrypted payload via fetch with VAPID auth
  // Most push services accept this for text payloads
  const { authorization } = await generateVapidAuthHeader(
    subscription.endpoint,
    vapidPublicKey,
    vapidPrivateKey,
    'mailto:contato@nossopacto.com'
  );

  // Encrypt payload using Web Push encryption (aes128gcm)
  // Generate local ECDH key pair
  const localKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']
  );

  const localPublicKeyBuffer = await crypto.subtle.exportKey('raw', localKeyPair.publicKey);
  const localPublicKey = new Uint8Array(localPublicKeyBuffer);

  // Decode subscriber's public key
  function decodeBase64Url(str: string): Uint8Array {
    const padding = '='.repeat((4 - (str.length % 4)) % 4);
    const base64 = (str + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const arr = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    return arr;
  }

  const subscriberPublicKey = decodeBase64Url(subscription.p256dh);
  const authSecret = decodeBase64Url(subscription.auth);

  // Import subscriber's public key
  const subPubKey = await crypto.subtle.importKey(
    'raw', subscriberPublicKey, { name: 'ECDH', namedCurve: 'P-256' }, false, []
  );

  // ECDH shared secret
  const sharedSecretBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: subPubKey }, localKeyPair.privateKey, 256
  );
  const sharedSecret = new Uint8Array(sharedSecretBits);

  // HKDF helper
  async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
    const key = await crypto.subtle.importKey('raw', ikm, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const prk = new Uint8Array(await crypto.subtle.sign('HMAC', 
      await crypto.subtle.importKey('raw', salt, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']),
      ikm
    ));
    
    // Actually use proper HKDF
    const prkKey = await crypto.subtle.importKey('raw', prk, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const infoWithCounter = new Uint8Array(info.length + 1);
    infoWithCounter.set(info);
    infoWithCounter[info.length] = 1;
    const okm = new Uint8Array(await crypto.subtle.sign('HMAC', prkKey, infoWithCounter));
    return okm.slice(0, length);
  }

  // auth_info = "WebPush: info\0" + subscriber_public_key + local_public_key
  const authInfoStr = 'WebPush: info\0';
  const authInfoHeader = enc.encode(authInfoStr);
  const authInfo = new Uint8Array(authInfoHeader.length + subscriberPublicKey.length + localPublicKey.length);
  authInfo.set(authInfoHeader);
  authInfo.set(subscriberPublicKey, authInfoHeader.length);
  authInfo.set(localPublicKey, authInfoHeader.length + subscriberPublicKey.length);

  // IKM
  const ikm = await hkdf(authSecret, sharedSecret, authInfo, 32);

  // Salt for content encryption
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // CEK and nonce
  const cekInfo = enc.encode('Content-Encoding: aes128gcm\0');
  const nonceInfo = enc.encode('Content-Encoding: nonce\0');
  const cek = await hkdf(salt, ikm, cekInfo, 16);
  const nonce = await hkdf(salt, ikm, nonceInfo, 12);

  // Encrypt with AES-128-GCM
  const cryptoKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  
  // Add padding delimiter
  const paddedPayload = new Uint8Array(payloadBytes.length + 1);
  paddedPayload.set(payloadBytes);
  paddedPayload[payloadBytes.length] = 2; // delimiter

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce }, cryptoKey, paddedPayload
  );
  const encryptedBytes = new Uint8Array(encrypted);

  // Build aes128gcm header: salt(16) + rs(4) + idlen(1) + keyid(65) + ciphertext
  const rs = 4096;
  const rsBytes = new Uint8Array(4);
  new DataView(rsBytes.buffer).setUint32(0, rs);
  
  const header = new Uint8Array(16 + 4 + 1 + localPublicKey.length);
  header.set(salt, 0);
  header.set(rsBytes, 16);
  header[20] = localPublicKey.length;
  header.set(localPublicKey, 21);

  const body = new Uint8Array(header.length + encryptedBytes.length);
  body.set(header);
  body.set(encryptedBytes, header.length);

  const response = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': authorization,
      'TTL': '86400',
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
    },
    body: body,
  });

  return { status: response.status, ok: response.ok };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')!;
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')!;

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { user_id, title, body, url, tag } = await req.json();

    if (!user_id || !title) {
      return new Response(
        JSON.stringify({ error: 'user_id and title are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get all subscriptions for the user
    const { data: subscriptions, error } = await supabase
      .from('push_subscription')
      .select('*')
      .eq('user_id', user_id);

    if (error) {
      throw error;
    }

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No subscriptions found for user', sent: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const payload = { title, body: body || '', url: url || '/', tag: tag || 'default' };
    const results = [];

    for (const sub of subscriptions) {
      try {
        const result = await sendPushNotification(
          { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
          payload,
          vapidPublicKey,
          vapidPrivateKey
        );
        results.push({ endpoint: sub.endpoint, ...result });

        // Remove expired subscriptions (410 Gone)
        if (result.status === 410 || result.status === 404) {
          await supabase.from('push_subscription').delete().eq('id', sub.id);
        }
      } catch (e) {
        results.push({ endpoint: sub.endpoint, error: e.message });
      }
    }

    return new Response(
      JSON.stringify({ sent: results.filter(r => r.ok).length, total: results.length, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
