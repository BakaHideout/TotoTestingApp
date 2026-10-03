// TotoQuest — "Sign in with Google" check (Supabase Edge Function, deploy with JWT verification OFF).
// The game gets a signed ID token from Google's sign-in button and sends it here. Google's own
// tokeninfo endpoint checks the signature and expiry; this function then makes sure the token was
// issued for TotoQuest's Client ID and that Google has verified the email address.
// It also says whether this is the game owner's account. The owner's email is stored only
// in the database (private.settings 'admin_email'), never in the public game code.
import { createClient } from 'npm:@supabase/supabase-js@2';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

async function setting(name: string): Promise<string> {
  const { data } = await admin.rpc('tq_get_setting', { p_name: name });
  return (data as string) || '';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405);
  let credential = '', playerId = '', playerSecret = '';
  try { const body = await req.json(); credential = String(body.credential || ''); playerId = String(body.player_id || ''); playerSecret = String(body.player_secret || ''); } catch { /* fall through */ }
  if (!/^[\w-]+\.[\w-]+\.[\w-]+$/.test(credential) || credential.length > 4096) return json({ ok: false, error: 'bad token' }, 400);

  const clientId = Deno.env.get('GOOGLE_CLIENT_ID') || await setting('google_client_id');
  if (!clientId) return json({ ok: false, error: 'Google sign-in is not set up yet' }, 503);

  const r = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential));
  if (!r.ok) return json({ ok: false, error: 'Google did not accept this sign-in' }, 401);
  const t = await r.json();
  const issOk = t.iss === 'accounts.google.com' || t.iss === 'https://accounts.google.com';
  const expOk = Number(t.exp) * 1000 > Date.now();
  const verified = t.email_verified === true || t.email_verified === 'true';
  if (t.aud !== clientId || !issOk || !expOk || !verified || !t.email) return json({ ok: false, error: 'This sign-in is not for TotoQuest' }, 401);

  const email = String(t.email).toLowerCase();
  const ownerEmail = (await setting('admin_email')).toLowerCase();
  const isOwner = !!ownerEmail && email === ownerEmail;
  // the owner's own device also gets the admin tools on the server (player list, bans)
  if (isOwner && /^[0-9a-f-]{36}$/i.test(playerId) && playerSecret.length >= 32) {
    await admin.rpc('admin_grant_google', { p_id: playerId, p_secret: playerSecret });
  }
  return json({
    ok: true,
    email,
    name: t.name || '',
    given_name: t.given_name || '',
    sub: String(t.sub || ''),
    admin: isOwner,
  });
});
