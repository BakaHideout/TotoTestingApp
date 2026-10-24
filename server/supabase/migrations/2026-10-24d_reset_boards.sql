-- (applied live 2026-10-24) TotoQuest v111: reset this season's PvE (Colosseum) and PvP boards. Everyone starts again at 0
-- (PvP: Bronze 3, 0 wins / losses). The game also clears its saved Colosseum points once (v111).
update private.season_scores set rp = 0, wins = 0, losses = 0, power = 0, updated_at = now() where season = private.season_now();
update private.pvp_lobby set rp = 0;
