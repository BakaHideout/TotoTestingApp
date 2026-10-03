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
* Stripe (account "TotoQuest") has 9 products, `tq_candy_100` … `tq_gems_800`. Each has a
  tax-inclusive USD price and tax code `txcd_10201000`, which Stripe's Managed Payments needs.
  Each product has one Payment Link with metadata `kind` and `amount`; their URLs are in
  `TQ_ONLINE.payLinks`.
* Managed Payments is on, so Stripe is the seller of record and handles sales tax and VAT.
* `google-auth` (an Edge Function, JWT verification off) checks "Sign in with Google" tokens with
  Google, makes sure they were made for TotoQuest's Client ID (`private.settings.google_client_id`)
  and says whether the account is the owner's (`private.settings.admin_email`). The owner's email
  is never in the public game code. Owner tools only unlock after this check.
* `delete_player()` backs "Delete my account" in Settings.
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

## v56: online accounts, friends, admin tools, seasons and PvP

`supabase/migrations/2026-10-02_social_pvp_admin.sql` adds the following. All of it is already applied to the live project.

- **Player profile and status.** Columns on `players`: name, look, level, power, last_seen, last_ip, is_admin, is_owner, deleted, banned_until.
- **Private tables:**
  - `ip_bans`
  - `friends`, `blocks`, `messages`, `reports`
  - `season_scores`, `season_claims`
  - `pvp_lobby`, `pvp_matches`, `pvp_moves`
- **RPCs, each checked against the trainer's secret:**
  - Account and status: `heartbeat`, `ip_status`
  - Friends and messages: `search_players`, `friend_request`, `friend_respond`, `friend_remove`, `friends_list`, `send_message`, `get_messages`, `block_player`, `report_player`
  - Seasons: `season_board`, `season_my_rank`, `season_claim`
  - PvP: `pvp_lobby_poll`, `pvp_start_bot`, `pvp_move`, `pvp_poll`, `pvp_finish`
- **Admin RPCs.** These need `is_admin`:
  - `admin_players`, `admin_ban`, `admin_unban`, `admin_delete`, `admin_reports`, `admin_resolve_report`
  - `admin_set_admin` (owner only)
- **Becoming an admin.** `admin_claim` turns on admin and owner for the calling trainer when given the admin key. Only a bcrypt hash of the key is stored, in `private.settings` under `admin_key_hash`. A Google sign-in with the owner email does the same through the `google-auth` edge function, which calls `admin_grant_google` with the service role.
- **Seasons.** A season is the calendar month in America/Detroit time (`private.season_now()`), so the boards reset on the 1st with no scheduled job.
- **Rank Points (RP):**

  | Result | RP |
  |---|---|
  | Win against a trainer | +25 |
  | Loss against a trainer | −15 |
  | Win against the computer | +10 (at most 100 RP a day) |
  | Loss against the computer | −5 |

  Every 100 RP is one division: Bronze 3 → … → Diamond 1. Master starts at 1500 RP, and the top 10 are Grandmaster.
