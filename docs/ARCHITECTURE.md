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

`AppState` er vistað í IndexedDB eftir hverja breytingu. Ef browser lokast meðan timer er RUNNING er session recoverað sem PAUSED.

Supabase sync upsertar normalized gögn og `session_snapshots`. Snapshot er operational recovery/cache; analytical source er normalized tables.

V1 gerir ráð fyrir einum live recorder í einu. Multi-device collaborative live scoring er ekki hluti V1.
