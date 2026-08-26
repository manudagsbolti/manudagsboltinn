# Mánudagsboltinn

Offline-first PWA fyrir live skráningu og tölfræði Mánudagsboltans.

## V1 inniheldur

- 2 eða 3 lið, með frjálsri liðastærð (4v4, 4v4v4, 4v4v5, 5v5v5 o.s.frv.)
- 3:00 countdown timer, hljóð, pause/resume og handvirkt start á næsta leik
- King-of-the-court rotation fyrir 3 lið og rétt 2-liða hegðun
- Fyrst í 4 sigra vinnur sett
- Mark, markaskorari, stoðsending og sjálfsmark
- Fastamaður / varamaður snapshot á hverju boltakvöldi
- Staða kvöldsins: sigrar, sett, choke, nix og leikmannatölfræði
- Lokasamantekt leikmanna
- Önn: fastamannakeppni, varamannatafla, allir leikmenn og pör
- IndexedDB local-first geymsla og recovery eftir refresh/crash
- Supabase sync sem er valfrjálst meðan á leik stendur
- PWA install, service worker og Wake Lock
- Cloudflare Workers Static Assets deploy

## Local development

```bash
npm install
copy .env.example .env.local   # Windows CMD; PowerShell: Copy-Item .env.example .env.local
npm run dev
```

Ef Supabase breyturnar eru ekki settar virkar appið local-only.

Sjá `docs/SETUP.md` fyrir production uppsetningu.
