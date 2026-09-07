# Uppsetning á Windows — án local admin

Þú þarft aðeins Node/npm og Git sem eru þegar uppsett.

## 1. Setja skrárnar í Git repo

Extractaðu ZIP og afritaðu **innihaldið** yfir í núverandi Git repo. Ekki eyða `.git` möppunni.

Áður en þú overwrite-ar eldri app-skrár er gott að opna núverandi app og ýta á `↓ Backup` ef þar eru komin raunveruleg gögn.

## 2. Install og local run

```powershell
npm install
npm run dev
```

## 3. Staðfesta build

```powershell
npm test
npm run build
```

## 4. Supabase

Engin Supabase CLI og ekkert Docker þarf.

Í Supabase Dashboard → SQL Editor keyrirðu migrations í röð:

```text
001_initial_schema.sql
002_timer_persistence.sql
003_season_analytics.sql
```

`003` er safe upgrade: það bakfyllir eldri sessions á tímabil út frá dagsetningu og býr til backend season-statistics views.

Búðu svo til `.env.local`:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

Ekki setja `.env.local` í Git.

## 5. Cloudflare

- Build command: `npm run build`
- Output directory: `dist`
- Settu sömu tvær `VITE_...` environment variables í Cloudflare build settings.
- Tengdu domainið þegar deploy er komið upp.

## Flæði í appinu

1. Leikmenn → bæta hópnum inn.
2. Heim → Byrja nýjan leikdag.
3. Velja mætingu.
4. Áfram → sjá staðfestan hóp.
5. Velja `Weighted random` eða `Full random`.
6. Ýta á `SKIPTA Í LIÐ` og sjá shuffle eiga sér stað.
7. Skoða/fínstilla lið og byrja sett.
8. Starta leik → mark → markaskorari → stoðsending.
9. Rotation / timeout / næsti leikur.
10. Næsta sett með sömu liðum eða nýjum drætti.
11. Klára kvöld → samantekt.
12. Tölfræði → velja tímabil → tafla / verðlaun / met / kynning.

## Fyrir update

1. Forsíða → `↓ Backup`.
2. Geyma JSON-skrána örugglega.
3. Deploy/update.
4. Ef gögn virðast horfin: Sync → `Restore backup`.
