# Arkitektúr

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

Virka Supabase sync leiðin notar normalized töflur og röð af upsert/delete aðgerðum. Hún skrifar ekki `session_snapshots`; snapshot-leiðin er í eldra, óvirku appi. Sjá `docs/V1_AUDIT.md` fyrir þetta frávik og óloknar cloud/PWA prófanir.

Annir eru valdar með vistuðu season ID. Dagsetningar og nöfn eru stillanleg; sjálfgefið janúar–apríl og september–desember. Breyting á dagsetningum flytur ekki eldri kvöld milli anna.

V1 gerir ráð fyrir einum live recorder í einu. Multi-device collaborative live scoring er ekki hluti V1.
