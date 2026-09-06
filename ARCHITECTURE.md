# Architecture — Mánudagsboltinn V1.1

Historical design notes. See [the current architecture](docs/ARCHITECTURE.md) and [V1 audit](docs/V1_AUDIT.md); the former 4×4 scoring model below is superseded by first-to-four mini-game wins.

## 1. Raw truth model

Raw gögn eru sannleikurinn:

`Season → Session → Set → SetTeam → Game → Goal`

Leikmaður tengist session með mætingu og set-team með liðsaðild. Lið geta því breyst milli setta án þess að saga tapist.

## 2. Derived statistics layer

Við vistum ekki handvirkt `goals=42`, `chokes=3` o.s.frv. Þær tölur eru reiknaðar út frá raw events.

- Litlir sigrar: `games.winning_team_id`
- Stig: `floor(smallWins / winsPerPoint)`
- Settsigur: `sets.winning_team_id`
- Mörk/stoðsendingar: `goals`
- Choke: taplið endar með `pointsToWinSet - 1`
- 0-sett: klárað sett með 0 stig
- Nix-dagur: kláraður leikdagur með 0 stig samtals

`seasonAnalytics.ts` byggir ofan á þessu:

- season leaderboard
- rates / averages
- single-night records
- awards
- weighted-random player rating

Supabase hefur samsvarandi backend views í `003_season_analytics.sql`.

## 3. Weighted random

Weighted random notar þrjá performance-ása:

1. stig á sett
2. mörk + stoðsendingar á sett
3. settsigur%

Hver ás er normaliseraður miðað við leikmenn tímabilsins. Rating er síðan dregið aftur að 100 þegar sample size er lítið. Nýr leikmaður byrjar því hlutlaus í 100.

Liðadrátturinn prófar margar jafnstórar random samsetningar og velur þá sem hefur minnstan mun á meðal-rating liða.

`Full random` sleppir þessu öllu.

## 4. Presentation layer

Presentation notar sama `SeasonAnalytics` object og Stats UI og weighted random. Það eru því ekki sér útreiknuð presentation-gögn sem geta farið úr sync.

Layerið er ætlað fyrir:

- heildartöflu
- season records
- awards
- skammarverðlaun
- framtíðar badges/streaks/rivalries

## 5. Backup model

Backup er full raw snapshot af öllum domain töflum. Sync queue er ekki talinn canonical og er því endurgerður við restore.

Þetta gerir backup óháð Supabase og gagnlegt jafnvel ef update eða cloud tenging bilar.

## 6. Offline-first

UI skrifar fyrst í Dexie. Mutation fer síðan í `syncQueue`.

Manual Sync:

1. Push local queue til Supabase.
2. Pull canonical töflur frá Supabase inn í Dexie.

Leikdagur þarf því ekki internet.

## 7. Match timer

`games.remainingSeconds` geymir materialized stöðu og `timerStartedAt` upphaf núverandi running segment.

Pause/goal/timeout materialize-ar remaining aftur í DB. Refresh eða læstur sími tapar því ekki klukkunni.
