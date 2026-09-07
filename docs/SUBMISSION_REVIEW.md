# Innsending og samþykkt kvölda

Þetta flæði leysir af hólmi fyrirfram opnun dagsetningar frá migration 008.
Engin skráning á nafni þess sem sendir inn er nauðsynleg.

## Virkja

1. Ef migrations 001–010 eru þegar komnar í Supabase: keyra **aðeins**
   `supabase/migrations/011_submission_review.sql` í SQL Editor.
   Annars keyra þær migrations sem vantar í númeraröð. Heildarskráin
   `setup-empty-project.sql` er aðeins fyrir tóman grunn og inniheldur nú 001–011.
2. Sameiginlegi Auth-notandinn `skraning@manudagsboltinn.com` heldur lykilorðinu
   sínu og UID-færslu í `app_recorders`. Þinn aðgangur helst í `app_admins`.
3. Endurhlaða appið með nettengingu eftir SQL-uppfærslu til að sækja nýtt
   aðgangsflæði. Nýr production-kóði þarf einnig að vera kominn í hýsingu.

Ef sameiginlegi notandinn er ekki til: stofna hann undir Authentication → Users,
velja lykilorð og Auto Confirm User. Afrita UID og keyra:

```sql
insert into public.app_recorders(user_id)
values ('UID-SAMEIGINLEGA-NOTANDANS')
on conflict (user_id) do nothing;
```

Strákarnir slá aðeins inn lykilorðið. Enginn póstur eða aukastaðfesting er send.
Sameiginlegi notandinn á ekki að vera í `app_admins`.

## Skráningaraðili

- Velur dagsetningu, mætingu og lið sjálfur; stjórnandi þarf ekkert að opna.
- Skráir leiki offline eins og áður og lýkur kvöldinu.
- Velur **Senda til yfirferðar** á forsíðu eða samantekt kvöldsins.
- Sér **Bíður sendingar** meðan sending er offline, **Bíður samþykktar** eftir
  móttöku og síðar **Samþykkt** eða **Hafnað** eftir samstillingu.
- Sér aðeins skráningar á eigin vafra/tæki. Annað tæki með sama lykilorði fær
  ekki aðgang að skráningunum. Nota eitt tæki fyrir hvert kvöld.

Sendingin frýs afrit kvöldsins. Endursending eftir netslit býr ekki til annað
kvöld. Almenn staða fastamanna/varamanna er staðfest við yfirferð og er ekki
endanleg á skráningartækinu. Engar annir eða söguleg leikgögn eru sótt þar.
Útskráning eða skipti um aðgang stöðvast meðan ósend kvöld eru á tækinu.
Ekki hreinsa vafragögn eða loka huliðsglugga með ósendri skráningu.

Eldri local kvöld varðveitast við uppfærslu sama skráningaraðgangs. Ef þau voru
þegar samstillt í eldri flæðinu á ekki að senda þau aftur til yfirferðar.
Reyni stjórnandi að samþykkja innsendingu með ID kvölds sem er þegar til,
stöðvast samþykktin og engin eldri gögn eru yfirskrifuð.

## Stjórnandi

**Annir og kvöld → Bíður samþykktar → Sækja innsendingar**.

1. Opna kvöldið og skoða lið, sett, mörk, stoðsendingar og leikmannalista.
2. Leiðrétta leikdag ef þarf og velja önn. Dagsetning þarf að vera innan hennar.
3. Yfirfara fastamanns-/varamannsstöður. Sjálfgefið miðast þær við valda önn
   og leikdag; hægt er að velja stöðu hvers leikmanns sérstaklega fyrir kvöldið.
4. Velja **Samþykkja kvöld** eða **Hafna skráningu** og staðfesta.

Samþykkt bætir kvöldinu og hráum leikgögnum við í einni SQL transaction og
staðfestir móttöku. Aðeins þá kemur það í venjulegar annartölur. Gögn sem þú
skráir sjálfur sem stjórnandi fylgja áfram venjulegri skráningu án yfirferðar.
Eftir samþykkt má nota venjulegar leiðréttingar kvölda.

Hafnað kvöld telur aldrei í annartölfræði. Innsending og móttökustaða eru
varðveitt í `night_submissions` svo endursending geti ekki enduropnað höfnun.
Þetta er höfnun, ekki varanleg eyðing allra gagna innsendingarinnar.

Yfirferð og samþykkt krefjast nets. Ef samþykkt tekst en niðurhal bregst, velja
**Sync núna**; samþykkt kvöld verður ekki tvískráð við endurtekna aðgerð.
Prófa í aðskildum vöfrum sem stjórnandi og sameiginlegur skráningaraðili.
Skráningaraðili má hvorki lesa `night_submissions` né venjulegar leikjatöflur.

## Gögn og öryggi

`night_submissions` geymir hráar innsendingar utan samþykktra taflna. Ekkert
review-status filter þarf í hverri tölfræðisíðu: ósamþykkt gögn eru ekki þar.
Gamlar recorder RLS-reglur eru felldar brott og almenn sync RPC eru admin-only.
Þröng RPC veita leikmannalista og taka við innsendingu. Ósýnilegur slembilykill
fyrir móttökukvittun varðveitist á upprunatækinu; hann auðkennir ekki persónu.

Dexie v6 bætir við local `submissions` töflu án breytinga á eldri leikgögnum.
Skráningartæki sendir frystar innsendingar, ekki venjulegu admin-sync biðröðina.
Móttökukvittun og endursending eru varin með SQL-lás. Innflutningur samþykktra
gagna er insert-only svo UUID-árekstur geti ekki yfirskrifað annað kvöld.
Stjórnandabackup appsins nær yfir samþykkt gögn. Pending innsendingar þurfa
að vera með í venjulegu Supabase/Postgres öryggisafriti.
