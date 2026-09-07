# Production setup

## 1. Local

Fyrir local-only keyrslu þarf ekki `.env.local`. Fyrir cloud má afrita tómu `.env.example` yfir í `.env.local` og fylla út á tækinu; ekki vista gildin í Git. `npm ci` endursetur dependencies úr lockfile.

Keyrðu `npm run typecheck`, `npm test` og `npm run build` fyrir útgáfu. Sjá `docs/V1_AUDIT.md` fyrir ólokin síma/cloud acceptance atriði og ósamræmi í eldri uppsetningarleiðbeiningum.

1. Opna repository í VS Code.
2. Keyra `npm install`.
3. Keyra `npm run dev`.
4. Prófa local áður en cloud er tengt.

## 2. Supabase

### Nýr, tómur grunnur

1. Stofna/opna project. `.env.local` þarf Project URL og publishable key; gildin fara aldrei í Git.
2. Opna **SQL Editor → New query**. Afrita **alla** `supabase/setup-empty-project.sql` og velja **Run**. Skráin keyrir migrations 001–011 í einni transaction og stöðvar ef app-töflur eru þegar til. Hún er framleidd með `npm run supabase:setup`; ekki keyra bæði hana og einstöku migrations.
3. Undir **Authentication → Users → Add user → Create new user** stofna þinn notanda með netfangi og lykilorði og staðfesta netfangið með **Auto Confirm User** ef sá valkostur birtist. Appið notar netfang/lykilorð; það hefur ekki enn sérstakt skjáflæði til að velja lykilorð úr boðstengli.
4. Afrita `User UID` notandans úr Authentication → Users. Opna nýja SQL Editor fyrirspurn og keyra:

```sql
insert into public.app_admins(user_id)
values ('SETTU-USER-UID-HÉR')
on conflict (user_id) do nothing;
```

Þetta er viljandi allow-list: það er ekki nóg að vera bara Supabase Auth notandi til að lesa/skrifa boltann.
5. Hafa **Allow new users to sign up** óvirkt í Authentication stillingum. Ekki opna nýskráningu til að leysa aðgangsvillu; staðfesta frekar UID í `app_admins`.
6. Finna Project URL og **Publishable key** í Connect / Settings > API Keys.
7. Búa til `.env.local` í root:

```env
VITE_SUPABASE_URL=https://PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

8. Endurræsa `npm run dev`.
9. Fara í **Sync**, skrá inn og velja `Sync núna`. Breytingar sem eru í bið sendast líka sjálfkrafa við innskráningu, endurtengingu og á 30 sekúndna fresti. Sækja gögn úr skýinu er handvirk aðgerð.

Ath: publishable key má vera í frontend. Aldrei setja `service_role` key í þetta app.

### Grunnur með app-töflum

Keyra aðeins migrations sem hafa ekki verið keyrðar, í númeraröð. Ekki nota `database/schema.sql`, sem tilheyrir eldra, óvirku appi. Migration 007 bætir við `app_admins`, herðir RLS, lokar eldri tölfræðiviews fyrir frontend og býr til `apply_sync_batch`, `get_sync_state`, `sync_operations` og `session_snapshots`. Stjórnandi þarf alltaf færslu í `app_admins`, líka þegar hann var áður innskráður.

### Submission review

See [Innsending og yfirferd](SUBMISSION_REVIEW.md) for the current shared-password
setup. Migration 011 replaces the old pre-opened recording window. Apply only
unapplied migrations in order; never rerun empty-project setup on an existing DB.

## 3. Fyrsta önnin

### Eyða prófkvöldi

Keyra `supabase/migrations/010_delete_session.sql` í SQL Editor eftir 009.
Ekki endurkeyra heildaruppsetningu á grunni sem er þegar til.
Sem stjórnandi: **Annir og kvöld → önn → Eyða kvöldi**. Staðfestingin sýnir
dagsetningu og önn; slá þarf inn **EYÐA** og velja **Staðfesta eyðingu**.
Ljúka þarf live-kvöldi fyrst. Öllum skráningum völdu kvölds er eytt, þar með
talið breytingasögu, en leikmenn, annir og önnur kvöld haldast.
Eyðing fer í sendingarbið offline. Samstilla á upprunatæki áður en farið er
í annað tæki og sækja síðan gögn þar. Ekki endurheimta gamalt backup eftir
eyðingu nema ætlunin sé að endurheimta kvöldið líka. Enginn Undo er á eyðingu.

### Leiðrétting á leikmannastöðu í skráðu kvöldi

Ef migrations 001–008 eru komnar inn: keyra aðeins
`supabase/migrations/009_session_role_corrections.sql` í SQL Editor áður en
leiðréttingar eru samstilltar. Uppsetning fyrir tóman grunn inniheldur nú 009 líka.

Sem stjórnandi: **Annir og kvöld → opna önn → kvöld → Leiðrétta leikmannastöður**.
Velja leikmann, rétta stöðu og ástæðu, svo **Staðfesta leiðréttingu**.
Breytingasaga sýnir fyrri/nýja stöðu, tíma og ástæðu. Leiðrétting gildir aðeins
fyrir þetta kvöld og færir framlag þess milli fastamanna-/varamannatölfræði.
Til að afturkalla leiðréttingu er önnur leiðrétting gerð; fyrri saga helst.
Leikgögn, önnur kvöld og almenn staða haldast. Live-kvöldi þarf að ljúka fyrst.
Engin leiðrétting er sjálfkrafa framkvæmd á fyrirliggjandi gögnum.

Í virka appinu: **Annir og kvöld** til að stofna/breyta önn og **Nýr leikdagur → Önn** til að velja hana. Sjálfgefið er janúar–apríl og september–desember; maí–ágúst er sumarfrí. Sérsniðnar dagsetningar eru leyfðar. Fyrri kvöld halda vistuðu season ID og role snapshoti.

Opna önn í **Annir og kvöld** til að sjá skráð kvöld hennar. **Breyta dagsetningu / önn** leiðréttir kvöld án endurskráningar gagna. Velja dagsetningu innan valinnar annar og staðfesta. Ef kvöldið færist milli anna flyst framlag þess í annartölfræði en skráð fastamanns-/varamannshlutverk haldast. Ljúka þarf live-kvöldi áður en það er leiðrétt.

Undir **Leikmenn** sjást fullar stöðumerkingar, fjöldi fastamanna/varamanna og gildisdagur. Hnappurinn **Nota upphaf annar** hjálpar við fyrstu uppsetningu; **Gera að fastamanni/varamanni** staðfestir breytinguna frá völdum degi. Virkur/óvirkur er óháð hlutverki og stjórnar mætingarlistanum. Nýir leikmenn eru sjálfgefið varamenn.

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
