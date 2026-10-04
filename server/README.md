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

## v62: gifts and testing ranks

Migration: `supabase/migrations/2026-10-03_admin_gifts.sql`.

- **Private table:** `gifts`. Each gift waits there, unclaimed, until the trainer's game picks it up.
- **Owner-only RPCs:**
  - `admin_gift(target, kind, amount, toto, note)` sends a gift. The kinds are `gems`, `candy`, `raidPass`, `elixir`, `toto` (`{name, tier, level}`) and `rank1set` (the Rank #1 outfit).
  - `admin_set_rp(target, rp, make_top)` sets a trainer's Rank Points for this season. With `make_top` it puts them 50 RP above everyone else, with at least 1600, and sends them the Rank #1 outfit. It is meant for testing.
- **Trainer RPCs:**
  - `heartbeat` now also returns `gifts`, the number of gifts waiting.
  - `gifts_pending` lists the waiting gifts.
  - `gifts_ack(ids)` marks gifts as received. The game adds the gifts and saves before it calls this. It also remembers the ids it has added, so a gift is never added twice.

## v63: rank rewards are earned at season end

Migration: `supabase/migrations/2026-10-03b_rank_rewards.sql`.

- Rank rewards unlock only when a season ends with the trainer at that place, which is recorded in `season_claims` through `season_claim`. Once earned they are permanent.
- `heartbeat` also returns `awards`: the trainer's top-10 finishes in past seasons. The game unlocks the matching rewards on any device, so they survive a new phone or a reinstall.
- `admin_gift` no longer accepts `rank1set`, and any unclaimed outfit gift was withdrawn.
- `admin_set_rp` (with or without `make_top`) changes Rank Points only. It is still meant for testing.

## v64: 2v2 PvP

Migration: `supabase/migrations/2026-10-03c_pvp_2v2.sql`.

- **Teams.** A lobby entry's `toto` is a team: a JSON array of two Toto snapshots. Matchmaking only pairs entries of the same JSON type (team with team), so older single-Toto clients never face a 2v2 client.
- **Moves.** `pvp_move` accepts moves of the form `<who>:<skill>:<target>`, for example `1:s2:0`, as well as the older single-Toto moves, `auto` and `forfeit`. Turns still alternate, one move per turn.
- **Rules.** The battle rules (Taunt for 3 turns, a Supporter's Hex Bolt hitting both rivals, and so on) live in the game's deterministic engine. Both phones replay the same moves through it.
- **Lobby timeout.** A matched lobby entry is freed after 15 minutes instead of 10, since 2v2 battles run longer.

## v66: each Toto has its own PvP moves

Migration: `supabase/migrations/2026-10-03d_pvp_engine3.sql`.

- **Battle rules version.** Every Toto in a lobby team now carries `ev` (the battle engine version, 3 for v66). Matchmaking only pairs teams with the same `ev`, because both phones must replay a battle with identical rules. Older clients (no `ev`) keep matching each other.
- **Moves.** The move format is unchanged (`<who>:<skill>:<target>`, `s1`–`s4` and `ult`), so `pvp_move` needs no change. What each slot does now depends on the Toto: its class, species and tier. Only Attackers have `ult`, ready after 4 hits.

## v67: faster team moves first; Rank Champions

Migration: `supabase/migrations/2026-10-03e_pvp_pass.sql`.

- **Who moves first.** The team with the fastest Toto now moves first. Turns on the server still alternate (odd = player 1, even = player 2). When player 2's team is faster, player 1's game sends `pass` for turn 1, so `pvp_move` now accepts `pass`. If player 1 never sends it, the usual idle claim (`auto`) also counts as the pass.
- **Engine 4.** Battle rules changed (first mover, Rank Champions), so every Toto snapshot now carries `ev: 4`. Matchmaking pairs only equal versions, so v66 and v67 players are never matched together.
- **Rank Champions.** A top-10 season finish (from `season_claim` / heartbeat `awards`) gives the matching "Rank #N Champion" Toto once, saved in the player's game data (`rankChamps`). No server change was needed.

## v69

- **Battle rules, engine 5.** The Rank Champions are now a little stronger than Witch Hana, so every Toto snapshot carries `ev: 5`. Players on older versions are only matched with each other.
- **Updates are the player's choice.** This is entirely in the game's service worker; there are no server changes. It remembers which release the player is on and opens that one. A new release is downloaded in the background and the "update" banner offers it. Tapping the banner calls `__tq-use?v=<release>`, which the service worker answers itself, and then restarts into the new release.

## v76: trading, take-backs, Staff Panel
Apply `supabase/migrations/2026-10-04_trades_admin.sql` (SQL editor, or the Supabase tool). It adds Toto trading between friends (achievement Totos are refused), owner take-backs (`admin_take`), the Staff Panel numbers (`admin_stats`, daily activity) and the admin chat (`admin_chat_send` / `admin_chat_poll`), and updates `heartbeat` to count trades waiting on you. The game works without it; those features just stay off until it is applied.

## v77: reports
`supabase/migrations/2026-10-04b_reports.sql` (applied live together with v76, additive only): players report a chat message (`report_message`, with the conversation attached) or a bug / glitch / store problem / player / other (`report_issue`, with game version and device); admins read them with `admin_reports2` (filter by kind, or handled). v76 gift kinds are stored with an `op` column (take / trade / trade_back) instead of new kinds.
