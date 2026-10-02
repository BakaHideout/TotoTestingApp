# TotoQuest — self-hosting & updates

## Put it on GitHub Pages (free, ~5 minutes)
1. Create a new GitHub repo (public or private).
2. Upload all 5 files in this folder to the repo root: `index.html`, `manifest.json`,
   `sw.js`, `icon-192.png`, `icon-512.png`.
3. In the repo, go to **Settings → Pages**, set Source to your default branch, root folder.
4. GitHub gives you a URL like `https://yourname.github.io/your-repo/`. Open it on your
   phone and use "Add to Home Screen" — it installs like a real app icon.

## Pushing updates
Any time you want to change something (swap the logo, tweak balance, fix a bug):
1. Edit the files locally (or edit them right on github.com) and commit/push.
2. That's it — no rebuild step, no app store review.

## How players get notified of the update
The app checks for a new version every time it's opened or brought back to the
foreground. If it finds one, a banner slides up:

> 🔄 A new version of TotoQuest is available — tap to update

Tapping it swaps in the new version and reloads. Nothing happens automatically in the
background without their tap, so a player is never yanked into a reload mid-battle.

Technical note: this works because `sw.js` includes a version string
(`CACHE_NAME = 'totoquest-v2'`). Browsers automatically re-check `sw.js` for byte
changes, so simply changing that version string (or any other file) is enough to
trigger the update banner for everyone — you don't need to do anything extra.

## Turning on a real cross-device leaderboard (free, ~2 minutes, uses your existing GitHub account)
By default, the leaderboard in this downloaded/GitHub-hosted copy can only show your
own power level — a static site has no server of its own to share scores between
devices. To turn on a real shared leaderboard, the game stores `leaderboard.json`
right in the same GitHub repo you're already using to host it — no new account or
service needed:

1. On GitHub, go to **Settings → Developer settings → Personal access tokens →
   Fine-grained tokens → Generate new token**.
2. Give it a name, set **Repository access** to "Only select repositories" and pick
   this game's repo, then under **Permissions → Repository permissions**, set
   **Contents** to **Read and write**. Generate the token and copy it — GitHub only
   shows it once.
3. Open `index.html` in this folder, find these lines near the top of the `<script>`
   block:
   ```
   const GITHUB_LB_OWNER = '';
   const GITHUB_LB_REPO = '';
   const GITHUB_LB_TOKEN = '';
   ```
   and fill them in:
   ```
   const GITHUB_LB_OWNER = 'yourusername';
   const GITHUB_LB_REPO = 'your-repo-name';
   const GITHUB_LB_TOKEN = 'github_pat_...';
   ```
4. Save, push to GitHub. Once players update to that version, the leaderboard is
   shared across every device automatically — the game creates `leaderboard.json`
   in your repo the first time anyone's power level updates.

Security note: that token is embedded in client-side code, so anyone determined
enough could extract it from their browser's dev tools. Scoping it (step 2) to
**only this one repo** with **only Contents read/write** limits the damage to "someone
could mess with your leaderboard file," not your account or other repos — reasonable
for a casual game among friends, not something to reuse for anything sensitive.

## About the Candy & Dust store
The in-game store links out to `paypal.me/TotoQuest` for each purchase tier, then asks
the player to confirm they've paid before crediting the currency. This is an **honor
system** — a static site has no way to verify a PayPal payment actually happened
(no webhook, no callback, nothing server-side to check). Anyone could tap "I've Paid"
without paying. That's a hard limitation of not having a real payment backend, not a
bug — if you want an unspoofable version later, it would need a small server (or a
serverless function) that verifies the payment with PayPal's API before crediting
anything, which is a bigger project than a static GitHub Pages site can do alone.
