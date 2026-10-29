# Kynningar

Sami hluti appsins heldur utan um bæði miðannamöt og lokahóf. Stjórnandi velur önn, viðburðardag, lokadag gagna og efni. Samstilla fyrst til að hafa nýjustu samþykktu gögnin. Forskoðun les samræmt local gagnasafn og aðeins kláruð kvöld til og með lokadegi. Hún breytist ekki meðan hún er skoðuð.

## Uppbygging samkvæmt fyrri kynningum

Fyrirmyndir lesnar á Drive: Mánudagsboltinn-2025-02-mid.pptx (haust 2025) og Mánudagsboltinn-2026-01-Final.pptx (vor 2026). Þar eru jafnir leikmenn saman með tölu sinni, ekki inngangur, talnaglæra og sér glæra fyrir hvern leikmann. Vor 2026 sýnir t.d. choke-hópa með 9, 10 og 11 og nix-hópa með 3 og 4.

- Ein forsíða og ein staðreyndaglæra.
- Besta/versta pörun, mæting og markaskorarar halda topp 5.
- Aldrei saman: allir, allt að 32 pör á glæru í tveimur dálkum.
- Oftast saman: allir, allt að 20 pör á þéttri töfluglæru.
- Kafnarinn: allt að þrjár niðurstöðuglærur, þrjú hæstu jákvæðu gildin í hækkandi röð. Allir jafnir saman á sömu glæru.
- Nixarinn: allt að tvær niðurstöðuglærur, tvö hæstu jákvæðu gildin í hækkandi röð. Allir jafnir saman á sömu glæru.
- Verðlaun: ein glæra á sæti, 3., 2., 1. Öll nöfn sem deila verðlaunum sjást saman. Engar aukainngangs- eða talnaglærur.
- Staðan: ALLIR fastamenn á EINNI glæru, með þéttara töflusniði sem lagast að fjölda raða og skjáhæð.
- Varamenn sér. Pallborðsumræða er frjáls texti.

Þessi breyting á uppbyggingu gildir fyrir nýjar forskoðanir; áður útgefið efni heldur vistuðum glærum.

## Val gagna og samanburður

Velja má upphafsdag og lokadag gagna (báðir telja með). Sjálfgefið upphaf er
upphaf valinnar annar. Listi sýnir hvaða kláruðu kvöld telja úr gögnum á tækinu;
samstilla þarf fyrst ef önnur tæki hafa nýrri samþykkt gögn. Tölfræðisíðan hefur
sömu dagasíu og val um ABS eða stig í smáleikjum. Stig eru einnig sér dálkur í
kynningartöflunni; þau eru ekki unnin sett eða ABS. ABS notar öll spiluð sett
valins tímabils, án óbyrjaðra undirbúningssetta. Nýjar kynningar sýna tímabil,
kvöldafjölda og sett. Eldri útgáfur haldast óbreyttar; búa þarf til nýja kynningu
til að nota breytt tímabil.

## Tölfræði

Nix (staðfest 29. október 2026): eitt mætt og spilað kvöld án unnins setts,
jafnvel þótt leikmaður fái stig úr smáleikjum. Telst einu sinni á kvöld, ekki
einu sinni í setti. Fjarvera og óspiluð kvöld telja ekki. Sama reikniregla er í
tölfræðitöflu, kvöldasundurliðun og nýjum kynningum. Eldri útgefnar kynningar
eru frystar og þarf að gefa út nýja útgáfu til að nota leiðrétta skilgreiningu.

Tölfræðiyfirlitið sýnir alla leikmenn í einni töflu með ABS-röðun sjálfgefið.
Dálkar eru raðanlegir og innihalda unnin/spiluð sett, ABS, ADJ, stig,
smáleikjasigra/leiki, mörk, assist, G+A, sjálfsmörk, choke, nix, 0-sett,
kvöld, mætingu og rating. Smellur á leikmann sýnir kvöldin að baki tölunum
með tengli á hvert kvöld. Óþekktur smáleikjafjöldi í aggregate gögnum er strik.

ABS = unnin sett / öll spiluð sett annarinnar. ADJ = unnin sett / spiluð sett viðkomandi. Aðalkeppni telur aðeins hlutverk REGULAR á hverju kvöldi; varamenn eru sér. Verðlaunahópar nota þrjú efstu ólíku ABS-gildin, með öllum jöfnum saman. Heildartaflan heldur sömu ABS-röðun og tölum.

Listar ná yfir leikmenn með skráða mætingu í viðkomandi hlutverki. Óbyrjuð undirbúningssett telja ekki. Pörun telur sameiginleg sett, settsigra, smáleikjasigra/eldri liðsmörk og choke. Báðir þurfa að vera fastamenn á kvöldinu. Eldri aggregate gögn eru lesin án tilbúinna atvika. Ófullkomin stoðsendingaþekja er merkt.

## Birting og offline

Forskoðun og sjálfstætt HTML niðurhal virka án nets. Sama snið er í appinu og HTML; myndir eru embedded í skránni. Texti er HTML-escaped. Glærur eru handstýrðar. Inn í kerfið og Tölfræði tengja í sama app með venjulegum aðgangsreglum.

Vefútgáfa þarf net, Supabase og migration 018. Hún geymir hrá gögn og tilbúnar glærur með gagnasniðsútgáfu. Sama auðkenni má endursenda en ekki yfirskrifa. Leiðrétting er ný útgáfa með nýjum tengli. Engin útgáfuvinna er í live-loop.

Varanlegur tengill #/published/<id> sýnir glærur án innskráningar. Opinbera RPC-ið skilar aldrei hráum gögnum. Aðeins stjórnandi getur gefið út og sótt safnið. Birting opinberar nöfn og valda tölfræði; þetta kemur fram fyrir útgáfu.

Útgáfur eru í Supabase og cached í Dexie v8. Backup inniheldur local útgáfur; restore sameinar safnið en endurútgefur ekki. Útskráning hreinsar cache; safnið má sækja aftur úr skýinu.

Þrjár AI-myndir og nákvæm prompt eru varðveitt í public/presentation-art/. Versioned skráarnöfn varðveita slóðir. PWA cache hámark er 3 MiB á skrá svo myndir fylgi offline. Gömlu kynningarnar sjálfar eru ekki sjálfkrafa fluttar inn eða endurútgefnar.

## Sturlaðar staðreyndir og pallborðsniðurstöður

Sturlaðar staðreyndir er valinn sjálfgefið og bætir einni glæru næstsíðast.
Hún reiknar allt að fjórar staðreyndir úr frysta gagnasafninu: stöðuna á toppnum,
hlut markahæstu í mörkum fastamanna, ósigraða/ónotaða pörun og hæstu choke-tölu.
Ekkert efni er búið til án stuðnings í gögnunum.

Í stjórnandakynningu er Skrá niðurstöður pallborðs. Sama aðgerð er við hverja
útgefna kynningu. Skrá umræðuefni og niðurstöðu; hver vistun bætir við færslu
með tengingu við kynningu, viðburðardegi og tímastimpli. Safnið er neðst undir
Kynningar. Niðurstöður eru sér gögn og breyta aldrei útgefnum glærum.

Dexie v9 vistar niðurstöður og sendingarstöðu offline. Við tengingu reynir appið
að senda aftur og má líka samstilla úr niðurstöðusafninu. Móttaka er idempotent
og append-only; leiðrétting er ný færsla. Útskráning/aðgangsskipti eru stöðvuð
meðan ósamstilltar niðurstöður bíða. Backup inniheldur safnið; restore sameinar
og setur niðurstöður aftur í sendingarbið.

Keyra þarf migration 019_discussion_entries.sql eftir 018 fyrir skýjavistun.
Aðeins stjórnendur geta vistað/sótt niðurstöður; þær eru ekki hluti af opinberu
slides-RPC. Vista má niðurstöður offline á áður innskráðu stjórnandatæki.


## Production rollout

The password-free local preview and sample-data seeder have been removed. Only the normal operational database is opened; the old isolated browser preview database is never imported or uploaded. Existing users, passwords and sessions are unchanged. Apply `supabase/upgrade-presentations-018-019.sql` once to an existing project on migration 017 before deployment; it checks for previously created publication tables and wraps both migrations in one transaction.
