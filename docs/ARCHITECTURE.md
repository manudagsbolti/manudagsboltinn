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

Virka Supabase sync leiðin sendir röð af upsert/delete aðgerðum í `apply_sync_batch` RPC. PostgreSQL vistar allan pakkann, móttökukvittanir í `sync_operations` og hrá `session_snapshots` í sömu transaction. Týnt netsvar veldur öruggri endursendingu: kvittaðar aðgerðir eru ekki endurteknar. Local biðröð tapast ekki við villu og nýjar breytingar á meðan upload stendur yfir eru ekki teknar úr henni.

Upload keyrir eftir local aðgerðir, innskráningu, endurtengingu og á 30 sekúndna fresti. Handvirkt `Sync núna` sækir líka heildstætt normalized ástand úr `get_sync_state` í einni gagnagrunnslesningu. Engin REST 1.000-raða síðutakmörkun er á þessum eina JSON hlut. Fyrir stærra gagnasafn þarf síðar síðuskiptingu með stöðugri snapshot-útgáfu.

Skýjavinna er raðbundin með Web Locks milli flipa þar sem það er stutt og með Promise-röð innan hvers flipa. Local recorder bíður aldrei eftir skýjalásnum. Niðurhal er aðeins sett inn ef local gagnasafn hefur ekki breyst frá upphafi niðurhals og biðröð er tóm. Samanburður og innsetning fara fram í einni IndexedDB transaction; annars er niðurhali frestað. Heildstætt niðurhal fjarlægir líka færslur sem Undo eyddi úr skýinu. Undo á upprunatæki helst við óbreytt leikgögn; það er ekki flutt milli tækja.

`app_admins` er lokaður stjórnendalisti tengdur Auth UID. Allar raw töflur, kvittanir og snapshots nota RLS. RPC eru security-invoker, með föstu search_path og engum anonymous framkvæmdarrétti. Eldri SQL analytics views eru ekki aðgengileg frontend; virka appið reiknar tölfræði local með role-at-session og own-goal reglum.

Migration 008 bætir við `app_recorders` og einum `recording_window` sem stjórnandi
opnar fyrir dagsetningu/önn. Sameiginlega innskráningin notar fast Auth auðkenni
`skraning@manudagsboltinn.com`; aðeins lykilorð er slegið inn á skráningarskjánum.
Stjórnandi notar eigið netfang og `app_admins` heimild. Enginn service-role lykill
eða sérstakur lykilorðabakendi er í frontend.

Recorder RLS gefur aðeins aðgang að opna kvöldinu og virkum leikmannalista.
`get_recorder_context` afhendir aðeins gildandi hlutverk og lágmarks annarauðkenni
með skráningardeginum, ekki raunveruleg annargögn eða söguleg hlutverk.
Þröng security-definer föll með föstu search_path meta aðgang yfir tengdar töflur
án RLS-endurkvæmni og skrifa snapshots án þess að afhenda þau skráningaraðila.
`apply_sync_batch` helst security-invoker og getur ekki farið fram hjá RLS.
Trigger varðveitir hlutverkasnapshot og tekur ný hlutverk frá tímabilum stjórnanda.

`AccessGate` stendur fyrir framan allar production leiðir. Appið felur líka
annir/ratings í liðaskiptingu. Local scope geymir UID, app-hlutverk og opna kvöldið;
við scope-skipti eru áður sótt gögn hreinsuð aðeins ef outbox er tómur. Við
útskráningu er local gagnasafn hreinsað svo eldri admin gögn fylgi ekki öðrum
aðgangi á sama tæki. Cache veitir eingöngu offline aðgang að þegar sóttum gögnum;
allar skýjaaðgerðir þurfa virka Supabase Auth lotu og backend heimildir.

Annir eru valdar með vistuðu season ID. Dagsetningar og nöfn eru stillanleg; sjálfgefið janúar–apríl og september–desember. Breyting á dagsetningum flytur ekki eldri kvöld milli anna.

V1 gerir ráð fyrir einum live recorder í einu. Multi-device collaborative live scoring er ekki hluti V1.
