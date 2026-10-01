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

## Setup

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
