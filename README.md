# Mánudagsboltinn — V1.1

V1 rules and current implementation status: [Product specification](docs/PRODUCT_SPEC.md), [architecture](docs/ARCHITECTURE.md), [audit and remaining acceptance checks](docs/V1_AUDIT.md). The older feature notes below include superseded scoring/season assumptions; the product specification is authoritative.

Offline-first PWA fyrir Mánudagsboltann. Þetta build er ætlað sem raunverulegur nothæfur grunnur fyrir leikdag, tímabilstölfræði og kynningu.

## Leikdagur

- Leikmannalisti: bæta við, breyta og gera óvirka.
- Nýr leikdagur: velja mætingu og reglur kvöldsins.
- Sérstakt staðfestingarskref sýnir allan valinn hóp áður en dregið er í lið.
- 2 eða 3 lið.
- **Weighted random**: jafnar lið út frá tölfræði tímabilsins.
- **Full random**: hreinn slembidráttur án tölfræði.
- Sýnilegt shuffle/liðadráttarskref og hægt að draga aftur.
- Handvirk færsla milli liða eftir drátt.
- Sett eru sjálfstæð: sömu lið eða ný lið í næsta sett.
- 3 mín leikjaklukka (stillanleg), pause/resume og timer persistence.
- King-of-the-court rotation: markalið helst inni; við timeout fer holder út.
- Markaskorari + valfrjáls stoðsending skráð á hvert mark.
- Undo/leiðrétting á síðasta marki áður en næsti leikur byrjar.
- 4 litlir sigrar = 1 stig (stillanlegt), 4 stig vinna sett (stillanlegt).

## Tölfræði og verðlaun

Tölfræðin er reiknuð frá raw leikjagögnum, ekki handvirkum teljurum.

- Stig, litlir sigrar og settsigrar.
- Mörk, stoðsendingar og G+A.
- Stig/kvöld, stig/sett, settsigur% og framlag/kvöld.
- Bestu einstöku kvöld: stig, mörk og stoðsendingar.
- 😵 Choke: 3 stig í kláruðu setti en tap.
- 🥚 0-sett: 0 stig í kláruðu setti.
- ☠ Nix: 0 stig allt kvöldið.
- Tímabilsval, tafla, met og verðlaun.
- Weighted-random rating með sample-size shrinkage fyrir nýja/lítið spilaða leikmenn.

### Verðlaun sem eru undirbúin

- Stigakóngurinn
- Settameistarinn
- Markakóngurinn
- Stoðsendingakóngurinn
- Framlag ársins
- Styrkleikakóngurinn
- Járnmaðurinn
- Skilvirkastur
- Kvöldsprengjan
- Markasprengjan
- Choke-meistarinn
- Núllkóngurinn
- Nixarinn

## Kynningarhamur

Í Tölfræði er `▶ Kynning` fyrir valið tímabil. Hann er hannaður fyrir sjónvarp/skjávarpa:

- Season intro
- Heildartafla
- Verðlaunasíður
- Skammarveggur
- Full-screen takki
- Örvatakkar / space til að fletta

## Backup / restore

`↓ Backup` er aðgengilegt beint á forsíðu og einnig undir Sync.

Export býr til eina JSON-skrá með öllum raw gögnum:

- players
- seasons
- sessions + attendance
- sets + teams + memberships
- games
- goals + assists

`Restore backup` getur endurheimt sömu gögn og setur þau aftur í sync queue. Þetta er ætlað sem öryggisnet fyrir updates.

## Offline / cloud

- Dexie / IndexedDB er primary local store.
- Allar mutations fara í sync queue.
- Supabase auth + pull/push þegar credentials eru sett.
- Appið virkar áfram án nets.
- PWA manifest og Cloudflare-ready Vite build.

## Keyra locally

```powershell
npm install
npm run dev
```

Opnaðu slóðina sem Vite sýnir, yfirleitt `http://localhost:5173`.

## Prófanir og production build

```powershell
npm test
npm run build
```

## Supabase — án CLI

Í Supabase Dashboard → SQL Editor, keyrðu migrations í röð:

1. `supabase/migrations/001_initial_schema.sql`
2. `supabase/migrations/002_timer_persistence.sql`
3. `supabase/migrations/003_season_analytics.sql`

`003` býr til season analytics views og bakfyllir eldri sessions á rétt Aug–Jul tímabil eftir dagsetningu.

Búðu síðan til `.env.local` út frá `.env.example`.

## Cloudflare

Production output er `dist/`. Build command er `npm run build`.

Sjá `SETUP-WINDOWS.md` fyrir næstu skref.
