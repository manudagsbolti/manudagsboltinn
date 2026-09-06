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
2. Opna **SQL Editor → New query**. Afrita **alla** `supabase/setup-empty-project.sql` og velja **Run**. Skráin keyrir migrations 001–008 í einni transaction og stöðvar ef app-töflur eru þegar til. Hún er framleidd með `npm run supabase:setup`; ekki keyra bæði hana og einstöku migrations.
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

### Sameiginlegt lykilorð fyrir strákana

Ef fyrri uppsetning (001–007) er þegar komin í Supabase, keyra **aðeins**
`supabase/migrations/008_shared_recording_access.sql` í SQL Editor.
Ekki endurkeyra `setup-empty-project.sql` á þeim grunni.

1. Í **Authentication → Users → Add user → Create new user** stofna
   `skraning@manudagsboltinn.com` með sameiginlega lykilorðinu sem þú velur.
   Velja **Auto Confirm User**. Þetta er fast auðkenni sameiginlegs app-aðgangs;
   strákarnir þurfa ekki að opna þetta pósthólf. Enginn póstur er sendur af appinu.
2. Afrita UID þess notanda og keyra í SQL Editor:

   ```sql
   insert into public.app_recorders(user_id)
   values ('UID-SAMEIGINLEGA-NOTANDANS')
   on conflict (user_id) do nothing;
   ```

   Þessi notandi á **ekki** að vera í `app_admins`. Þinn eigin aðgangur helst þar.
3. Opna appið, velja **Stjórnandaaðgangur** og skrá inn með þínu netfangi/lykilorði.
4. Stofna/breyta önn undir **Leikmenn → Annir** ef þarf. Fara í **Sync → Aðgangur
   að leikskráningu**, velja dagsetningu og önn, haka við **Opna fyrir skráningu**
   og velja **Vista aðgang**. Dagsetning verður að vera innan annarinnar.
5. Strákarnir opna sömu slóð og slá aðeins inn sameiginlega lykilorðið.
   Fyrsta innskráning sækir leikmannalista og gögn opna kvöldsins. Eftir það
   opnar tækið yfirleitt vistuðu aðgangslotuna. Hnappur á forsíðu sækir/samstillir.

Þeir geta valið mætingu, bætt við nýjum varamanni, raðað í lið og skráð kvöldið.
Annir, eldri kvöld, tölfræðisíður, styrkleikamat og stjórnunarverkfæri eru ekki
aðgengileg. RLS og RPC staðfesta sömu takmarkanir í gagnagrunninum.

Sameiginlega lykilorðið er ekki í `.env.local`, Git eða JavaScript-búntinum.
Það er lykilorð staðfests Supabase Auth notanda. Breyta því í Auth-stjórnun
þegar þarf. Til að loka strax fyrir skýjaskrif má loka skráningarglugganum í
appinu eða fjarlægja UID úr `app_recorders`; þegar útgefnar aðgangslotur verða
ógildar þarf að skrá inn aftur. Að breyta lykilorði einu og sér er ekki loforð
um að öll þegar innskráð tæki missi aðgang samstundis.

Hafa eitt skráningartæki í einu og samstilla áður en skipt er um tæki, kvöld
eða aðgang. Ósendar breytingar hindra útskráningu og skipti um aðgang/glugga
á viðkomandi tæki. Ef stjórnandi lokaði glugganum of snemma, opna sömu
dagsetningu/önn aftur svo tækið geti sent gögnin. Offline gögn eru varðveitt.

Í production er appið lokað ef Supabase-stillingar vantar. Local-only þróun
án stillinga er áfram leyfð með `npm run dev`. Aðgangsbreytingarnar þurfa
endurræsingu á dev server eða nýtt production build.

### Prófun með tveimur aðgöngum

- Prófa stjórnanda í einum vafra og sameiginlega aðganginn í öðrum.
- Opna `#/stats`, `#/players`, `#/cloud` og `#/presentation/...` sem skráningaraðili:
  appið sýnir aðeins skráningarforsíðuna. Eldri gögn eiga ekki að vera í local DB.
- Prófa Start/mark/Undo offline, tengjast aftur og staðfesta gögn sem stjórnandi.
- Staðfesta að samantekt kvöldsins sé aðgengileg en engin annartölfræði birtist.

- Skrá prófkvöld offline, með marki/stoðsendingu og sjálfsmarki. Tengjast aftur; biðröðin á að tæmast.
- Skoða `sessions`, `games`, `goals` og `session_snapshots` í Table Editor. Snapshot er endurheimtuafrit af hráum staðreyndum; tölfræði er enn reiknuð úr staðreyndum.
- Undo eftir fjórða sigur á að fjarlægja næsta tilbúna sett/leik í skýinu og merkja afturkallað mark með `deleted_at`.
- Opna annan vafra, skrá inn og velja `Sync núna`: sama saga/samantekt birtist. RUNNING leikur endurheimtist PAUSED þegar live skjár er opnaður. Undo-sagan er aðeins á upprunalega tækinu.
- Ekki skrá sama leik samtímis á tveimur tækjum. Samstilla bæði áður en skipt er um skráningartæki.
- Ef skráning heldur áfram meðan gögn eru sótt, heldur appið local breytingunum og frestar niðurhalinu. Velja aftur `Sync núna` þegar hlé er á skráningu.

Tengingarvillu má greina án þess að birta lykla: athuga að project sé virkt, migration 007 sé komin inn og rétt Auth UID sé í `app_admins`. Ekki afrita innihald `.env.local` í samtöl eða Git.

Ef eldri local gögn eru til en engar sendingar í bið og nýr skýjagrunnur er alveg tómur, stöðvar appið niðurhal í stað þess að eyða gögnunum. Velja **Export backup**, varðveita skrána, svo **Restore backup** með sömu skrá og **Sync núna**. Restore setur hrá gögn í rétta sendingarröð en flytur ekki Undo-sögu.

## 3. Fyrsta önnin

Í virka appinu: **Leikmenn → Annir** til að stofna/breyta önn og **Nýr leikdagur → Önn** til að velja hana. Sjálfgefið er janúar–apríl og september–desember; maí–ágúst er sumarfrí. Sérsniðnar dagsetningar eru leyfðar. Fyrri kvöld halda vistuðu season ID og role snapshoti.

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
