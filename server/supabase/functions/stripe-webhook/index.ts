// TotoQuest — Stripe webhook (Supabase Edge Function, deploy with JWT verification OFF).
// Stripe calls this after every finished checkout. It checks the call really came from
// Stripe (signature), then records the purchase for the trainer whose id was passed to the
// Payment Link as client_reference_id. The game then collects it with claim_purchases().
// Each Payment Link carries metadata { kind: 'candy' | 'gems', amount: '<number>' }.
import { createClient } from 'npm:@supabase/supabase-js@2';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const enc = new TextEncoder();

async function webhookSecret(): Promise<string> {
  const fromEnv = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (fromEnv) return fromEnv;
  const { data } = await admin.rpc('tq_get_setting', { p_name: 'stripe_webhook_secret' });
  return (data as string) || '';
}
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
async function signatureOk(payload: string, header: string | null, secret: string) {
  if (!header || !secret) return false;
  const parts = header.split(',').map((p) => p.trim());
  const t = parts.find((p) => p.startsWith('t='))?.slice(2);
  const sigs = parts.filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  if (!t || !sigs.length || Math.abs(Date.now() / 1000 - Number(t)) > 600) return false;
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`${t}.${payload}`)));
  const hex = Array.from(mac).map((b) => b.toString(16).padStart(2, '0')).join('');
  return sigs.some((s) => safeEqual(s, hex));
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('TotoQuest payments', { status: 200 });
  const payload = await req.text();
  if (!(await signatureOk(payload, req.headers.get('stripe-signature'), await webhookSecret()))) {
    return new Response('bad signature', { status: 400 });
  }
  const event = JSON.parse(payload);
  if (event.type !== 'checkout.session.completed' && event.type !== 'checkout.session.async_payment_succeeded') {
    return new Response('ignored', { status: 200 });
  }
  const s = event.data?.object ?? {};
  if (s.payment_status !== 'paid') return new Response('not paid yet', { status: 200 });
  const player = String(s.client_reference_id || '');
  const kind = String(s.metadata?.kind || '');
  const amount = parseInt(String(s.metadata?.amount || '0'), 10);
  if (!UUID.test(player) || !['candy', 'gems'].includes(kind) || !(amount > 0)) {
    console.error('purchase missing player/kind/amount', s.id, player, kind, amount);
    return new Response('missing details', { status: 200 });
  }
  const { error } = await admin.from('purchases').upsert({
    session_id: s.id, player_id: player, kind, amount,
    amount_paid_cents: s.amount_total ?? null, currency: s.currency ?? null, livemode: !!s.livemode,
  }, { onConflict: 'session_id', ignoreDuplicates: true });
  if (error) { console.error(error); return new Response('db error', { status: 500 }); }   // Stripe retries on 5xx
  return new Response('recorded', { status: 200 });
});
