# Arkitektúr

Optional assists: session.assistsEnabled controls future recording only;
goal.assistsRecorded snapshots coverage and remains false when a later toggle
re-enables recording. Nullable additive columns in migration 016 keep old rows
compatible (missing/null means enabled/recorded). Both fields use existing raw
sync, snapshots, backup and submission payloads. Totals retain recorded assists
and display a coverage notice rather than interpreting unrecorded assists as
confirmed absence. No network call is required to toggle or record a goal.

Game history corrections: `src/data/gameHistory.ts` stores affected-set snapshots
and reason/time in nullable `sessions.game_corrections` (migration 015). Existing
local sessions remain compatible without a Dexie index migration. History follows
session sync, backup and frozen submission payloads; it is an app change history,
not a tamper-proof database audit. Facts, set winner, history and outbox commit
in one Dexie transaction. SQL batches temporarily move game numbers above both
number ranges before applying final numbering to respect immediate unique keys.
Deletion cascades game events; reversal restores recorded timer events as well.
No invented start/end timestamps are assigned to manually inserted games.
Optimistic snapshot comparison rejects stale editor saves and unsafe reversal.

## Grunnhugsun

Live leikur má aldrei vera háður nettengingu. Notendaaðgerð er vistuð local og UI uppfært strax. Cloud sync er secondary.

```text
PWA / React
   |
   +-- IndexedDB (operational source while playing)
   |
   +-- Service Worker (offline app shell)
   |
   +-- Supabase Auth + Postgres (historical cloud truth after sync)
   |
   +-- Cloudflare Workers Static Assets (hosting)
```

## Leikjalíkan

Season -> Session -> Point race / sett -> 3-minute mini-game -> event.

- 3 lið: marklið heldur velli; taplið út; waiting team inn.
- timeout: incumbent (liðið sem hefur verið lengur inni) fer út.
- fyrsti timeout þegar incumbent er óþekktur krefst handvirks vals.
- 2 lið: engin rotation; sami matchup verður READY aftur.
- fyrst í `winsRequired` (default 4) vinnur sett.

## Leikmenn

Það eru aðeins tvö hlutverk: `REGULAR` og `SUBSTITUTE`.

Hlutverk er tímabilsbundið (`player_role_periods`) og má breytast á miðri önn. `session_players.role_at_session` er immutable snapshot; gömul tölfræði breytist því ekki þegar maður verður fastamaður síðar.

## Tölfræði

Raw facts eru geymd. Totals eru reiknuð:

- mini-game wins
- set wins
- goals / assists / G+A
- attendance / appearances
- pair performance
- choke: taplið endar sett einu skrefi frá sigri (3 þegar winsRequired=4)
- nix: taplið endar sett með 0 sigra

## Offline og sync

Virka appið (`src/main.tsx` → `src/App.tsx` → `src/components`) notar Dexie töflur í `src/db/localDb.ts`, ekki eldra `AppState` líkanið. Skipanir í `src/data/repository.ts` vista leik, atvik, Undo, næsta READY leik/sett og sync queue í einni IndexedDB transaction. Netvinnsla hefst eftir local commit.

Ef browser lokast meðan timer er RUNNING er leikurinn endurheimtur sem PAUSED. Brot úr sekúndu eru varðveitt; aðeins klukkuskjárinn námundar. Við 00:00 eftir endurheimt þarf að staðfesta tíma handvirkt.

Virka Supabase sync leiðin sendir röð af upsert/delete aðgerðum í `apply_sync_batch` RPC. PostgreSQL vistar allan pakkann, móttökukvittanir í `sync_operations` og hrá `session_snapshots` í sömu transaction. Týnt netsvar veldur öruggri endursendingu: kvittaðar aðgerðir eru ekki endurteknar. Local biðröð tapast ekki við villu og nýjar breytingar á meðan upload stendur yfir eru ekki teknar úr henni.

Upload keyrir eftir local aðgerðir, innskráningu, endurtengingu og á 30 sekúndna fresti. Handvirkt `Sync núna` sækir líka heildstætt normalized ástand úr `get_sync_state` í einni gagnagrunnslesningu. Engin REST 1.000-raða síðutakmörkun er á þessum eina JSON hlut. Fyrir stærra gagnasafn þarf síðar síðuskiptingu með stöðugri snapshot-útgáfu.

Skýjavinna er raðbundin með Web Locks milli flipa þar sem það er stutt og með Promise-röð innan hvers flipa. Local recorder bíður aldrei eftir skýjalásnum. Niðurhal er aðeins sett inn ef local gagnasafn hefur ekki breyst frá upphafi niðurhals og biðröð er tóm. Samanburður og innsetning fara fram í einni IndexedDB transaction; annars er niðurhali frestað. Heildstætt niðurhal fjarlægir líka færslur sem Undo eyddi úr skýinu. Undo á upprunatæki helst við óbreytt leikgögn; það er ekki flutt milli tækja.

`app_admins` er lokaður stjórnendalisti tengdur Auth UID. Allar raw töflur, kvittanir og snapshots nota RLS. RPC eru security-invoker, með föstu search_path og engum anonymous framkvæmdarrétti. Eldri SQL analytics views eru ekki aðgengileg frontend; virka appið reiknar tölfræði local með role-at-session og own-goal reglum.

Migration 011 replaces the recording-window workflow from 008 with submission
review. See [Submission architecture and setup](SUBMISSION_REVIEW.md).
Recorders retain local facts in IndexedDB and queue frozen raw submissions in
Dexie v6. Only an admin-approved submission is imported into normalized tables,
atomically with its approval receipt. The shared Auth user cannot read any
submitted nights or mutate normalized tables. Admin sync remains unchanged.

Annir eru valdar með vistuðu season ID. Dagsetningar og nöfn eru stillanleg; sjálfgefið janúar–apríl og september–desember. Breyting á dagsetningum flytur ekki eldri kvöld milli anna.

Stjórnandi getur sérstaklega leiðrétt ranga `roleAtSession` skráningu fyrir eitt
kvöld. Ný staða, fyrri staða, ástæða og tími eru vistuð í `roleCorrections` á
session-player færslunni í sömu local transaction og outbox. Migration 009 bætir
við nullable JSONB dálki; eldri local færslur án sögunnar haldast gildar og enginn
nýr Dexie index er nauðsynlegur. Sagan fylgir núverandi attendance sync, snapshot
og backup flæði. Recorder-trigger varðveitir bæði stöðu og sögu við update og
hafnar innspýtingu sögu við insert með því að setja hana null. Þetta er saga
leiðréttinga appsins, ekki óbreytanleg öryggisúttekt á aðgerðum gagnagrunnsstjóra.

V1 gerir ráð fyrir einum live recorder í einu. Multi-device collaborative live scoring er ekki hluti V1.

Recorder ratings: migration 013 derives per-season/player points, sets, wins and contributions from approved completed raw nights, including aggregate backfills. The shared TypeScript rating formula computes the same ALL-role strength as admin. Dexie v7 ratingCache is disposable, excluded from raw sync/backup, cleared on account switches, and selected by night date. Invalid/failed downloads preserve the previous cache. No network request occurs in the draw/live loop.
