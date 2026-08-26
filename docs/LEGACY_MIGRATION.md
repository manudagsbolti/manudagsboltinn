# Gömlu gögnin 2022–2026

Ekki flytja gömlu Excel gögnin inn fyrr en live V1 hefur verið prófað í alvöru og schema staðfest.

Migration verður í tveimur lögum:

1. Session-level history úr gömlu önnunum: mæting, lið, sigrar/sett, choke/nix, liðsmörk og eldri einstaklingsmörk þar sem þau eru til.
2. Nýja event-level líkanið (mark + assist + exact rotation) byrjar frá því appið fer í notkun. Ekki búa til tilbúna event-röð fyrir eldri gögn sem var aldrei skráð.

Sami `player_id` skal notaður þvert á allar annir. Fastamaður/varamaður skal varðveittur sem hlutverk á þeim tíma sem viðkomandi spilaði.

Þegar migration er tekin verður skrifað sérstakt import script sem les canonical CSV/JSON export úr gömlu Sheets og skrifar í Supabase. Raw export skal varðveita óbreytt til audit.
