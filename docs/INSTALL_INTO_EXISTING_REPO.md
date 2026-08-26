# Setja Full V1 inn í núverandi Git repo

Öruggasta leiðin ef repo-ið þitt inniheldur v0.2 sem við byrjuðum á:

```bash
git status
git add .
git commit -m "Checkpoint before full V1"
git push
git checkout -b full-v1
```

Síðan afþjapparðu `manudagsboltinn-full-v1.zip` annars staðar og afritar **innihald möppunnar** yfir í root á repo-inu þínu. Ekki eyða `.git` möppunni.

Síðan:

```bash
npm install
npm run typecheck
npm run dev
```

Ef allt er gott:

```bash
git add -A
git commit -m "Build complete offline-first V1"
git push -u origin full-v1
```

Þá geturðu annaðhvort merge-að branchinum í `main` á GitHub eða:

```bash
git checkout main
git merge full-v1
git push
```

## Patch valkostur

Ef repo-ið þitt er nákvæmlega gamla `manudagsboltinn-v1-0.2` buildið má í staðinn setja `manudagsboltinn-full-v1.patch` í repo root og keyra:

```bash
git checkout -b full-v1
git apply --check manudagsboltinn-full-v1.patch
git apply manudagsboltinn-full-v1.patch
npm install
npm run typecheck
npm run dev
```

Ef `git apply --check` gefur villu skaltu nota zip-leiðina í staðinn; ekki force-a patchið.
