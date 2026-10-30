# Drift og inspeksjon – Statens vegvesen

Kartbasert webapp der drift- og vedlikeholdsavdelingen og utbyggingsavdelingen ser, inspiserer og registrerer på VA-, elektro- og vegobjekter – på kontoret og i felt. Én kodebase med responsiv layout: kontor (≥ 769 px) og felt/mobil (≤ 768 px, eller `?modus=felt`).

Pilot: **E45 Kløfta B12016** (Kløfta/Langhølen, Alta), EUREF89 UTM33 (EPSG:25833), høyder i NN2000.

## Kom i gang

Krever Node 22.12+ (testet med Node 24 LTS – se `.node-version`).

```bash
npm install
cp .env.example .env          # VITE_USE_MOCK=true kjører uten portal
npm run dev                   # http://localhost:5180
```

| Kommando | Hva |
|---|---|
| `npm run dev` | Utviklingsserver (port 5180) |
| `npm run build` | Typesjekk (`tsc`) og produksjonsbygg til `dist/` |
| `npm run preview` | Server produksjonsbygget (port 4180) |
| `npm test` | Enhetstester (Vitest) |
| `npm run test:e2e` | Røyktest og UU-test (Playwright, mock-modus) |
| `npm run verify` | Alt over – skal være grønt før commit |
| `npm run mock` | Generer mockdata på nytt (`scripts/generate-mock.ts`) |
| `node scripts/generate-icons.ts` | Generer PWA-ikoner (plassholdere) |

Første gang Playwright brukes: `npx playwright install chromium`.

### Nyttige URL-parametre

| Parameter | Effekt |
|---|---|
| `?objekt=SR-003` | Dyplenke – åpner objektet i kartet (`#/3d` for 3D) |
| `?simgps=1` | Simulert GPS: går en rute langs E45 forbi SR-003 (test av geofence ved skrivebordet) |
| `?modus=felt` | Tvinger feltlayout på stor skjerm |
| `?diagnose=1` | (Portalmodus) Viser lag, tabeller og felt i webkartet – brukes til feltmapping |

Ruter: `#/kart`, `#/3d`, `#/oppgaver`, `#/inspeksjon`, `#/verktoy`, `#/meg`.

## Mock-modus

`VITE_USE_MOCK=true` kjører helt uten portaltilgang. `MockDataService` bygger klientbaserte FeatureLayers fra lokal GeoJSON (`src/data/mock/objekter.geo.json`):

- 312 objekter (VA 140, Elektro 78, Veg 94) lagt langs den **ekte senterlinjen for EV45 S2D1** hentet fra NVDB API Les (NLOD), fordelt på MMI-faser langs vegen.
- **Stikkrennetrase-003** (SR-003): Ledningsgrøft, MMI 400, 57,21 m, kote 105,80–107,99, Rev. A 2026-01-27, tegninger G301 og G501, fagmodell Overvann, modellfil `m_f_overvann_MMI400 (IFC2X3)`.
- Dokumenter, inspeksjoner og 18 oppgaver (fristene regnes relativt til dagens dato).
- Innsendte inspeksjoner lagres i `localStorage` i mock-modus.

Vegreferansene i mockdata er beregnet fra NVDB-stasjoneringen (f.eks. SR-003 = `EV45 S2D1 m10205`), ikke eksempelet `EV45 S1D1 m2340` fra kravene, som ligger et annet sted på E45.

## Geodata Online

Bakgrunnskart, høydemodell (3D) og adressesøk kommer fra Geodata Online (URL-ene er hentet fra <https://dokumentasjon.geodataonline.no/> og ligger i `src/config.ts`):

| Bakgrunn | 2D (UTM33) | 3D (lokal scene, raster) |
|---|---|---|
| Gråtone (standard) | `GeocacheVector/GeocacheGraatone` (vektor) | `Geocache_UTM33_EUREF89/GeocacheGraatone` |
| Basis | `GeocacheVector/GeocacheBasis` | `…/GeocacheBasis` |
| Bilder | `Geocache_UTM33_EUREF89/GeocacheBilder` | samme |
| Bilder hybrid | Bilder + `…/GeocacheHybrid` som referanselag | samme |
| Landskap* | `GeocacheVector/GeocacheBasisTerreng` | `…/GeocacheTerrengskygge` |
| Mørk kanvas | `GeocacheVector/GeocacheKanvasMork` | Gråtone (raster finnes ikke) |

\* Geodata Online har ikke et kart som heter «Landskap». Vi bruker «Basis med terreng» i 2D og «Terrengskygge» i 3D. Bekreft med SVV.

Høydemodell: `Geocache_UTM33_EUREF89/GeocacheTerreng/ImageServer`. Adressesøk: `ProxyServices/search/adresse` (svar i UTM33).

### Token i utvikling (mock-modus)

Legg Geodata Online-brukeren i `.env.local` (ignoreres av git):

```
GDO_USERNAME=…
GDO_PASSWORD=…
```

Vite-serveren henter et token **server-til-server** (`/api/gdo-token`, se `vite.config.ts`) med `client=referer` og 60 minutters levetid, og fornyer det automatisk. Passordet sendes aldri til nettleseren. Uten bruker vises kartet uten bakgrunn og terreng, og adressesøket er av.

### Token i produksjon (portalmodus)

Anbefalt: håndter Geodata Online i ArcGIS Enterprise, ikke i appen.

1. Opprett en egen Geodata Online-bruker for SVV (Geodata anbefaler en dedikert bruker).
2. Legg til tjenestene over som elementer i portalen med **lagrede legitimasjoner** (Add item → URL → «Store credentials with service item»).
3. Lag webkart for hvert bakgrunnskart (tittelen må inneholde «Gråtone», «Basis», «Bilder», «Bilder hybrid», «Landskap» og «Mørk kanvas»), og del dem i en gruppe.
4. Sett gruppens ID i `VITE_BASEMAP_GROUP_ID`.
5. Høydemodell og adressesøk: legg dem til som elementer med lagrede legitimasjoner på samme måte, og bruk element-URL-ene i `src/config.ts` (`gdo.elevationUrl`, `gdo.adresseSokUrl`).

## ArcGIS Enterprise: app-registrering

Innlogging bruker OAuth 2.0 med redirect og PKCE (`OAuthInfo` + `IdentityManager`, `flowType: "authorization-code"`, `popup: false`).

1. Logg inn på `https://kart.vegvesen.no/portal` med en bruker som kan opprette elementer.
2. **Content → New item → Application → Other application**. Gi den navnet «Drift og inspeksjon».
3. Åpne elementet → **Settings → Register** (Credentials):
   - Application type: **Browser**
   - Redirect URIs: produksjons-URL (f.eks. `https://<vert>/drift-og-inspeksjon/`) og `http://localhost:5180/` for utvikling
4. Kopier **App ID** (client ID) til `VITE_APP_ID`.
5. Del app-elementet og lagene med gruppene som skal ha tilgang (ansatte og entreprenører).

Ansatte logger inn med enkel pålogging (SAML i portalen). Entreprenører bruker egne ArcGIS-kontoer på samme påloggingsside. Tilgang til lag og prosjekter styres av grupper i portalen.

## Konfigurasjon (`.env`)

Se `.env.example`. De viktigste variablene:

| Variabel | Beskrivelse |
|---|---|
| `VITE_USE_MOCK` | `true` = mock, `false` = portal |
| `VITE_PORTAL_URL`, `VITE_APP_ID` | Portal og app-registrering |
| `VITE_WEBMAP_ID` | Webkartet (`97e21f38b3d94468bb414fa8cb7bc6a6`) |
| `VITE_WEBSCENE_ID` | Webscenen (3D) |
| `VITE_LAYERS_VA`, `_ELEKTRO`, `_VEG` | Objektlag: URL-er eller `tittel:<lagtittel i webkartet>`, kommaseparert |
| `VITE_TABLE_INSPEKSJONER`, `VITE_LAYER_OPPGAVER`, `VITE_TABLE_DOKUMENTER` | Tabeller/lag for inspeksjon, oppgaver og dokumenter |
| `VITE_SCENE_LAYERS` | i3s-fagmodeller: `Navn|URL,Navn|URL` |
| `VITE_BASEMAP_GROUP_ID` | Portalgruppe med Geodata Online-bakgrunnskart |
| `VITE_PRINT_URL` | Utskriftstjeneste i Enterprise |
| `VITE_NVDB_CLIENT` | Verdi for `X-Client`-headeren mot NVDB |
| `VITE_GPS_MAX_ACCURACY_M`, `VITE_GEOFENCE_RADIUS_M` | Geofence (standard 10 m og 15 m) |

### Pilot på ArcGIS Online

Piloten kjører mot ArcGIS Online-organisasjonen `geodata.maps.arcgis.com`, med webkart `d41d15c2c72b4498992d7b6428d7f23e` og webscene `87fcf27968834310a7da2fda6b637d05`. Appen ser fortsatt ut som SVV-appen. Bare `VITE_PORTAL_URL`, `VITE_APP_ID` og ID-ene er forskjellige, og samme kode fungerer mot `kart.vegvesen.no/portal`.

- **App-registrering:** gå til **Innhold → Nytt element → Utviklerlegitimasjon → OAuth 2.0-legitimasjon**. Legg inn redirect-URL-ene `http://localhost:5180/` og `http://localhost:4180/`. Client ID settes i `VITE_APP_ID`. Client Secret skal ikke brukes.
- **Automatisk kartlegging:** når `VITE_LAYERS_*` og tabellvariablene er tomme, kjenner appen igjen lagene i webkartet ut fra feltene:
  - `objekt_id` gir objektlag. Har laget et `fag`-felt med flere verdier, deles det per fag.
  - `tilstandsgrad` og `objekt_globalid` gir inspeksjoner.
  - `oppgave_id` gir oppgaver.
  - `objekt_globalid` og `url` gir dokumenter.

  Det spiller ingen rolle om feltnavnene har store eller små bokstaver.
- **Manglende tabeller:** mangler inspeksjons- eller oppgavetabell, lagres postene lokalt i nettleseren, og brukeren får beskjed.
- **3D:** er webscenen global (Web Mercator), brukes webscenens bakgrunn, terreng og kamera. App-objektene og NVDB projiseres inn. Er den i UTM33, legges lagene inn i den lokale scenen med Geodata Online-terreng.
- **Uten innlogging:** `npm run dev:mock` kjører mock-modus (`.env.mock`).

**Feltmapping:** De logiske feltnavnene ligger i `src/data/schema.ts`. Mappingen til SVVs tjenester justeres i `src/config.ts` (`fields`). Kjør appen i portalmodus med `?diagnose=1` for å se lag og felt i webkartet.

## Ekte data og fagkunnskap

Appen kobler prosjektmodellen mot ekte data selv i mock-modus.

**NVDB (i drift).** Ekte vegobjekter hentes fra NVDB API Les v4 for kartutsnittet (zoom 1:25 000 eller nærmere): stikkrenner, grøfter, kummer, rørledninger, belysning, kabler, skap, rekkverk og -ender, skilt, kantstein, vegdekke, fartsgrense og bruer (`src/nvdb/vegobjekter.ts`). Typene kan slås av og på i lagpanelet. Når du klikker på et objekt, åpnes et panel med egenskaper, kontraktsområde og NVDB-tilstandsregistreringer, som hentes via relasjoner (f.eks. «Tilstandsgrad, rekkverk»). Linjeobjekter med målte høyder, som stikkrenner, får lengdeprofil mot terrenget. Objektpanelet viser hvilke NVDB-objekter som ligger innen 25 m. NVDB-objekter kan inspiseres med samme skjema, sjekkliste og konsekvensgrad som modellobjektene. Inspeksjonen lagres med `objekt_globalid = "nvdb:<type>:<id>"`. Objektene vises også i 3D med målte høyder. ÅDT (type 540) brukes til tiltakstid. Se `docs/research/nvdb.json`.

**Geodata Online.** I tillegg til bakgrunnskart finnes 12 temalag: drenering, flom- og skredaktsomhet, løsmasser og grunnundersøkelser, eiendom, regulering, naturvern, kulturminner, støy, høydekurver, helning og trafikkulykker. Klikk i kartet gir temainformasjon (identify). Historiske flyfoto fra 1958–2024 kan velges per årgang, og terrengprofil kommer fra GDO-terrengmodellen. Tjenestene er kartlagt i `docs/research/gdo-tjenester.json`.

**SVV-håndbøker.** `src/handbok/handboker.json` er en kopi av `docs/research/handboker.json`. Den inneholder krav fra R610:2025, N200:2024, N101, V441 og V124, og hvert punkt har kilde og kravnummer. Appen bruker bare punkter merket «verifisert»:

- Objektpanelet viser driftskrav: inspeksjonsintervall (f.eks. stikkrenne hvert 5. år og rekkverk hver 12. måned), neste frist og status, sjekkpunkter, typiske avvik og tiltak.
- Inspeksjonsskjemaet har en sjekkliste per objekttype og konsekvensgrad (KG 0–3). Tiltakstiden følger R610 tabell 1.3—1, valgt ut fra ÅDT fra NVDB.
- Oversikten viser inspeksjonsfrist per fag og en inspeksjonsplan der du kan opprette oppgave.
- Tilstandsgrad (TG 0–3) bygger på NS 3424, som ikke er lest. TG-betegnelsene i appen er derfor ikke endret.

**Lengdeprofil (R700).** Linjeobjekter har en «Profil»-fane som følger R700-konvensjonene: objektet er heltrukket, terrenget stiplet, referanselinjen har kote, overhøyningen er oppgitt, og rubrikken har profilnummer, profilhøyde, terrenghøyde og overdekning.

## Arkitektur

```
src/
  main.ts, app.ts           oppstart, ruting og skall (Lit, lys DOM)
  config.ts                 env, Geodata Online-URL-er, feltmapping, TODO-er
  auth/auth.ts              OAuth 2.0 redirect, mock-bypass
  data/                     schema, DataService (Mock + Portal), spørringer
  filters/                  mmi.ts, filters.ts, counts.ts (ren logikk)
  map/                      oppsett 2D, objektlag (FeatureFilter, renderere), bakgrunn, søk,
                            NVDB-vegnett og -vegobjekter, GDO-temalag og flyfoto
  nvdb/                     NVDB API Les: typer, WKT, paginering, tilstand, ÅDT
  handbok/                  driftskrav fra SVV-håndbøker (R610 m.fl.) med kilder
  reports/                  statistikk og lengdeprofil (ren logikk)
  views/                    2D-kart, 3D-scene, oppgaver, innlogging, diagnose
  ui/                       toppstripe, filterlinje, MMI-boks, lagpanel, objektpanel …
  field/                    geofence.ts, prefill.ts, gps, frakoblet kø, synk, felt-UI
  tasks/                    oppgavelogikk
  styles/                   SVV-tokens (R902) mappet til Calcite, komponentstiler
```

Valg og begrunnelser:

- **Lit + webkomponenter i lys DOM.** Calcite 5 er bygget på Lit, så avhengigheten er allerede med. Lys DOM gjør at ArcGIS-komponentene og de globale stilene virker uten shadow-root-problemer.
- **MMI-filteret** bruker `FeatureFilter` på layer views (ingen ny datahenting). Fag-, MMI-, inspeksjons-, lag- og ekstrafilter kombineres til ett `where`-uttrykk (`buildWhere`). «X av N» telles med `queryFeatureCount` på layer views.
- **Geofence:** posisjoner dårligere enn terskelen forkastes. Spørringer kjøres med «debounce med maks ventetid» på 2 s, fordi en ren debounce aldri slår til mens GPS-en leverer en posisjon i sekundet. Treffene sorteres på faktisk avstand med *geometry operators* (`distanceOperator`), som erstatter det utfasede `geometryEngine` i SDK 5.x.
- **3D som lokal scene i UTM33:** samme koordinatsystem og Geodata Online-cache som 2D, ingen omprojisering av IFC/i3s-modeller, ekte meter og NN2000-høyder, og klipping av prosjektområdet. Ulempen er at Esris globale terreng ikke kan brukes, så høydemodellen kommer fra Geodata Online (UTM33).
- **Frakoblet:** inspeksjoner og bilder (Blob) legges i IndexedDB-kø (`idb`) og synkroniseres automatisk ved tilkobling. Rekkefølgen bevares, og synkroniseringen stopper ved første feil.
- **PWA:** app-skallet ligger i precache. ArcGIS- og Calcite-ressursene serveres fra eget bygg (`/arcgis`, `/calcite`) og bufres ved første bruk. NVDB-svar bufres med NetworkFirst.

## Universell utforming

- Kontrast ≥ 4,5:1. Oransje (#ff9600) brukes bare som aksent: streker, trekanter og markering. Der designet hadde oransje flate bak tekst (aktiv fane i bunnmenyen, valgt tilstandsgrad, aktive filterknapper, tellere), brukes mørk flate eller `orange-bg` med oransje strek.
- Ekte `button`, `a`, `input` og `select`, `aria-label` på ikonknapper, tastaturnavigasjon i søk og faner, og live-regioner for tellere og meldinger.
- Trykkflater ≥ 44 px på berøringsskjerm.
- `tests/e2e/a11y.spec.ts` kjører axe (WCAG 2.1 A/AA) på hovedskjermene og sjekker trykkflatene i felt.

## Dette må hentes fra SVV / Geodata

- [ ] App-ID fra app-registreringen, og redirect-URI-er for produksjon
- [ ] Webscene-ID (3D)
- [ ] Lagene i webkartet `97e21f38…`: hvilke lag som er VA, Elektro og Veg, inspeksjonstabellen, oppgavelaget og dokumenttabellen, med **ekte feltnavn** (bruk `?diagnose=1`)
- [ ] Relasjonsnøkkel mellom objekt og inspeksjon/dokument (her antatt `objekt_globalid`)
- [ ] i3s-scenelag for fagmodellene, og koordinatsystemet deres
- [ ] Portalgruppe med Geodata Online-bakgrunnskart, samt element-URL-er for høydemodell og adressesøk med lagrede legitimasjoner
- [ ] Utskriftstjeneste (`VITE_PRINT_URL`)
- [ ] Navn på `X-Client` mot NVDB API Les
- [ ] Team/grupper for «Teamet» i oppgaver
- [ ] Logo og app-ikon (plassholdere i `public/`), og LFT Etica-webfont (lisens)
- [ ] Bekreft hva «Landskap» skal være hos Geodata Online
- [ ] Avklar om inspeksjoner av NVDB-objekter (`objekt_globalid` = `nvdb:<type>:<id>`) skal ligge i samme inspeksjonstabell, og om de også skal registreres i NVDB (skriving krever NVDB API Skriv og tilgang).
- [ ] Felt for `konsekvensgrad` og `sjekkliste` i inspeksjonstabellen. Appen sender dem bare hvis tabellen har feltene.
- [ ] Bekreft TG-definisjonene mot NS 3424:2012 (ikke lest), og om R610-intervallene skal gjelde også for fylkesveger
- [ ] Offisielle navn på hvert MMI-nivå. Merket viser foreløpig fasenavn («MMI 400 · Utførelse»), fordi mmi-veilederen.no ikke var tilgjengelig ved utvikling.
