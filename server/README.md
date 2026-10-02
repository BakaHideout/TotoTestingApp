# TotoQuest online services

The game is a static site, so the shared leaderboard and the real-money store run on two
outside services:

* **Supabase** (free tier) — a small Postgres database: `schema.sql`
* **Stripe** — takes the card payments; a webhook tells the database what was bought:
  `functions/stripe-webhook/index.ts` (a Supabase Edge Function)

## How a purchase works

1. The store opens the pack's **Stripe Payment Link** with `client_reference_id=<the trainer's id>`.
2. After paying, Stripe sends the player back to the game with `?purchase=done`.
3. Stripe also calls the **stripe-webhook** function. It checks Stripe's signature and records
   the purchase (the pack's `kind` and `amount` come from the Payment Link's metadata).
4. The game calls `claim_purchases()` with the trainer's id and secret, adds the candy or gems
   and saves. Each payment can only be collected once.

## Leaderboard

Everyone can read `leaderboard`. A trainer can only write their own row through
`submit_score()`, which checks the secret that only their phone has.

## Live setup (done)

* Supabase project `bawabhjturevmftfulez` runs `schema.sql`, and the `stripe-webhook` function is
  deployed with JWT verification off.
* The Stripe webhook endpoint points at
  `https://bawabhjturevmftfulez.supabase.co/functions/v1/stripe-webhook`. Its signing secret is
  stored in `private.settings`.
* `TQ_ONLINE.url` and `TQ_ONLINE.anonKey` are filled in `index.html`, so the leaderboard is live.
* The Payment Links (`TQ_ONLINE.payLinks`) get filled in once the Stripe account is activated for
  card payments. Until then the store says it is opening soon.
* Supabase free projects pause after about a week with no visitors. Open the game, or restore the
  project in the Supabase dashboard, to wake it.

## Setup from scratch

1. In a Supabase project, run `schema.sql`.
2. Deploy `functions/stripe-webhook` with JWT verification **off**.
3. In Stripe, create one Payment Link per pack with metadata `kind` and `amount`.
   Set the after-payment redirect to `https://<game address>/?purchase=done`.
4. Add a webhook endpoint for `checkout.session.completed` and
   `checkout.session.async_payment_succeeded` pointing at the function's URL.
5. Store the webhook signing secret in one of two places:
   * the `STRIPE_WEBHOOK_SECRET` function secret, or
   * `insert into private.settings values ('stripe_webhook_secret', 'whsec_…')`.
6. Fill `TQ_ONLINE` in `index.html` with:
   * the project URL
   * the anon key
   * the Payment Link URLs
