# Ajax Træningsplanlægger v2 — CLAUDE.md

App til planlægning af håndboldtræninger for Ajax håndbold — multiple hold, rollebaseret adgang, AI-forslag.

**Live URL:** https://ajax-traening.pages.dev
**GitHub:** https://github.com/claustakman/ajax-training-v2

---

## Hvad er bygget (Sessions 1–9)

### Session 1 — Fundament
- Cloudflare Worker + D1 + R2 opsætning
- JWT-baseret auth (login, invite-flow, accept-invite)
- Træningsliste (`Trainings.tsx`), TrainingEditor med auto-gem, SectionList med øvelsespicker
- Øvelseskatalog (`Catalog.tsx`) med billede-upload til R2
- Grundlæggende rollemodel (guest/trainer/team_manager/admin)

### Session 2 — Årshjul, board, brugere
- `Aarshjul.tsx` med 6 kvartaler og debounce-gem (Q1–Q6 inkl. Overgangsperiode)
- `Board.tsx` — stub (placeholder, ikke fuldt implementeret)
- `Brugere.tsx` — invitér, rolleskift, fjern fra hold, nulstil adgangskode (regenerate invite)
- `Admin.tsx` — Hold-tab + Brugere-tab med seneste aktivitet og inline navn-redigering
- `Profile.tsx` — vis profil, skift password

### Session 3 — Holdsport-integration
- `HoldsportImportModal.tsx` — vælg hold → vælg aktivitet → importer
- `TeamSettings.tsx` — Holdsport-konfiguration (workerUrl + token med show/hide)
- `api.ts` — hjælpere: `fetchHoldsportConfig`, `fetchHoldsportTeams`, `fetchHoldsportActivitiesForTeam`, `fetchHoldsportActivity`
- Arkiv (`Archive.tsx`) — desktop tabel + mobil kortliste, filtre, kopi/genskab/slet

### Session 4 — Skabeloner
- `templates`-tabel i D1 + worker-route `/api/templates`
- `SaveTemplateModal.tsx` — gem fuld træning eller enkelt sektion med preview
- `LoadTemplateModal` + `LoadSectionTemplateModal` inde i `SectionList.tsx`
- `TeamSettings.tsx` — `SkabelonerSection` med to subtabs (Fulde træninger / Sektioner), gruppering per sektionstype, slet med toast

### Session 5 — Sektionstyper + finpudsning
- `TeamSettings.tsx` — Sektionstyper: opret, rediger, drag-to-reorder, slet
- AI-sektion i TeamSettings: ghostet felt (BETA-note)
- Menurækkefølge: Skabeloner → Sektionstyper → Holdsport → AI
- `Layout.tsx` — Profil rykket til bunden af hamburger-menuen

### Session 5a — AI worker (`/api/ai/suggest`)
- **`worker/src/routes/ai.ts`** — fuldt refaktoreret AI-route
  - `getSectionTypes(teamId, db)` — henter holdets sektionstyper med parsede tags
  - `addRequiredSections(sections, sectionTypes)` — unshift manglende required-typer (15 min default)
  - `getExercisesForSection(tags, teamId, db)` — henter øvelser med tag-intersection filter
  - `markRecentExercises(exercises, teamId, db)` — markerer `recent: true` for øvelser brugt i seneste 3 træninger
  - `buildSecCatalogs(sections, sectionTypes, teamId, db)` — bygger katalog per sektion, springer ukendte typer over
  - `buildPrompt(secCatalogs, themes, vary, ageGroup)` — nummererede sektioner, holdets aldersgruppe, variationsregel
  - `callAnthropic(prompt, apiKey)` — 30s `AbortController`, kaster dansk timeout-besked ved 504
  - `parseAIResponse(text, secCatalogs)` — position-baseret matching (AI's `type`-felt ignoreres)
  - `validateAISections(sections, db)` — `IN (?,...)` DB-query, filtrerer ukendte øvelses-ID'er fra
  - Route-handler: henter `age_group` fra `teams`-tabellen, `vary: true` default, apiKey-guard → 500, timeout → 504
- **To tilstande:** simpel prompt-proxy (`{ prompt }`) bruges fra Catalog.tsx; section-baseret (`{ team_id, sections[], themes[], vary }`) bruges fra TrainingEditor
- **Gotcha:** AI returnerer konsekvent forkert `type`-felt — løst med nummererede sektioner og position-matching

### Session 5b — AI-forslag frontend
- **`frontend/src/lib/api.ts`** — tilføjet `AISuggestRequest`, `AISuggestResultSection` typer og `api.suggestTraining()`
- **`frontend/src/components/AISuggestModal.tsx`** — modal til hele træningen
  - 4 steps: `configure` → `loading` → `result` → `error`
  - Configure: sektion-builder med rækker (type + minutter), required-sektioner låst med 🔒, variation-toggle
  - Loading: ✨ pulse-animation, "Dette tager typisk 5–15 sekunder"
  - Result: øvelsesliste per sektion via `ExerciseResultRow`, total-minutter summary med `durMin()`
  - "✨ Nyt forslag" → nyt API-kald; "← Tilpas" → tilbage til configure med samme rækker
  - `onAccept`: bygger `Section[]` med `crypto.randomUUID()` som id
- **`frontend/src/components/AISectionModal.tsx`** — modal til enkelt sektion
  - Steps: `loading` → `result` → `error` (ingen configure — kalder AI straks)
  - `fetchSuggestion` i `useCallback` + `useEffect([])`
  - Header farvet med sektionstype-farve
- **`frontend/src/components/ExerciseResultRow.tsx`** — delt komponent til øvelses-visning i begge AI-modaler
  - `useQuery(['exercises', teamId])` med `staleTime: 5min` — viser navn eller exerciseId som fallback
- **`frontend/src/index.css`** — tilføjet `@keyframes pulse` til AI loading-animation
- **`frontend/src/pages/TrainingEditor.tsx`** — ✨-knapper aktiveret
  - `showAISuggest` state → `AISuggestModal`; `aiSectionIndex` state → `AISectionModal`
  - `onAccept` callbacks: opdaterer `training.sections`, kalder `scheduleSave()`, viser mini-toast
  - `sectionTypes` hentes ét sted via `useQuery(['section-types', currentTeamId])` og sendes som prop til alle komponenter
- **`frontend/src/components/SectionList.tsx`** — intern `fetchSectionTypes` fjernet
  - `sectionTypes` modtages nu som prop (default `[]`) fra TrainingEditor — ingen dobbelt-fetch

### Session 6 — Finpudsning og UI-polish
- Shimmer-skeleton loading states i alle listings (Trainings, Archive, Catalog)
- Global `.skeleton` CSS-klasse + `@keyframes skeleton-shimmer` i `index.css`
- `frontend/src/components/ui/Skeleton.tsx` — genbrugelig komponent
- Toast-dækning komplet: "Skabelon gemt ✓" i TrainingEditor, "Afkrydsninger nulstillet ✓" i SectionList
- Alle modaler konverteret til `.modal-overlay` + `.modal-sheet` pattern (bottom sheet på ≤640px)
- Tomme states opgraderet (🔍 icon + title + kontekstuel hjælpetekst) i Catalog og ExercisePicker

### Session 8 — Bugfixes + UX-forbedringer

#### Auth
- **`worker/src/routes/auth.ts`** — `regenerate-invite` kræver nu kun `requireAuth()` (ikke admin): `team_manager` kan nulstille adgangskode for brugere på eget hold ved at sende `team_id` med
- **`frontend/src/pages/Brugere.tsx`** — sender `team_id` med i `regenerate-invite`-kald

#### Øvelses-tags — `TagInput`-komponent
- **`frontend/src/components/ui/TagInput.tsx`** — ny genbrugelig pill-baseret tag-input med autocomplete
  - Dropdown filtrerer eksisterende tags fra API mens man skriver
  - Enter/Tab tilføjer nyt tag; klik på pill fjerner det
  - `allTags` populeres fra `/api/exercises/tags` — ingen hardcoded fallback (undgår duplikater som `aflevering`/`afleveringer`)
- **`Catalog.tsx` `ExerciseEditor`** — bruger `TagInput` i stedet for komma-tekstfelt; `allTags` starter tom og populeres fra API
- **`SectionList.tsx` `SaveToCatalogModal`** — bruger `TagInput`

#### Redigér øvelse fra træning
- **`SectionList.tsx` `ExerciseDetailModal`** — tilføjet `canEdit` + `onUpdated` props
  - Viser "✏️ Rediger"-knap for trainer+
  - Klik swapper til `ExerciseEditor` inline i samme modal
  - Gem opdaterer øvelsen i lokal `exercises`-state i `SectionList` uden reload
- **`SectionBlock`** — ny `onExerciseUpdated` prop bobler opdateret øvelse op til `SectionList`
- **`SectionList`** — `onExerciseUpdated`: `setExercises(prev => prev.map(e => e.id === updated.id ? updated : e))`

#### Gem til katalog — UUID-bug
- **`SectionList.tsx` `SaveToCatalogModal`** — `onSave` returnerer nu `(id, name, catalog, tags)` i stedet for kun `id`
- **`ExerciseRow`** — ny `onNewExercise` prop; efter gem tilføjes øvelsen straks til lokal `exercises`-state så navn vises korrekt (ikke UUID som fallback)

#### Katalog-filter
- Keeper-øvelse med *kun* `keeper`-tag vises eksklusivt under Keeper-tab
- Keeper-øvelse med *andre tags i tillæg* vises nu også under Hal-tab

#### Holdsport-datofilter
- **`HoldsportImportModal.tsx`** — aktiviteter filtreres i frontend på `starttime >= from && starttime <= to` (Holdsport-API ignorerede `to`-parameteren)
- `useEffect` dependency: `[step]` → `[step, from, to]` så perioden er frisk ved skift
- Preselect bruger `inRange` (ikke `all`) så "Importer N valgte" tæller korrekt

### Session 9 — Holdsport-spillertælling + UI-forbedringer

#### Holdsport antal spillere — præcis optælling
- **`api.ts` `fetchHoldsportActivity`** — forsøger nu detalje-endpoint `/teams/:id/activities/:activityId` først (returnerer `activities_users`); fallback til liste-endpoint
- **`HoldsportImportModal.tsx`** — `handleImport` er nu async; henter detaljer per valgt aktivitet før import så `activities_users` er tilgængeligt
- **`extractFromActivity`** — tæller kun `status_code === 1`; matcher navn mod app-trænere, resten er spillere
- **`TrainingEditor.tsx` ↺ Opdater** — samme logik: `activities_users` giver præcis tal; fallback til `attendance_count` som-er
- `hsConfig` gemmes i state under aktivitetshentning så import-funktionen kan bruge det

#### Træningskort (`Trainings.tsx`)
- **Antal spillere** — grå cirkel med tal, tooltip "X spillere" (vises kun hvis sat)
- **Antal trænere** — rød (accent) cirkel med tal, tooltip med trænernes navne (vises kun hvis > 0)
- **HS-badge** — tydeligere lille badge med kant i stedet for løs tekst; sidder ved siden af cirklerne
- Cirklerne og HS-badge grupperet i `display: flex` på samme linje

#### Brugere (`Brugere.tsx`)
- Inline navn-redigering: ✏️-knap ved navn → inputfelt → Enter/✓ gemmer, Escape/✗ annullerer
- Kalder `PATCH /api/users/:id` med `{ name }` — opdaterer lokal state straks

### Session 7 — Opslagstavle (Board)
- **D1 migration 0011_board.sql** — `board_attachments` og `board_reads` tabeller, nye kolonner på `board_posts`/`board_comments` (`deleted`, `pinned_by`, `deleted_at`)
- **`worker/src/routes/board.ts`** — fuld CRUD: opslag, kommentarer, vedhæftninger, pin/arkiv, soft delete, unread-badge
  - Rollemodel: alle roller kan oprette/redigere eget/kommentere; kun `team_manager+` kan slette andres, pin, arkivér
  - `toPost()` stripper interne felter (`attachments_json`, `deleted_at`) fra API-respons
  - R2-upload: billeder max 10MB, dokumenter max 20MB; URL: `https://pub-ajax-traening-storage.r2.dev/board/...`
- **`frontend/src/pages/Board.tsx`** — fuldt implementeret (erstatter placeholder)
  - Shimmer-skeleton (3 kort), tom state (aktiv/arkiv/søgning), søgebar
  - Arkiv-filter — kun vist for `team_manager+`
  - `PostCard` med overflow ⋯-menu, pin-banner (gul), body-expand >200 tegn, vedhæftnings-pills
  - `CommentForm` — Enter sender, Shift+Enter = ny linje
  - Invaliderer `['board-unread', teamId]` efter nyt opslag
  - Bruger `NewPostModal` til oprettelse (med @-mentions + filer)
- **`frontend/src/components/NewPostModal.tsx`** — nyt opslag
  - @-autocomplete dropdown (`/@(\w*)$/` regex) med `@alle`-option
  - `visualViewport`-fix: modal løfter sig over iOS-tastatur, forsinket focus (300ms)
  - Filvedhæftning: pending-queue med preview-pills (billeder + dokumenter), sekventiel upload
  - `fontSize: 16` på alle inputs (iOS zoom-fix)
- **`frontend/src/components/BoardPostCard.tsx`** — opslags-komponent
  - `renderBody()` — @-mentions highlightes (rød = eget navn, grå = andre)
  - `Avatar` — initialer i accent-farvet cirkel
  - `AttachmentList` — billeder som klikkbare thumbnails, dokumenter som download-links
  - `CommentRow` + `CommentInput` — inline redigering, auto-resize textarea
  - Mobil: ⋯ overflow-menu i stedet for individuelle handlingsknapper
  - Desktop: individuelle `ActionBtn`-knapper (✎ rediger, 📌 pin, 📦 arkivér, 🗑 slet)
- **`frontend/src/components/Layout.tsx`** — opdateringer
  - Ulæst-badge (rød prik) ved Tavle i bundnav og desktop-nav
  - `refetchInterval: 60_000` på unread-query
  - Desktop nav: **Træning | Katalog | Tavle | Årshjul** (Tavle rykket frem, Årshjul sidst)
  - Mobil bundnav: **Træning | Katalog | Tavle | ☰** (uændret)

---

## Stack

| Lag       | Teknologi                        | Noter                              |
|-----------|----------------------------------|------------------------------------|
| Frontend  | React + Vite → Cloudflare Pages  | Inline CSS-variabler, ingen Tailwind |
| API       | Cloudflare Workers (TypeScript)  | Hono router, REST, JWT-auth        |
| Database  | Cloudflare D1 (SQLite)           | Relationsmodel, versionstyrede migrationer |
| Storage   | Cloudflare R2                    | Øvelsesbilleder                    |
| Email     | Resend                           | Invitationsmail (ikke implementeret — bruges ikke) |
| CI/CD     | GitHub Actions                   | Auto-deploy + DB-migration ved push|

---

## Mappestruktur

```
ajax-traening-v2/
├── database/
│   ├── schema.sql              # D1 skema — alle tabeller + seed
│   └── migrations/             # Versionstyrede migrationer (0001_initial.sql osv.)
├── worker/
│   ├── src/
│   │   ├── index.ts            # Hono router — registrerer alle routes
│   │   ├── lib/
│   │   │   ├── auth.ts         # JWT sign/verify (HS256), bcrypt password, newId()
│   │   │   ├── middleware.ts   # requireAuth(minRole?) — hold-rolle-opslag fra D1
│   │   │   └── r2.ts           # R2 upload/delete helpers
│   │   └── routes/
│   │       ├── auth.ts         # login, /me, /invite, /accept-invite, /invite-info/:token, /regenerate-invite, /reset-password
│   │       ├── teams.ts        # CRUD holds
│   │       ├── users.ts        # CRUD brugere, roller, holdtildeling, team-members
│   │       ├── trainings.ts    # CRUD træninger (team-scoped)
│   │       ├── exercises.ts    # CRUD øvelseskatalog + R2-billeder
│   │       ├── quarters.ts     # CRUD årshjul (team-scoped)
│   │       ├── section_types.ts # CRUD sektionstyper (global eller team-scoped)
│   │       ├── board.ts        # Opslagstavle: opslag, kommentarer, vedhæftninger, pin/arkiv, unread
│   │       ├── holdsport.ts    # GET /api/holdsport/config — returnerer workerUrl + token
│   │       ├── ai.ts           # POST /api/ai/suggest — proxy til Anthropic
│   │       └── templates.ts    # CRUD skabeloner (type='training' | 'section')
│   └── wrangler.toml
├── frontend/
│   ├── public/
│   │   ├── manifest.json       # PWA manifest
│   │   └── icon-192.png        # App-ikon
│   ├── src/
│   │   ├── App.tsx             # BrowserRouter + routes + RequireAuth guard
│   │   ├── main.tsx            # React root mount
│   │   ├── index.css           # CSS-variabler, skeleton-shimmer, modal-overlay/modal-sheet
│   │   ├── lib/
│   │   │   ├── api.ts          # API-klient — BASE_URL fra VITE_API_URL, alle fetch-helpers
│   │   │   ├── auth.tsx        # AuthContext, useAuth(), hasRole(), ROLE_LABELS
│   │   │   ├── types.ts        # Delte TypeScript-typer: Training, Section, SectionExercise, Template, Exercise, SectionType, BoardPost, BoardComment, BoardAttachment, HoldsportActivity
│   │   │   └── dateUtils.ts    # fmtDay, fmtMon, fmtWday, fmtWdayFull, fmtDateLong, durMin, totalMins
│   │   ├── components/
│   │   │   ├── Layout.tsx           # Nav shell: topbar + bundnav + hamburger-menu + hold-switcher
│   │   │   ├── SectionList.tsx      # Sektioner + øvelser: ExercisePicker, ExerciseRow, DurationBar, modaler
│   │   │   ├── SaveTemplateModal.tsx # Gem skabelon (fuld træning eller sektion)
│   │   │   ├── HoldsportImportModal.tsx # Import fra Holdsport: vælg hold → aktivitet → importer
│   │   │   ├── AISuggestModal.tsx   # AI-forslag til hele træningen (configure/loading/result/error)
│   │   │   ├── AISectionModal.tsx   # AI-forslag til enkelt sektion (loading/result/error)
│   │   │   ├── ExerciseResultRow.tsx # Delt komponent: viser øvelses-navn + minutter i AI-modaler
│   │   │   ├── BoardPostCard.tsx    # Opslags-kort: @-mentions, vedhæftninger, kommentarer, overflow-menu
│   │   │   ├── NewPostModal.tsx     # Nyt opslag: @-autocomplete, filvedhæftning, visualViewport-fix
│   │   │   └── ui/
│   │   │       ├── Skeleton.tsx     # Genbrugelig shimmer-skeleton komponent
│   │   │       └── TagInput.tsx    # Pill-baseret tag-input med autocomplete fra API
│   │   └── pages/
│   │       ├── Login.tsx            # Login-formular
│   │       ├── AcceptInvite.tsx     # /invite/:token — sæt password og log ind
│   │       ├── Trainings.tsx        # Træningsliste (/) med SkeletonCard + HoldsportImportModal
│   │       ├── TrainingEditor.tsx   # Trænings-editor (/traininger/:id) med auto-gem
│   │       ├── Archive.tsx          # Arkiv (/arkiv) — desktop tabel + mobil kortliste
│   │       ├── Aarshjul.tsx         # Årshjul (/aarshjul) — 6 kvartaler med temaer
│   │       ├── Catalog.tsx          # Øvelseskatalog (/katalog) — hal/keeper/fys tabs
│   │       ├── Board.tsx            # Opslagstavle (/tavle) — fuldt implementeret
│   │       ├── Profile.tsx          # Brugerprofil (/profil) — vis info + skift password
│   │       ├── Brugere.tsx          # Bruger-styring (/brugere) for team_manager+
│   │       ├── TeamSettings.tsx     # Holdindstillinger (/holdindstillinger) — skabeloner, sektionstyper, holdsport, AI
│   │       └── Admin.tsx            # Admin (/admin) — hold-tab + brugere-tab
│   ├── vite.config.ts
│   └── index.html
├── CLAUDE.md
└── .github/workflows/
    ├── deploy.yml              # Push til main → build frontend + deploy worker + run migrations
    └── migrate.yml             # Manuel workflow til DB-migrationer
```

---

## Design — Ajax-stil (lys tema, rød accent)

Inline CSS via React `style`-props og CSS-variabler. **Ingen Tailwind.**

### CSS-variabler (root)
```css
:root {
  --bg: #f5f5f3;
  --bg-card: #ffffff;
  --bg-input: #f0efed;

  --accent: #C8102E;        /* Ajax rød */
  --accent-hover: #a50d25;
  --accent-light: rgba(200, 16, 46, 0.08);

  --text: #1a1a1a;
  --text2: #6b6b6b;
  --text3: #a8a8a8;

  --border: rgba(0, 0, 0, 0.08);
  --border2: rgba(0, 0, 0, 0.14);

  --green: #1D9E75;
  --yellow: #d97706;
  --blue: #2563eb;
  --red: #dc2626;
  --purple: #7c3aed;

  --font-body: 'DM Sans', sans-serif;
  --font-heading: 'Barlow Condensed', sans-serif;

  --topbar-h: 56px;
  --bottomnav-h: 56px;
}
```

### Navigation
- **Topbar** (desktop): Logo + nav-tabs + hold-switcher (hvis > 1 hold) + hamburger-menu
  - Nav-tabs desktop: **Træning · Katalog · Tavle · Årshjul** (Tavle med rød ulæst-prik)
- **Bundnav** (mobil): **Træning · Katalog · Tavle · ☰ Mere** — hamburger i topbar skjult på mobil (`display: none !important`)
  - Tavle-ikonet i bundnav har rød ulæst-prik (8px cirkel med border)
- **Mere-panel rækkefølge (faktisk implementeret):** Årshjul · Arkiv · Tavle *(med ulæst-prik)* · Holdindstillinger *(team_manager+)* · Brugere *(team_manager+)* · Admin *(admin)* · **Profil** · Skift hold · Log ud
- På mobil åbner Mere-panelet **nedefra** (over bundnav, `border-radius: 16px 16px 0 0`)
- På desktop åbner det som dropdown fra topbar (højre side, `border-radius: 12px`)
- Topbar: `border-bottom: 3px solid var(--accent)`
- Aktiv tab: rød understregning (`borderBottom: '2px solid var(--accent)'`)
- Bundnav: `paddingBottom: env(safe-area-inset-bottom)` for iPhone safe area
- Hold-switcher i topbar (desktop) vises kun hvis bruger har > 1 hold — dropdown
- Ulæst-badge: `useQuery(['board-unread', teamId], ..., refetchInterval: 60_000)` — rød prik i både desktop-nav og bundnav

### Skeleton / Loading states
```css
@keyframes skeleton-shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
.skeleton {
  background: linear-gradient(90deg, var(--bg-input) 25%, var(--border) 50%, var(--bg-input) 75%);
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.5s infinite;
  border-radius: 6px;
}
```
Brug `className="skeleton"` på div/span med `width` og `height` sat via inline style.

### Modal-mønster (bottom sheet på mobil)
```css
.modal-overlay {
  display: flex; align-items: center; justify-content: center; padding: 16px;
}
@media (max-width: 640px) {
  .modal-overlay { align-items: flex-end; padding: 0; }
  .modal-sheet {
    border-radius: 16px 16px 0 0 !important;
    max-height: 92dvh !important;
    width: 100% !important; max-width: 100% !important;
  }
}
```
**Alle modaler** bruger dette mønster:
- Overlay-div: `className="modal-overlay"` + `onClick={close}` + `position: fixed; inset: 0; zIndex: ...; background: rgba(0,0,0,0.4)`
- Indre div: `className="modal-sheet"` + `onClick={e => e.stopPropagation()}` + inline max-width/border-radius for desktop
- `Toast`-komponenter placeres **uden for** overlay-div'en (ellers klikkes de væk)

### Tomme states
Opgraderede tomme states med 🔍 ikon + titel + kontekstuel hjælpetekst i:
- `Catalog.tsx` — skelner mellem "intet match med filter" og "intet i katalog"
- `SectionList.tsx` ExercisePicker — viser tip om at prøve at søge bredere

### Komponenter
- Kort: `background: var(--bg-card); border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.06)`
- Knapper: `min-height: 44px` (touch targets)
- Inputs: `font-size: 16px` (undgår iOS auto-zoom), `min-height: 44px` (eller 40px i kompakte kontekster)
- Primær knap: `background: var(--accent); color: #fff`
- Sekundær knap: `background: var(--bg-input); color: var(--text)`

---

## Roller

Roller er **hold-specifikke** — en bruger kan have forskellig rolle på forskellige hold.
Undtagelse: `admin` er global og slår altid igennem uanset aktivt hold.

| Rolle          | Rettigheder                                                                      |
|----------------|----------------------------------------------------------------------------------|
| `guest`        | View-only: kan se træninger og katalog for tildelte hold                         |
| `trainer`      | CRUD træninger og katalog. Holdsport-import. Årshjul (view). Opslagstavle.       |
| `team_manager` | Alt trainer + redigere årshjul + styre brugere for eget hold + holdindstillinger |
| `admin`        | Global rolle. CRUD hold. Se alle hold. Tildele alle roller via Admin-siden.      |

### Adgangskontrol pr. side

| Side                    | Gæst | Træner | Årgangansv. | Admin |
|-------------------------|------|--------|-------------|-------|
| Træning (view)          | ✓    | ✓      | ✓           | ✓     |
| Træning (CRUD)          | —    | ✓      | ✓           | ✓     |
| Årshjul (view)          | —    | ✓      | ✓           | ✓     |
| Årshjul (rediger)       | —    | —      | ✓           | ✓     |
| Katalog (view)          | ✓    | ✓      | ✓           | ✓     |
| Katalog (CRUD)          | —    | ✓      | ✓           | ✓     |
| Tavle                   | ✓    | ✓      | ✓           | ✓     |
| Brugere (`/brugere`)    | —    | —      | ✓           | ✓     |
| Holdindstillinger       | —    | —      | ✓           | ✓     |
| Admin (`/admin`)        | —    | —      | —           | ✓     |

### Hold-roller og auth-kontekst
- `user_teams.role`: `guest | trainer | team_manager` — hold-specifik
- `users.role`: kun til global `admin`-status (gemmes i JWT)
- `currentTeamRole` udledes i `useAuth()` fra aktivt holds `user_teams.role` (eller `'admin'` hvis global admin)
- `hasRole(user, minRole, currentTeamRole)` — tjekker ROLE_LEVEL hierarki
- `ROLE_LABELS` — dansk oversættelse af roller til visning
- En bruger oprettes **kun på ét hold** — admin kan efterfølgende tilføje dem til flere hold
- Brugere der ikke er i `user_teams` for et hold, ses **ikke** på det hold

### Auth-flow (faktisk implementeret)
- JWT i `localStorage['ajax_token']`; bruger-objekt i `localStorage['ajax_user']`; aktivt hold i `localStorage['ajax_current_team']`
- `useAuth()` returnerer `{ user, token, currentTeamId, currentTeamRole, login, loginWithToken, logout, setCurrentTeam, refreshUser }`
- `api.ts` indsætter automatisk `Authorization: Bearer <token>` på alle requests
- Invitationsflow: team_manager kalder `POST /api/auth/invite` → modtager åbner `/invite/:token` (AcceptInvite.tsx) → henter navn/email via `GET /api/auth/invite-info/:token` → sætter password via `POST /api/auth/accept-invite` → logges ind med `loginWithToken()`
- `refreshUser()` kalder `GET /api/auth/me` og opdaterer localStorage + state

---

## Datamodel (D1 SQLite)

### `teams`
```sql
CREATE TABLE teams (
  id                   TEXT PRIMARY KEY,
  name                 TEXT NOT NULL,
  age_group            TEXT NOT NULL,
  season               TEXT NOT NULL,
  holdsport_worker_url TEXT,   -- migration 0009
  holdsport_token      TEXT,   -- migration 0009
  created_at           TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### `users`
```sql
CREATE TABLE users (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  email           TEXT UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'guest',   -- global: guest | admin
  last_seen       TEXT,
  invite_token    TEXT,
  invite_expires  TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### `user_teams`
```sql
CREATE TABLE user_teams (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id    TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'trainer',   -- guest | trainer | team_manager
  PRIMARY KEY (user_id, team_id)
);
```

### `trainings`
```sql
CREATE TABLE trainings (
  id           TEXT PRIMARY KEY,
  team_id      TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  title        TEXT,
  date         TEXT,
  start_time   TEXT,
  end_time     TEXT,
  location     TEXT,
  lead_trainer TEXT,
  trainers     TEXT,          -- JSON array af navne (strings)
  themes       TEXT,          -- JSON array af temastrenge
  focus_points TEXT,
  notes        TEXT,
  participant_count INTEGER,
  sections     TEXT NOT NULL DEFAULT '[]',  -- JSON array af Section[]
  stars        INTEGER DEFAULT 0,
  archived     INTEGER DEFAULT 0,
  holdsport_id TEXT,
  created_by   TEXT REFERENCES users(id),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### `exercises`
```sql
CREATE TABLE exercises (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  description      TEXT,
  catalog          TEXT NOT NULL DEFAULT 'hal',  -- "hal" | "fys"
  category         TEXT,
  tags             TEXT NOT NULL DEFAULT '[]',
  age_groups       TEXT NOT NULL DEFAULT '[]',
  stars            INTEGER DEFAULT 0,
  variants         TEXT,
  link             TEXT,
  default_mins     INTEGER,
  image_r2_key     TEXT,
  image_url        TEXT,
  created_by       TEXT REFERENCES users(id),
  created_by_email TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### `quarters`
```sql
CREATE TABLE quarters (
  id        TEXT PRIMARY KEY,
  team_id   TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  quarter   INTEGER NOT NULL,   -- 1–6 (Q2, Q3, Q4, Q1, Overgang, Q2-næste)
  themes    TEXT NOT NULL DEFAULT '[]',
  UNIQUE(team_id, quarter)
);
```

### `section_types`
```sql
CREATE TABLE section_types (
  rowid      INTEGER PRIMARY KEY AUTOINCREMENT,
  id         TEXT NOT NULL,
  label      TEXT NOT NULL,
  color      TEXT NOT NULL,
  cls        TEXT NOT NULL,
  tags       TEXT NOT NULL DEFAULT '[]',
  themes     TEXT NOT NULL DEFAULT '[]',
  required   INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  team_id    TEXT REFERENCES teams(id) ON DELETE CASCADE  -- NULL = global default
);
-- UNIQUE INDEX: section_types_id_team ON (id, COALESCE(team_id, ''))
```

**Regler:**
- Globale defaults: `team_id = NULL` — redigeres aldrig af brugere
- Kopieres til hvert hold ved oprettelse (temaer = `[]`)
- Hold redigerer **kun** egne rækker (team_id = holdets id)

### `board_posts` + `board_comments`
```sql
CREATE TABLE board_posts (
  id TEXT PRIMARY KEY, team_id TEXT NOT NULL, user_id TEXT NOT NULL,
  title TEXT, body TEXT NOT NULL, pinned INTEGER DEFAULT 0,
  archived INTEGER DEFAULT 0, created_at TEXT NOT NULL, edited_at TEXT
);
CREATE TABLE board_comments (
  id TEXT PRIMARY KEY, post_id TEXT NOT NULL, user_id TEXT NOT NULL,
  body TEXT NOT NULL, created_at TEXT NOT NULL, edited_at TEXT,
  deleted INTEGER NOT NULL DEFAULT 0, deleted_at TEXT
);
-- Tilføjet via migration 0011_board.sql:
CREATE TABLE board_attachments (
  id TEXT PRIMARY KEY, post_id TEXT NOT NULL REFERENCES board_posts(id) ON DELETE CASCADE,
  type TEXT NOT NULL,  -- 'image' | 'document'
  filename TEXT NOT NULL, r2_key TEXT NOT NULL, url TEXT NOT NULL,
  size_bytes INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE board_reads (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  last_read_at TEXT NOT NULL
);
```
`board_posts` har også `pinned_by TEXT`, `deleted INTEGER DEFAULT 0`, `deleted_at TEXT` (tilføjet via migration 0011).
Soft delete: `deleted = 1, deleted_at = datetime('now')` — rækker slettes aldrig fysisk.
R2-nøgle for vedhæftninger: `board/{postId}/{uuid}.{ext}`

### `templates`
```sql
CREATE TABLE templates (
  id           TEXT PRIMARY KEY,
  team_id      TEXT,
  name         TEXT NOT NULL,
  type         TEXT NOT NULL DEFAULT 'training',  -- 'training' | 'section'
  section_type TEXT,                               -- sektionstype-id hvis type='section'
  themes       TEXT NOT NULL DEFAULT '[]',         -- JSON array
  description  TEXT,
  sections     TEXT NOT NULL DEFAULT '[]',         -- JSON array af Section[]
  created_by   TEXT,
  created_at   TEXT NOT NULL
);
```

---

## Worker API — Routes

### Auth (`/api/auth`)
| Method | Path                           | Rolle        | Beskrivelse                                         |
|--------|--------------------------------|--------------|-----------------------------------------------------|
| POST   | `/api/auth/login`              | —            | `{email, password}` → JWT + teams med hold-roller   |
| GET    | `/api/auth/me`                 | auth         | Aktuel bruger + hold. Opdaterer `last_seen`.        |
| POST   | `/api/auth/invite`             | team_manager | Opret invite til nyt hold-medlem                    |
| GET    | `/api/auth/invite-info/:token` | —            | Hent navn + email fra invite-token (til AcceptInvite)|
| POST   | `/api/auth/accept-invite`      | —            | Acceptér invitation, sæt password → JWT             |
| POST   | `/api/auth/regenerate-invite`  | auth         | Ny invite-token til eksisterende bruger. `team_manager` skal sende `team_id` og skal være manager på holdet. Admin: ingen `team_id` nødvendig. |
| POST   | `/api/auth/reset-password`     | auth         | Skift password (`{current_password, new_password}`) |

### Teams (`/api/teams`)
| Method | Path             | Rolle        | Beskrivelse                                             |
|--------|------------------|--------------|---------------------------------------------------------|
| GET    | `/api/teams`     | auth         | Admin: alle hold. Øvrige: egne hold.                    |
| POST   | `/api/teams`     | admin        | Opret hold — kopierer globale sektionstyper til holdet  |
| PATCH  | `/api/teams/:id` | team_manager | Opdater hold (inkl. holdsport_worker_url, holdsport_token) |
| DELETE | `/api/teams/:id` | admin        | Slet hold + al tilknyttet data                          |

### Users (`/api/users`)
| Method | Path                        | Rolle        | Beskrivelse                                                                     |
|--------|-----------------------------|--------------|---------------------------------------------------------------------------------|
| GET    | `/api/users`                | team_manager | `?team_id=X` — brugere på holdet. Admin uden `?team_id`: alle brugere.         |
| GET    | `/api/users/team-members`   | auth         | `?team_id=X` — navne + team_role til ansvarlig/træner-dropdown                 |
| GET    | `/api/users/:id`            | auth         | Sig selv eller admin                                                            |
| PATCH  | `/api/users/:id`            | admin        | Global rolle eller navn                                                         |
| DELETE | `/api/users/:id`            | admin        | Slet bruger                                                                     |
| POST   | `/api/users/:id/teams`      | team_manager | Tilføj eksisterende bruger til hold med rolle                                   |
| PATCH  | `/api/users/:id/teams/:tid` | team_manager | Opdater hold-rolle (team_manager maks team_manager, admin kan alt)              |
| DELETE | `/api/users/:id/teams/:tid` | team_manager | Fjern bruger fra hold                                                           |

### Trainings (`/api/trainings`)
| Method | Path                 | Rolle   | Beskrivelse                               |
|--------|----------------------|---------|-------------------------------------------|
| GET    | `/api/trainings`     | auth    | `?team_id=X&archived=0` — list træninger  |
| POST   | `/api/trainings`     | trainer | Opret træning                             |
| GET    | `/api/trainings/:id` | auth    | Hent enkelt træning                       |
| PATCH  | `/api/trainings/:id` | trainer | Opdater træning (auto-gem). Opdaterer `last_seen`. |
| DELETE | `/api/trainings/:id` | trainer | Slet træning                              |

### Exercises (`/api/exercises`)
| Method | Path                       | Rolle   | Beskrivelse                                  |
|--------|----------------------------|---------|----------------------------------------------|
| GET    | `/api/exercises`           | auth    | `?catalog=hal&age_group=U11`                 |
| GET    | `/api/exercises/tags`      | auth    | Alle unikke tags (globalt)                   |
| POST   | `/api/exercises`           | trainer | Opret øvelse                                 |
| PATCH  | `/api/exercises/:id`       | trainer | Opdater øvelse (kun opretter eller admin)    |
| DELETE | `/api/exercises/:id`       | trainer | Slet øvelse                                  |
| POST   | `/api/exercises/:id/image` | trainer | Upload billede → R2 (multipart/form-data)    |
| DELETE | `/api/exercises/:id/image` | trainer | Slet billede fra R2                          |

### Quarters (`/api/quarters`)
| Method | Path                | Rolle        | Beskrivelse                    |
|--------|---------------------|--------------|--------------------------------|
| GET    | `/api/quarters`     | auth         | `?team_id=X` — 6 kvartaler    |
| PUT    | `/api/quarters/:id` | team_manager | Opdater kvartal-temaer         |

### Section Types (`/api/section-types`)
| Method | Path                         | Rolle        | Beskrivelse                    |
|--------|------------------------------|--------------|--------------------------------|
| GET    | `/api/section-types`         | auth         | `?team_id=X` — holdets typer  |
| POST   | `/api/section-types`         | team_manager | Opret ny type                  |
| PATCH  | `/api/section-types/:id`     | team_manager | Opdater (label, farve, tags, temaer, required) |
| DELETE | `/api/section-types/:id`     | team_manager | Slet                           |
| PUT    | `/api/section-types/reorder` | team_manager | Gem ny rækkefølge              |

### Board (`/api/board`)
| Method | Path                                    | Rolle        | Beskrivelse                                              |
|--------|-----------------------------------------|--------------|----------------------------------------------------------|
| GET    | `/api/board`                            | auth         | `?team_id=X&archived=0/1` — opslag med kommentarer + vedhæftninger. Opdaterer `board_reads`. |
| GET    | `/api/board/unread`                     | auth         | `?team_id=X` → `{ unread: bool }` — sammenligner MAX(created_at) vs last_read_at |
| POST   | `/api/board`                            | auth         | Opret opslag (`team_id`, `title?`, `body`)               |
| PATCH  | `/api/board/:id`                        | auth         | Rediger eget opslag (kun ejer eller global admin)        |
| DELETE | `/api/board/:id`                        | auth         | Soft delete eget opslag (ejer) eller andres (team_manager+) |
| POST   | `/api/board/:id/pin`                    | team_manager | Toggle pin — sætter `pinned_by`                          |
| POST   | `/api/board/:id/archive`                | team_manager | Toggle arkivering                                        |
| POST   | `/api/board/:id/comments`               | auth         | Tilføj kommentar                                         |
| PATCH  | `/api/board/:id/comments/:commentId`    | auth         | Rediger kommentar (ejer eller team_manager+)             |
| DELETE | `/api/board/:id/comments/:commentId`    | auth         | Soft delete kommentar (ejer eller team_manager+)         |
| POST   | `/api/board/:id/attachments`            | auth         | Upload vedhæftning til R2 (billeder max 10MB, docs max 20MB) |
| DELETE | `/api/board/:id/attachments/:attachId`  | auth         | Slet vedhæftning fra R2 + DB (ejer eller team_manager+)  |

### Holdsport (`/api/holdsport`)
| Method | Path                    | Rolle   | Beskrivelse                                       |
|--------|-------------------------|---------|---------------------------------------------------|
| GET    | `/api/holdsport/config` | trainer | `?team_id=X` → `{ workerUrl, token }` til frontend|

### AI (`/api/ai`)
| Method | Path              | Rolle   | Beskrivelse                                              |
|--------|-------------------|---------|----------------------------------------------------------|
| POST   | `/api/ai/suggest` | trainer | To tilstande: simpel prompt-proxy eller section-baseret  |

### Templates (`/api/templates`)
| Method | Path               | Rolle   | Beskrivelse                                                      |
|--------|--------------------|---------|------------------------------------------------------------------|
| GET    | `/api/templates`   | auth    | `?team_id=X[&type=training|section][&section_type=opvarmning]`   |
| POST   | `/api/templates`   | trainer | Opret skabelon                                                   |
| DELETE | `/api/templates/:id` | trainer | Slet skabelon                                                  |

---

## Frontend-sider

### `Login.tsx` (`/login`)
- Email + password formular
- Redirect til `/` ved login — redirect til `/login` hvis ikke logget ind

### `AcceptInvite.tsx` (`/invite/:token`)
- Henter navn + email fra token via `GET /api/auth/invite-info/:token`
- Viser fejl ved ugyldigt/udløbet token
- Formular: navn (pre-udfyldt, readonly), email (pre-udfyldt), password + bekræft
- `POST /api/auth/accept-invite` → `loginWithToken()` → navigate til `/`

### `Trainings.tsx` (`/`)
- Liste over kommende (ikke-arkiverede) træninger for `currentTeamId`
- `SkeletonCard` med shimmer loading (3 kort) mens data hentes
- Dato-boks (`DateBox`): dag/måned/ugedag med rød accent
- Trænings-kort: tid, varighed, sted, ansvarlig, tema-pills, sektioner-count
  - Højre side: grå cirkel = antal spillere (tooltip), rød cirkel = antal trænere (tooltip med navne), HS-badge
- "Ny træning"-knap (trainer+) → POST → navigate til editor
- `HoldsportImportModal` til at importere træninger fra Holdsport
- Tom state: opfordring til at oprette første træning
- Toast ved fejl (rød, 3s)

### `TrainingEditor.tsx` (`/traininger/:id`)
- Auto-gem med debounce 1200ms — `SaveIndicator` viser Gemmer…/✓ Gemt/✗ Fejl
- Collapsible header-kort med ▾/▴ toggle:
  - Dato, start/slut-tid, sted, antal spillere (+↺ Opdater-knap ved holdsport_id)
  - Ansvarlig (`UserSelect` — dropdown), Trænere (`UserMultiSelect` — chips + dropdown)
  - Temaer (fra årshjulet — dropdown + Chip-komponenter)
  - Fokuspunkter, noter (textarea), stjerne-vurdering (1–5 klik)
- Toolbar: ← Tilbage · `SaveIndicator` · 💾 Skabelon · 📦 Arkivér · 🗑 Slet
  - "💾 Skabelon" åbner `SaveTemplateModal` — kun på gemte træninger med sektioner
  - Mini-toast: "Skabelon gemt ✓" / "Træning opdateret med AI-forslag ✓" / "Øvelser opdateret med AI-forslag ✓" — grøn, 2.8s, fixed bottom 90px
- Holdsport-knap (kun trainer+): åbner `HoldsportImportModal`
- ↺ Opdater ved `holdsport_id`: henter ny `participant_count` + `trainers` fra Holdsport
- `SectionList`-komponent for sektioner og øvelser
- `AISuggestModal` (hele træningen) — åbnes ved "✨ Hele træning"-knap
- `AISectionModal` (per sektion) — åbnes ved ✨-knap på enkelt sektion
- `sectionTypes` hentes ét sted: `useQuery(['section-types', currentTeamId])` — sendes som prop til `SectionList`, `AISuggestModal`, `AISectionModal`
- Navigerer til `/traininger/ny` → opretter tom træning → redirect til `/traininger/:id`

### `SaveTemplateModal.tsx` (komponent)
- Åbnes fra TrainingEditor toolbar
- Bruger `.modal-overlay` / `.modal-sheet` bottom-sheet mønster
- Tab-vælger: **Fuld træning** | **Enkelt sektion**
- **Fuld træning**: navn-input, beskrivelse, tema-pills fra årshjul, preview (sektionsliste med farvet dot)
- **Enkelt sektion**: klikbar kortliste over sektioner (farvet kant + ✓), auto-udfylder navn fra sektionstype-label + træningens første tema, beskrivelse, tema-pills, preview (øvelsesnavne, max 5 + "+ X flere")
- Gem disablet hvis navn tomt eller ingen sektion valgt (for section-tab)
- Kalder `api.createTemplate()` → `onSaved()` callback

### `SectionList.tsx` (komponent i TrainingEditor)
- Sektioner med farvet venstre-kant og collapsible body (▾/▴)
- Sektion-header: drag op/ned (▲▼ knapper), type-label (farvet), øvelse-tæller, gruppe-badge, minutter, gruppe-select, slet
- `DurationBar`: planlagt vs. tilgængelig tid — grøn (<90%), gul (<110%), rød (>110%)
- **ExercisePicker** (bottom sheet på mobil, `visualViewport` API til iOS keyboard):
  - Sticky header: søgefelt + tag-filter pills
  - Øvelser som liste-rækker — titel, tags, default_mins, stjerner
  - Klik på øvelse-navn → `ExerciseDetailModal` (beskrivelse, varianter, link, billede)
  - "+ Fri øvelse"-knap i bunden (`calc(80px + env(safe-area-inset-bottom))` padding)
- **ExerciseRow**: afkrydsning (cirkel, `done`-toggle), op/ned, navn/tags, minutter-input, 📚 gem til katalog, slet
  - Fri øvelse med navn → 📚-knap → `SaveToCatalogModal` → `POST /api/exercises` → konverter til katalogøvelse
- **Sektionsskabeloner**: 📋-knap per sektion → `LoadSectionTemplateModal` (filtrerer `type=section&section_type=X`)
- **Fulde skabeloner**: 📋-knap i card-header → `LoadTemplateModal` (filtrerer `type=training`)
- "Nulstil alle afkrydsninger"-knap → toast "Afkrydsninger nulstillet ✓"
- Tom ExercisePicker: 🔍 ikon + hjælpetekst (kontekstuel: filter vs. tom)
- Alle interne modaler bruger `.modal-overlay` / `.modal-sheet` mønster:
  `ExerciseDetailModal`, `AddSectionModal`, `FreeExerciseModal`, `SaveToCatalogModal`, `LoadTemplateModal`, `LoadSectionTemplateModal`
- `MiniToast` (intern) til kortvarige beskeder inde i editoren
- ✨-knapper aktiverede: "✨ Hele træning" → `onAIWholeTraining`, per sektion → `onAISectionIndex(idx)`
- `sectionTypes` modtages som prop fra TrainingEditor (ingen intern fetch)

### `HoldsportImportModal.tsx` (komponent)
- Åbnes fra Trainings.tsx og TrainingEditor.tsx
- Henter `workerUrl + token` via `api.fetchHoldsportConfig(teamId)`
- Trin 1: vælg Holdsport-hold fra dropdown
- Trin 2: vælg aktivitet (filtreret på dato-interval) fra liste
- Trin 3: bekræft import → populerer træning med dato, tid, sted, deltagere (kun `status_code === 1`), trænere (navn-match mod app-brugere med trainer/team_manager-rolle)
- Bruger `.modal-overlay` / `.modal-sheet` mønster

### `Archive.tsx` (`/arkiv`)
- Shimmer skeleton mens data hentes (5 rækker)
- Filtre: Vurdering (stjerner, ≥N) · Sted (dropdown) · Træner (dropdown)
- **Desktop** (≥640px): tabel — Dato | Træning | Sted | Varighed | Trænere | Vurdering | Handlinger
  - Trænere-badges: rød (lead_trainer) / blå (øvrige)
- **Mobil**: kortliste med "📦 Arkiveret"-badge øverst
- Handlinger: ⎘ Kopi (duplikér som ny aktiv → navigate til editor), ↩ Genskab (archived=0), ✕ Permanent slet
- Kopi stripper: id, created_at, updated_at, archived, holdsport_id
- Toast (grøn/rød, 3s) ved alle handlinger

### `Aarshjul.tsx` (`/aarshjul`)
- 6 kvartaler: Q2 (Maj–Jun), Q3 (Aug–Sep), Q4 (Okt–Dec), Q1 (Jan–Mar), Overgang (Apr), Q2 næste (Maj–Jun)
- Farver: grøn, blå, lilla, gul, pink, grøn
- Debounce-gem 800ms per kvartal — `saving`-indikator per kvartal
- Redigerbart for `team_manager+` (input + tag-pills + slet-knapper)
- Readonly visning for trainer (pills-visning)

### `Catalog.tsx` (`/katalog`)
- Tabs: **Hal** (catalog=hal, ekskl. keeper-tag) · **Keeper** (catalog=hal + tag=keeper) · **Fysisk** (catalog=fys)
- Sticky søgefelt på mobil (`.catalog-search-bar` CSS-klasse)
- Filter-toggle på mobil (`.catalog-filter-toggle` / `.catalog-filters` CSS-klasser)
- Filtre: søgetekst, tag-filter (pills), aldersgruppe (U9–U19), stjerner (≥N)
- Shimmer skeleton (8 rækker med varierende bredder) mens data hentes
- Tom state med 🔍: skelner "intet match" vs "tomt katalog" — kontekstuel tekst
- Øvelseskort: billede (eller placeholder), navn, beskrivelse, tags, aldersgrupper, stjerner
- Redigér/slet: kun opretter eller admin (vises som ✏️/🗑-knapper)
- Upload billede: resize på client (canvas, max 800px, JPEG 0.75, max 2MB) → `POST /api/exercises/:id/image`
- AI-forslag fra katalog: simpel prompt via `POST /api/ai/suggest` med `{ prompt }`

### `Board.tsx` (`/tavle`)
- Shimmer-skeleton (3 kort) + tom state (aktiv/arkiv/søgning med kontekstuel tekst)
- Arkiv-filter (pills: Aktive / Arkiverede) — kun vist for `team_manager+`
- Søgebar (🔍-knap toggle) — filtrerer på titel, body og kommentar-tekst
- Opslags-liste: `PostCard` per opslag, sorteret pinned DESC, created_at DESC
- `PostCard`: avatar (initialer), navn + relativ tid, overflow ⋯-menu (rediger/pin/arkivér/slet), body-expand >200 tegn, vedhæftnings-pills, kommentar-sektion (toggle)
- Pinnet opslag: rød border + Fastgjort-banner (rød accent-farve)
- `CommentForm`: Enter sender kommentar, Shift+Enter = ny linje; `fontSize: 16` (iOS zoom-fix)
- `CommentRow`: rediger inline, slet — kan af ejer eller team_manager
- Nyt opslag: åbner `NewPostModal` (med @-mentions, visualViewport, filvedhæftning) — invaliderer board-query efter gem
- Rollemodel frontend: `canEdit = isOwner`, `canDelete = isOwner || isManager`, ⋯-menu vises for alle med mindst én handling

### `NewPostModal.tsx` (komponent — nyt opslag)
- `visualViewport`-fix: `handleVVResize` lytter på `vv.resize`/`vv.scroll` → `setViewportH` + `setKeyboardHeight` → modal løftes over iOS-tastatur
- Forsinket focus: `setTimeout(() => textarea.focus(), 300)` — undgår iOS layout-hop ved mount
- `maxHeight: viewportH * 0.92`, `paddingBottom: keyboardHeight + 24` med `transition: 0.2s ease`
- @-autocomplete: `/@(\w*)$/` regex før cursor → dropdown med `@alle` (hvis > 1 medlem) + filtrede brugere
  - `insertMention(name)` — splicer body ved `mentionPos`, sætter cursor via `requestAnimationFrame`
  - `MentionItem` bruger `onMouseDown + preventDefault` for at bevare textarea-fokus
- Filvedhæftning: `ACCEPTED` types (billeder + office + PDF), pending-queue med pills (navn, størrelse, ×fjern)
- Submit: `createBoardPost` → `uploadBoardAttachment` per fil sekventielt
- `fontSize: 16` på alle inputs (iOS zoom-fix)

### `BoardPostCard.tsx` (komponent)
- `renderBody(text, currentUser)` — splitter på `/@(\w[\w\s]*)/g`, highlighter mention (rød = eget navn, grå = andre)
- `Avatar({ name, size })` — initialer i accent-farvet cirkel
- `AttachmentList` — billeder som `<img>` thumbnails (max 200px, klikkable), docs som download-links med 📄 + filstørrelse
- `AutoTextarea` — auto-resize via `useEffect` + `scrollHeight`, `fontSize: 16`
- `CommentRow` — inline edit-mode, rediger/slet links under kommentar-boblen
- `CommentInput` — altid synlig når kommentarer åbne, Enter sender
- `EditPostModal` — `.modal-overlay`/`.modal-sheet` til redigering af titel + body
- **Mobil** (`window.innerWidth ≤ 640`): ⋯-knap → `OverflowItem`-dropdown (backdrop + `onMouseDown + preventDefault`)
- **Desktop**: individuelle `ActionBtn`-knapper (✎ / 📌 / 📦 / 🗑) i post-header
- `isMobile` opdateres ved window resize-event
- Pinnet opslag: `borderTop: '2px solid #f59e0b'` + amber "📌 Fastgjort"-banner

### `Profile.tsx` (`/profil`)
- Initialbogstav-avatar (rød cirkel)
- Vis: navn, email, global rolle-badge, alle holdtildelinger med hold-specifik rolle
- `last_seen` hentes via `GET /api/auth/me`
- Skift password: current, new, confirm → `POST /api/auth/reset-password`
- Success/fejl-beskeder inline

### `Brugere.tsx` (`/brugere`)
Kun `team_manager+`. Viser **kun** brugere tilknyttet det aktive hold.
- Shimmer skeleton mens data hentes
- Invitér ny bruger: navn, email, rolle (maks team_manager) → genererer invite-link → kopi-knap
- Inviteringslink vises i inputfelt med kopi-knap (auto-select via ref)
- Bruger-liste: navn, email, last_seen, hold-rolle
  - Inline navn-redigering: ✏️-knap → inputfelt → Enter/✓ gemmer via `PATCH /api/users/:id`
  - Rolleskift med knapper: Gæst / Træner / Årgangansvarlig (optimistisk UI)
  - Fjern fra hold (bekræftelsesfase)
  - Nulstil adgangskode (regenerate invite-link → kopi)
- Viser ikke global `admin`-rolle som hold-rolle (brug `teamEntry?.role ?? 'guest'`)

### `TeamSettings.tsx` (`/holdindstillinger`)
Kun `team_manager+`. Fire sektioner i rækkefølgen:

**1. Skabeloner (`SkabelonerSection`)**
- To subtabs: Fulde træninger / Sektioner (med count-badge)
- Fulde træninger: kortliste med navn, beskrivelse, sektioner-count, slet (optimistisk + toast)
- Sektioner: grupperet per sektionstype med farvet dot og type-label
  - Grupper vises kun for kendte sektionstyper
  - Slet med toast
- Tom state per tab
- Loading state (simpel tekst — ikke skeleton)

**2. Sektionstyper**
- Liste over holdets sektionstyper med farvet venstre-kant
- Drag-to-reorder med ▲▼ knapper → `PUT /api/section-types/reorder`
- Rediger: label, farve (color-picker), tags (tekst med komma), temaer, påkrævet-toggle
- `SectionTypeModal` bruger `.modal-overlay` / `.modal-sheet` mønster
- Slet (ikke required-typer)
- Opret ny type

**3. Holdsport (`HoldsportSection`)**
- Worker URL + App Token (password-felt med show/hide-toggle)
- Test-knap: gemmer credentials → kalder Holdsport-workeren direkte → viser resultat
- Gem-knap: `PATCH /api/teams/:id`

**4. AI-forslag**
- Ghostet sektion med opacity: 0.5
- Info-tekst: API-nøgle vedligeholdes af admin i Cloudflare (BETA)

### `Admin.tsx` (`/admin`)
Kun `admin`. To tabs:

**Hold-tab:**
- Formular: navn, aldersgruppe (select), sæson → `POST /api/teams` — kopierer globale sektionstyper
- Liste alle hold: navn, aldersgruppe, sæson, member-count
- Slet hold (bekræftelsesfase)

**Brugere-tab:**
- Alle brugere med holdtilknytninger
- Søgning på navn/email
- Klik udvider: alle hold med aktuel rolle + **seneste aktivitet** (formatDate) + oprettelsesdato
- Inline navn-redigering (✏️ → input → ✓/✗) til at matche Holdsport-navne
- Rolleskift per hold: knapper (Gæst / Træner / Årgangansvarlig)
- Tilføj eksisterende bruger til yderligere hold: søg email + vælg hold + vælg rolle
- Fjern bruger fra specifikt hold
- Slet bruger (permanent)

---

## TypeScript-typer (frontend/src/lib/types.ts)

```typescript
interface Training {
  id: string; team_id: string; title?: string; date?: string;
  start_time?: string; end_time?: string; location?: string;
  lead_trainer?: string; trainers: string[]; themes: string[];
  focus_points?: string; notes?: string; participant_count?: number;
  sections: Section[]; stars: number; archived: boolean;
  holdsport_id?: string; created_by?: string; created_at: string; updated_at: string;
}

interface Section {
  id: string; type: string; mins: number; group?: string;
  exercises: SectionExercise[]; note?: string;
}

interface SectionExercise {
  id?: string;          // undefined = fri øvelse
  customName?: string;  // bruges ved fri øvelse
  mins: number; done: boolean;
}

interface Template {
  id: string; team_id: string; name: string;
  type: 'training' | 'section';
  section_type?: string;  // sektionstype-id hvis type='section'
  themes: string[]; description?: string;
  sections: Section[];  // type='section': kun ét element
  created_by?: string; created_at: string;
}

interface Exercise {
  id: string; name: string; description?: string;
  catalog: 'hal' | 'fys'; category?: string;
  tags: string[]; age_groups: string[]; stars: number;
  variants?: string; link?: string; default_mins?: number;
  image_url?: string; image_r2_key?: string;
  created_by?: string; created_by_email?: string;
  created_at: string; updated_at: string;
}

interface SectionType {
  id: string; label: string; color: string; cls: string;
  tags: string[]; themes: string[];
  required: number;     // D1 integer — brug === 1 (aldrig === true)
  sort_order: number; team_id: string | null;
}

interface BoardPost {
  id: string; team_id: string; user_id: string; user_name: string;
  title?: string; body: string; pinned: boolean; pinned_by?: string;
  archived: boolean; edited_at?: string; deleted: boolean; created_at: string;
  comments: BoardComment[]; attachments: BoardAttachment[];
}
interface BoardComment {
  id: string; post_id: string; user_id: string; user_name: string;
  body: string; edited_at?: string; deleted: boolean; created_at: string;
}
interface BoardAttachment {
  id: string; post_id: string; type: 'image' | 'document';
  filename: string; r2_key: string; url: string; size_bytes?: number; created_at: string;
}

interface HoldsportActivity {
  id: string | number; name?: string; title?: string;
  starttime?: string; endtime?: string;
  place?: string; location?: string;
  attendance_count?: number; signups_count?: number;
  _teamId?: string | number; _teamName?: string;
  [key: string]: unknown;
}
```

### Auth-typer (frontend/src/lib/auth.tsx)
```typescript
interface Team {
  id: string; name: string; age_group: string; season: string;
  role: 'guest' | 'trainer' | 'team_manager';  // hold-specifik rolle
  holdsport_worker_url?: string; holdsport_token?: string;
}

interface AuthUser {
  id: string; name: string; email: string;
  role: 'guest' | 'trainer' | 'team_manager' | 'admin';  // global (kun 'admin' er meningsfuld)
  teams: Team[]; last_seen?: string | null;
}
```

---

## AI-forslag

**Model:** `claude-haiku-4-5-20251001`
**API-nøgle:** Global Cloudflare Worker Secret (`ANTHROPIC_API_KEY`) — deles på tværs af alle hold i BETA.

### To tilstande i `POST /api/ai/suggest`

**Simpel prompt-proxy** (`{ prompt: string }`):
- Proxyer direkte til Anthropic — bruges fra Catalog.tsx

**Section-baseret** (`{ team_id, sections[], themes[], vary }`):
1. Henter sektionstyper for holdet
2. Tilføjer `required`-sektioner der mangler
3. Bygger øvelseskatalog per sektion med strict tag-filter
4. Bygger prompt med nummererede sektioner
5. AI's `type`-felt **ignoreres** — matcher på position i stedet
6. Returnerer valideret array (ukendte øvelses-ID'er filtreres fra)

**Vigtigt:** AI returnerer konsekvent `"type": "fysisk"` uanset instruktion. Løsningen er nummererede sektioner og position-matching.

### Worker-funktioner i `ai.ts`
| Funktion | Beskrivelse |
|---|---|
| `getSectionTypes(teamId, db)` | Holdets sektionstyper med parsede tags |
| `addRequiredSections(sections, sectionTypes)` | Unshift manglende required-typer (15 min default) — safety net, frontend sender dem nu |
| `getExercisesForSection(tags, teamId, db)` | Alle øvelser filtreret på tag-intersection |
| `markRecentExercises(exercises, teamId, db)` | `recent: true` for øvelser i seneste 3 træninger |
| `buildSecCatalogs(sections, sectionTypes, teamId, db)` | Katalog per sektion, springer ukendte typer over |
| `fetchReferenceTrainings(teamId, themes, sectionTypes, db)` | Op til 6 arkiverede træninger med `stars >= 4`, scorer på tema-overlap, returnerer top 3 som few-shot examples |
| `buildPrompt(secCatalogs, themes, vary, ageGroup, references)` | Nummererede sektioner + eksempel-blokke fra reference-træninger øverst |
| `callAnthropic(prompt, apiKey)` | 30s `AbortController`, kaster dansk timeout-besked ved 504 |
| `parseAIResponse(text, secCatalogs)` | Position-baseret matching — AI's `type`-felt ignoreres |
| `validateAISections(sections, db)` | `IN (?,...)` DB-query, filtrerer ukendte øvelses-ID'er fra |

### `single_section` flag
`AISectionModal` sender `single_section: true` → worker skipper `addRequiredSections` og `fetchReferenceTrainings` — returnerer præcis én sektion.

### Reference-træninger (few-shot)
- `fetchReferenceTrainings` henter op til 6 arkiverede træninger med `stars >= 4`
- Scores på tema-overlap med request-temaer — bedst matchende 3 returneres
- Formateres som `Eksempel N [tema]: Sektion: øvelse(min), ...` øverst i prompten
- AI bruger dem som inspiration for øvelsesvalg og struktur
- Forbedres automatisk jo flere træninger der arkiveres og vurderes

### Frontend-flow
- **Hele træningen:** `AISuggestModal` — configure (sektion-builder) → loading → result → error
  - Tom træning: alle required sektioner pre-populated med `locked: true`
  - Eksisterende træning: sektioner hentes fra `training.sections`, required låses
  - `useEffect` re-initialiserer rows hvis `sectionTypes` ankommer asynkront efter mount
  - ▲▼ knapper til at justere rækkefølgen på alle rækker
  - 📚-note: "Arkiverede træninger med 4+ stjerner bruges som reference"
  - `onAccept` modtager `Section[]` med nye `crypto.randomUUID()` ids — erstatter alle sektioner
- **Per sektion:** `AISectionModal` — loader straks (ingen configure-step), `single_section: true`
  - `onAccept` modtager `SectionExercise[]` — erstatter kun øvelser i den ene sektion
- Begge modaler bruger `ExerciseResultRow` til at slå øvelses-navne op via `useQuery(['exercises', teamId])`
- `@keyframes pulse` i `index.css` til ✨ loading-animation

### Gotchas
- `locked` felt på rows i `AISuggestModal` — kun auto-initialiserede required-rækker er `locked: true`; manuelt tilføjede er altid `locked: false` uanset sektionstype
- `single_section: true` er nødvendig for `AISectionModal` — ellers unshifter workeren required-sektioner forrest og `res[0]` returnerer forkert sektion

---

## Sektionstyper (globale defaults)

Defineret i `database/schema.sql` (team_id = NULL). Kopieres til hvert hold ved `POST /api/teams`.

```
opvarmning   → tags: [opvarmning]            → farve: #22c55e
afleveringer → tags: [afleveringer, teknik]  → farve: #3b82f6
kontra       → tags: [kontra, spil]          → farve: #C8102E
teknik       → tags: [teknik]                → farve: #8b5cf6
spil         → tags: [spil]                  → farve: #06b6d4
keeper       → tags: [keeper]                → farve: #ec4899
forsvar      → tags: [forsvar]               → farve: #f97316
fysisk       → tags: [styrke, plyometrik]    → farve: #f59e0b   required: true
```

---

## Holdsport-integration

**Arkitektur:** Cloudflare worker-to-worker kald på samme konto er blokeret. Løsning: worker eksponerer kun konfiguration via `GET /api/holdsport/config`, og **frontend kalder Holdsport-workeren direkte fra browser**.

- `holdsport_worker_url` og `holdsport_token` gemmes på `teams`-tabellen
- Frontend henter config → kalder `https://<workerUrl>/teams` og `/teams/:id/activities` direkte med `X-Token` header
- `api.ts` hjælpere: `fetchHoldsportConfig`, `fetchHoldsportTeams`, `fetchHoldsportActivitiesForTeam`, `fetchHoldsportActivity`
- `HoldsportImportModal.tsx` håndterer import-flow
- `fetchHoldsportActivity` finder specifik aktivitet ved at filtrere med dato og matche på `id`
- Ved import: `participant_count` tæller kun `status_code === 1` (mødte op); `trainers[]` matches mod app-brugere med trainer/team_manager-rolle via navn-match (case-insensitive)
- `GET /api/users/team-members` returnerer `team_role` — bruges til at filtrere ud kun trainer/team_manager

---

## Årshjul-konfiguration

6 kvartaler med fast config (label/måneder/farve — ikke gemt i DB):

```
quarter=1 → Q2, Maj–Jun,  #22c55e, Sæsonstart
quarter=2 → Q3, Aug–Sep,  #3b82f6, Efterår
quarter=3 → Q4, Okt–Dec,  #8b5cf6, Vinter
quarter=4 → Q1, Jan–Mar,  #f59e0b, Forår
quarter=5 → Overgang, Apr, #ec4899, Overgangsperiode
quarter=6 → Q2, Maj–Jun,  #22c55e, Næste sæsonstart
```

---

## Vigtige gotchas

### D1 returnerer integers (ikke booleans)
`archived === 1` og `required === 1` — aldrig `=== true`.

### JSON-felter i D1
`sections`, `tags`, `trainers`, `themes` gemmes som JSON-strings.
Worker parser/serialiserer — frontend modtager parsed arrays.

### Optimistisk UI
Opdater lokal state straks, API i baggrunden. Revert + toast ved fejl.

### `displayRole` i `Brugere.tsx`
Brug `teamEntry?.role ?? 'guest'` — aldrig `user.role` som fallback (giver falske holdtilknytninger).

### `last_seen` opdateres ved
`POST /api/auth/login`, `GET /api/auth/me` (app-load), `PATCH /api/trainings/:id` (auto-gem). Vises i Admin som "Seneste aktivitet".

### Skabeloner — to typer
- `type='training'`: fuld træning. Indlæses via 📋 i SectionList card-header.
- `type='section'`: én sektion, filtreres på `section_type`. Indlæses via 📋 per SectionBlock.
- Gem via "💾 Skabelon" toolbar → `SaveTemplateModal`.
- `fetchTemplates(teamId, { type, section_type })` — worker filtrerer på begge parametre.

### Fri øvelse → katalog
📚-knap på `ExerciseRow` når `isFree && ex.customName?.trim()` → `SaveToCatalogModal` → `POST /api/exercises` returnerer `{ id }` → `onSave(id, name, catalog, tags)` → øvelsen tilføjes til lokal `exercises`-state i `SectionList` (undgår UUID som displayName) → rækken konverteres (id sættes, customName fjernes).

### Tag autocomplete (`TagInput`)
- `allTags` i `ExerciseEditor` starter altid som `[]` og populeres fra `GET /api/exercises/tags`
- Ingen hardcoded fallback-konstanter — undgår duplikater som `aflevering` vs `afleveringer`
- Brug `<TagInput value={tags} onChange={setTags} allTags={allTags} />` — pills med autocomplete-dropdown

### Redigér øvelse fra træning
- Klik på øvelses-navn (understreget) → `ExerciseDetailModal`
- For trainer+: "✏️ Rediger"-knap → swapper til `ExerciseEditor` inline i modalen
- `onUpdated` callback opdaterer `exercises`-state i `SectionList` og `detailEx` i `SectionBlock` øjeblikkeligt

### Holdsport — datoperiode
- Holdsport-API respekterer ikke altid `to`-parameteren — filtrer altid i frontend på `starttime >= from && starttime <= to` efter API-kald
- `useEffect` dependency inkluderer `[step, from, to]` — ikke kun `[step]`
- Preselect og `setActivities` bruger begge `inRange` (filtreret liste) — ikke den rå `all`-liste

### Øvelsesbilleder (R2)
- Upload: `POST /api/exercises/:id/image` med `multipart/form-data` — `api.upload()` helper
- Max 2MB, canvas-resize på client (max 800px, JPEG 0.75)
- R2-nøgle: `exercises/{exerciseId}.jpg`

### `requireAuth()` middleware
- Adminrolle er global — altid adgang
- Ellers: slår hold-rolle op fra `user_teams` via `team_id` i query-params eller JSON-body
- Fallback til JWT-rollen hvis ingen `team_id`

### Admin + team_id i GET /api/users
`GET /api/users?team_id=X` for admin returnerer **kun** brugere på det hold.
`GET /api/users` uden team_id (kun admin) returnerer alle brugere med alle hold.

### PATCH /api/users/:id/teams/:tid
`team_manager` kan maks tildele `team_manager`-niveau.

### `wrangler.toml` bindings
```toml
[[d1_databases]]
binding = "DB"
database_name = "ajax-traening"
database_id = "<id>"

[[r2_buckets]]
binding = "STORAGE"
bucket_name = "ajax-traening-storage"
```

### Secrets
```bash
wrangler secret put JWT_SECRET
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put HS_TOKEN   # ikke i aktiv brug — token gemmes per hold i DB
```

---

## Deployment

### Første gang
```bash
wrangler d1 create ajax-traening
wrangler d1 execute ajax-traening --file=database/schema.sql
wrangler r2 bucket create ajax-traening-storage
wrangler secret put JWT_SECRET
wrangler secret put ANTHROPIC_API_KEY
cd worker && wrangler deploy
cd frontend && npm run build
# Push til GitHub → GitHub Actions deployer til Cloudflare Pages
```

### Løbende
Push til `main` → GitHub Actions:
1. Kør nye migrations-filer mod D1
2. `npm run build` i `frontend/`
3. Deploy til Cloudflare Pages + Worker
