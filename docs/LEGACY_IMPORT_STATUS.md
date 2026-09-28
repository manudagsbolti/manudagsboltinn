# Staða sögulegs innflutnings

Vinnumappa á Drive: https://drive.google.com/drive/folders/1gTODtfvfHFnNsfPOScAyGEk0pS8mhEzS

Í möppunni eru níu afrit af tölfræðiskrám. Frumskrár hafa ekki verið breyttar.
`data/legacy/staging.json` er staðbundin, git-hunsuð yfirferðarskrá úr átta árstíðarbókum. Hún er **ekki innflutningsskrá** og má ekki senda beint í gagnagrunn.
Afrit yfirferðarskrárinnar er einnig í vinnumöppunni á Drive: https://drive.google.com/file/d/1_brbgzrhMLtyPgTFWrv2IFCFqhGVk-yT/view

| Önn | Kvöld með skráðum staðreyndum | Gestafærslur | Heimild |
| --- | ---: | ---: | --- |
| 2022 Haust | 15 | 0 | `Mánudags tölfræði - haust 2022_.xlsx` |
| 2023 Vor | 15 | 4 | `Mánudags tölfræði - 2023-01.xlsx` |
| 2023 Haust | 16 | 15 | `Mánudags tölfræði - 2023-02.xlsx` |
| 2024 Vor | 16 | 24 | `Mánudags tölfræði - 2024-01.xlsx` |
| 2024 Haust | 16 | 30 | `Mánudags tölfræði - 2024-02.xlsx` |
| 2025 Vor | 17 | 12 | `2025-01.xlsx` |
| 2025 Haust | 16 | 22 | `2025-02.xlsx` |
| 2026 Vor | 17 | 17 | `2026-01.xlsx` |

Þessar 128 nætur eru mögulegar heimildarfærslur, ekki staðfestur innflutningsfjöldi.

## Óleyst áður en skrifað er í Supabase

- `2022 Haust`: engin umferðaúrslit í aðaltöflunni; skráðir leikmannasigrar passa ekki í núverandi `session_backfills` án nýs gagnasviðs. „29 des“ er ekki mánudagur og síðasti dálkurinn „26 des“ virðist auður. Ekki búa til tilbúin sett.
- `2023 Vor`: 30. janúar er merktur sem dálkur en hvorki liðsskipan né úrslit eru skráð. Átta sig á hvort kvöldið var spilað áður en færsla er stofnuð.
- `2024 Vor`: dálkur merktur „ATH: 29. apr“ er á undan 8., 15. og 22. apríl. Staðfesta dagsetningu áður en raðað er.
- Nokkrar umferðir hafa engan ótvíræðan sigurvegara í heimildinni: 9. október 2023 (önnur og þriðja umferð), 15. apríl 2024 (fimmta), 21. október 2024 (fjórða) og 15. desember 2025 (fimmta). Varðveita þær sem óstaðfestar eða óloknar; ekki búa til tilbúinn sigurvegara.
- 24. október 2022 eru tveir mismunandi sigurafjöldar skráðir hjá leikmönnum í A-liði. Staðfesta áður en liðstala er dregin af.
- Gestalistar: 124 gestafærslur þarf að tengja við rétta dagsetningu, lið og varanlegt leikmannsauðkenni. Sum nöfn eru styttingar eða mismunandi stafsetningar. Færslur án öruggrar auðkenningar fara ekki í innflutning.
- Backup frá 28. september 2026 staðfestir 17 núverandi leikmenn, tvær annir og fimm kvöld. Öll núverandi kvöld eru í `2026 Haust`; árekstrarpróf fann ekkert sögulegt kvöld á sömu dagsetningu.
- `2026 Vor` er þegar til með réttu tímabili og engin kvöld. Endurnýta skal ID þeirrar annar. Stofna skal hinar sjö eldri annir sem óvirkar.
- Fjórtán eldri aðalnöfn passa beint við núverandi `player_id`. Stofna þarf Pelle Damby Carøe, Andra Björn Ólafsson, Ragnar Sigurðarson, Baldur Þór Elíasson og Einar Ísfjörð sem óvirka leikmenn ef full nöfn eru staðfest.
- Sögulegar annir skulu vera `is_active = false`. Ekki nota `ensureSeasonForDate`, sem getur afvirkjað núverandi önn.

## Örugg röð

1. Leiðrétta heimildir og auðkenni í yfirferðarskrá. Keyra `node scripts/legacy-audit.mjs` þar til engin óleyst atriði eru eftir.
2. Keyra `node scripts/legacy-season-plan.mjs <backup.json>`; stöðva ef annir eða kvöld skarast. Backup 28. september skilaði `CLEAR`.
3. Útbúa staðfest canonical JSON með stöðugum auðkennum og skýrum `AGGREGATE` uppruna. Bæta gagnalíkani fyrir 2022 sigra áður en þeim er hlaðið inn.
4. Prufukeyra innflutning á einangruðum gagnagrunni og bera samtölur saman við afritin á Drive.
5. Keyra skrif í raungrunn með stjórnandaaðgangi og sannreyna `get_sync_state` eftir á. Frumgögn á Drive og núverandi kvöld haldast óbreytt.

Engin söguleg önn, kvöld eða leikmannsfærsla hefur enn verið skrifuð í Supabase.

Samtölur skráðra liðsmælinga stemma við umferðatöfluna í öllum heimildum frá 2023 þar sem leikmaður liðs er skráður; þetta er krossathugun á útdrætti, ekki endanleg staðfesting á öllum kvöldum.
