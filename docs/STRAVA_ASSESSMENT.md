# Strava — athugun 29. október 2026

Engin Strava-tenging eða púlsagögn voru sett í kerfið við þessa uppfærslu.

Activity Streams API getur skilað heartrate-gögnum úr heimilaðri æfingu sem
hefur þau gögn. Þetta er ekki sjálfkrafa lifandi púlsastreymi frá úrinu.
Hver leikmaður þyrfti eigin OAuth-heimild; ekki má setja client secret eða
refresh tokens í Vite/útgefnar glærur. Núverandi sameiginlegur stjórnanda- og
skráningaraðgangur er ekki persónulegt leikmannainnritunarkerfi.

API Policy §2.3 og yfirlit API Agreement takmarka birtingu Strava-gagna við
viðkomandi notanda. Sameiginlegt yfirlit eða glærukynning með púlsi annarra
leikmanna fellur því ekki innan þessarar venjulegu tengingar. Athuga þarf
leyfilega leið sérstaklega áður en slíkt er byggt. Einstaklingssýn á eigin
gögn væri annað verkefni með OAuth, öruggri token-geymslu, afturköllun og eyðingu.

Heimildir sem voru lesnar:

- https://developers.strava.com/docs/reference/#api-Streams-getActivityStreams
- https://developers.strava.com/docs/authentication/
- https://www.strava.com/legal/api_policy (sérstaklega §2.3)
- https://www.strava.com/legal/api
