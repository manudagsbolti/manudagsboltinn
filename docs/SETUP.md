# Production setup

## 1. Local

1. Opna repository í VS Code.
2. Keyra `npm install`.
3. Keyra `npm run dev`.
4. Prófa local áður en cloud er tengt.

## 2. Supabase

1. Stofna project.
2. Opna **SQL Editor** og keyra allt `database/schema.sql`.
3. Undir **Authentication > Users** velurðu **Add user / Send invitation** á þitt netfang og klárar boðið þannig að notandinn fái lykilorð.
4. Afrita `User UID` notandans úr Authentication > Users. Opna SQL Editor og keyra:

```sql
insert into public.app_admins(user_id) values ('SETTU-USER-UID-HÉR');
```

Þetta er viljandi allow-list: það er ekki nóg að vera bara Supabase Auth notandi til að lesa/skrifa boltann.
5. Mælt er með að slökkva á opinni nýskráningu í Auth settings þegar admin er kominn upp.
6. Finna Project URL og **Publishable key** í Connect / Settings > API Keys.
7. Búa til `.env.local` í root:

```env
VITE_SUPABASE_URL=https://PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

8. Endurræsa `npm run dev`.
9. Fara í **Stjórnun > Ský & sync**, skrá inn og velja `Sync núna`.

Ath: publishable key má vera í frontend. Aldrei setja `service_role` key í þetta app.

## 3. Fyrsta önnin

1. Stjórnun -> stofna önn, t.d. `2026 Haust`.
2. Bæta leikmönnum inn (má líma eitt nafn í línu).
3. Velja `Staða gildir frá` = upphaf annar.
4. Merkja 15 fastamenn með `F`. Aðrir eru `V`.
5. Ef staða breytist á miðri önn: setja effective date og velja nýja stöðu. Fyrri boltakvöld halda sínu snapshoti.

## 4. Git

```bash
git add .
git commit -m "Mánudagsboltinn production V1"
git push
```

`.env.local` er í `.gitignore` og á ekki að fara á GitHub.

## 5. Cloudflare Workers

Repository inniheldur `wrangler.jsonc` með `dist` sem static assets og SPA fallback.

### Sjálfvirkt Git deploy

Í Cloudflare:

1. Workers & Pages -> Create application.
2. Import a repository.
3. Tengja GitHub og velja repo.
4. Production branch: `main`.
5. Build command: `npm run build`.
6. Deploy command: `npx wrangler deploy`.
7. Bæta `VITE_SUPABASE_URL` og `VITE_SUPABASE_PUBLISHABLE_KEY` við **Build variables** (þetta eru Vite build-time variables).
8. Save and Deploy.

### Fyrsta handvirka deploy (valkostur)

```bash
npx wrangler login
npm run deploy
```

## 6. Domain

Þegar Worker er kominn upp:

1. Workers & Pages -> Worker -> Settings / Domains & Routes.
2. Add Custom Domain.
3. Nota t.d. `app.thittlen.is` eða root lénið.
4. Ef DNS er hjá Cloudflare sér Cloudflare um record og TLS/SSL.

## 7. Símapróf áður en farið er live

- Opna production URL í síma.
- Setja á Home Screen / install PWA.
- Stjórnun -> Prófa lokahljóð og stilla volume tækisins.
- Slökkva á Wi-Fi/4G og staðfesta að appið opnist og live recorder virki.
- Prófa Start, Pause, Resume, mark, assist, timeout, rotation, 4 sigrar -> sett og Undo.
- Kveikja á neti og staðfesta að sync fari í `Synced`.

## 8. Backup

Supabase Free er nóg fyrir umfangið, en backup policy þarf að vera meðvituð. Áður en kerfið verður eina sögulega heimildin skal annaðhvort:

- taka regluleg Postgres dumps, eða
- færa project á plan með viðeigandi managed backups.

Offline gögn í einum síma eru ekki backup-strategía.
