# Ajax Træningsplanlægger v2 — CLAUDE.md

App til planlægning af håndboldtræninger for Ajax håndbold — multiple hold, rollebaseret adgang, AI-forslag.

**Live URL:** https://ajax-traening.pages.dev
**GitHub:** https://github.com/claustakman/ajax-training-v2

---

## Stack

| Lag       | Teknologi                        | Noter                              |
|-----------|----------------------------------|------------------------------------|
| Frontend  | React + Vite → Cloudflare Pages  | Inline CSS-variabler, ingen Tailwind |
| API       | Cloudflare Workers (TypeScript)  | Hono router, REST, JWT-auth        |
| Database  | Cloudflare D1 (SQLite)           | Relationsmodel, versionstyrede migrationer |
| Storage   | Cloudflare R2                    | Øvelsesbilleder                    |
| Email     | Resend                           | Invitationsmail (fase 2+)          |
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
│   │   ├── index.ts            # Hono router
│   │   ├── lib/
│   │   │   ├── auth.ts         # JWT sign/verify + password bcrypt
│   │   │   ├── middleware.ts   # requireAuth() med hold-rolle-opslag
│   │   │   └── r2.ts           # R2 upload/delete helpers
│   │   └── routes/
│   │       ├── auth.ts         # POST /api/auth/login, /invite, /accept-invite, /regenerate-invite
│   │       ├── teams.ts        # CRUD holds
│   │       ├── users.ts        # CRUD brugere, roller, holdtildeling
│   │       ├── trainings.ts    # CRUD træninger (team-scoped)
│   │       ├── exercises.ts    # CRUD øvelseskatalog + R2-billeder
│   │       ├── quarters.ts     # CRUD årshjul (team-scoped)
│   │       ├── section_types.ts # CRUD sektionstyper (global eller team-scoped)
│   │       ├── board.ts        # Opslagstavle: opslag, kommentarer (team-scoped)
│   │       ├── holdsport.ts    # Proxy til Holdsport API
│   │       └── ai.ts           # Proxy til Anthropic API for AI-træningsforslag
│   └── wrangler.toml
├── frontend/
│   ├── public/
│   │   ├── manifest.json
│   │   └── icon-192.png
│   ├── src/
│   │   ├── lib/
│   │   │   ├── api.ts          # API-klient — BASE_URL skifter prod/dev
│   │   │   ├── auth.tsx        # Auth context (JWT i localStorage)
│   │   │   ├── types.ts        # Delte TypeScript-typer
│   │   │   └── dateUtils.ts    # fmtDay, fmtMon, fmtWday, durMin, totalMins m.fl.
│   │   ├── components/
│   │   │   ├── Layout.tsx           # Nav shell: topbar + bundnav
│   │   │   ├── SectionList.tsx      # Sektioner + øvelser i trænings-editor
│   │   │   └── SaveTemplateModal.tsx # Gem skabelon (fuld træning eller sektion)
│   │   └── pages/
│   │       ├── Login.tsx
│   │       ├── Trainings.tsx       # Træningsliste (/)
│   │       ├── TrainingEditor.tsx  # Trænings-editor (/traininger/:id)
│   │       ├── Archive.tsx         # Arkiv (/arkiv)
│   │       ├── Aarshjul.tsx        # Årshjul (/aarshjul)
│   │       ├── Catalog.tsx         # Øvelseskatalog (/katalog)
│   │       ├── Board.tsx           # Opslagstavle (/tavle)
│   │       ├── Profile.tsx         # Brugerprofil (/profil)
│   │       ├── Brugere.tsx         # Bruger-styring for team_manager (/brugere)
│   │       ├── TeamSettings.tsx    # Holdindstillinger (/holdindstillinger)
│   │       └── Admin.tsx           # Admin: Hold + Brugere (/admin)
│   ├── vite.config.ts
│   └── index.html
├── CLAUDE.md
└── .github/workflows/
    ├── deploy.yml              # Push til main → build frontend + deploy worker + run migrations
    └── migrate.yml             # Manuel workflow til DB-migrationer
```

---

## Design — CFC-stil (lys tema, rød accent)

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
}
```

### Navigation
- **Topbar** (desktop): Logo + nav-tabs (Træning · Årshjul · Katalog) + hold-switcher (hvis > 1 hold) + hamburger-menu
- **Bundnav** (mobil): Træning · Katalog · Tavle + ☰ Mere-knap — hamburger i topbar skjult på mobil
- **Mere-panel rækkefølge:** Årshjul · Arkiv · Holdindstillinger *(team_manager+)* · Profil · Brugere *(team_manager+)* · Admin *(admin)* · Skift hold · Log ud
- På mobil åbner Mere-panelet **nedefra** (over bundnav, `border-radius: 16px 16px 0 0`)
- På desktop åbner det som dropdown fra topbar (højre side)
- Topbar: `border-bottom: 3px solid var(--accent)`
- Aktiv tab: rød understregning
- Bundnav: `paddingBottom: env(safe-area-inset-bottom)` for iPhone safe area

### Komponenter
- Kort: `background: var(--bg-card); border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.06)`
- Knapper: `min-height: 44px` (touch targets)
- Inputs: `font-size: 16px` (undgår iOS auto-zoom), `min-height: 44px`
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
| `team_manager` | Alt trainer + redigere årshjul + styre brugere for eget hold                    |
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
| Spillere (`/brugere`)   | —    | —      | ✓           | ✓     |
| Indstillinger           | —    | —      | ✓           | ✓     |
| Admin (`/admin`)        | —    | —      | —           | ✓     |

### Hold-roller i `user_teams`
- `user_teams.role`: `guest | trainer | team_manager` — hold-specifik
- `users.role`: kun til global `admin`-status
- `currentTeamRole` udledes i frontend fra aktivt holds `user_teams.role` (eller `'admin'` hvis global admin)
- En bruger oprettes **kun på ét hold** — admin kan efterfølgende tilføje dem til flere hold med forskellig rolle
- Brugere der ikke er i `user_teams` for et hold, ses **ikke** på det hold — aldrig automatisk tilføjet som gæst

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
  trainers     TEXT,          -- JSON array
  themes       TEXT,          -- JSON array
  focus_points TEXT,
  notes        TEXT,
  participant_count INTEGER,
  sections     TEXT NOT NULL DEFAULT '[]',  -- JSON array af sektioner
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
  quarter   INTEGER NOT NULL,
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
- Hold redigerer kun egne rækker

### `board_posts`
```sql
CREATE TABLE board_posts (
  id TEXT PRIMARY KEY, team_id TEXT NOT NULL, user_id TEXT NOT NULL,
  title TEXT, body TEXT NOT NULL, pinned INTEGER DEFAULT 0,
  archived INTEGER DEFAULT 0, created_at TEXT NOT NULL, edited_at TEXT
);
```

### `board_comments`
```sql
CREATE TABLE board_comments (
  id TEXT PRIMARY KEY, post_id TEXT NOT NULL, user_id TEXT NOT NULL,
  body TEXT NOT NULL, created_at TEXT NOT NULL, edited_at TEXT
);
```

### `templates`
```sql
CREATE TABLE templates (
  id          TEXT PRIMARY KEY,
  team_id     TEXT,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'training',  -- 'training' | 'section' (migration 0010)
  section_type TEXT,                              -- sektionstype-id hvis type='section'
  themes      TEXT NOT NULL DEFAULT '[]',         -- JSON array
  description TEXT,
  sections    TEXT NOT NULL DEFAULT '[]',         -- JSON array af Section[]
  created_by  TEXT,
  created_at  TEXT NOT NULL
);
```

---

## Worker API — Routes

### Auth (`/api/auth`)
| Method | Path                          | Rolle        | Beskrivelse                                        |
|--------|-------------------------------|--------------|-----------------------------------------------------|
| POST   | `/api/auth/login`             | —            | `{email, password}` → JWT + teams med hold-roller  |
| POST   | `/api/auth/invite`            | team_manager | Opret invite til nyt hold-medlem                   |
| POST   | `/api/auth/accept-invite`     | —            | Acceptér invitation, sæt password                  |
| POST   | `/api/auth/regenerate-invite` | team_manager | Ny invite-token til eksisterende bruger            |
| POST   | `/api/auth/reset-password`    | auth         | Skift password                                     |
| GET    | `/api/auth/me`                | auth         | Aktuel bruger + hold med hold-roller               |

### Teams (`/api/teams`)
| Method | Path             | Rolle        | Beskrivelse                                           |
|--------|------------------|--------------|-------------------------------------------------------|
| GET    | `/api/teams`     | auth         | Admin: alle hold. Øvrige: egne hold.                  |
| POST   | `/api/teams`     | admin        | Opret hold — kopierer globale sektionstyper til holdet|
| PATCH  | `/api/teams/:id` | team_manager | Opdater hold                                          |
| DELETE | `/api/teams/:id` | admin        | Slet hold + al tilknyttet data                        |

### Users (`/api/users`)
| Method | Path                        | Rolle        | Beskrivelse                                                               |
|--------|-----------------------------|--------------|---------------------------------------------------------------------------|
| GET    | `/api/users`                | team_manager | Admin+`?team_id`: kun det hold. Admin uden: alle brugere. team_manager: `?team_id` påkrævet |
| GET    | `/api/users/team-members`   | auth         | `?team_id=X` — navne til ansvarlig/træner-dropdown                       |
| GET    | `/api/users/:id`            | auth         | Sig selv eller admin                                                      |
| PATCH  | `/api/users/:id`            | admin        | Global rolle eller navn                                                   |
| DELETE | `/api/users/:id`            | admin        | Slet bruger                                                               |
| POST   | `/api/users/:id/teams`      | team_manager | Tilføj eksisterende bruger til hold med rolle                             |
| PATCH  | `/api/users/:id/teams/:tid` | team_manager | Opdater hold-rolle (team_manager maks team_manager, admin kan alt)        |
| DELETE | `/api/users/:id/teams/:tid` | team_manager | Fjern bruger fra hold                                                     |

### Trainings (`/api/trainings`)
| Method | Path                 | Rolle   | Beskrivelse                              |
|--------|----------------------|---------|-------------------------------------------|
| GET    | `/api/trainings`     | auth    | `?team_id=X&archived=0` — list træninger |
| POST   | `/api/trainings`     | trainer | Opret træning                             |
| GET    | `/api/trainings/:id` | auth    | Hent enkelt træning                       |
| PATCH  | `/api/trainings/:id` | trainer | Opdater træning (auto-gem)                |
| DELETE | `/api/trainings/:id` | trainer | Slet træning                              |

### Exercises (`/api/exercises`)
| Method | Path                       | Rolle   | Beskrivelse                                |
|--------|----------------------------|---------|--------------------------------------------|
| GET    | `/api/exercises`           | auth    | `?catalog=hal&age_group=U11`               |
| GET    | `/api/exercises/tags`      | auth    | Alle unikke tags                           |
| POST   | `/api/exercises`           | trainer | Opret øvelse                               |
| PATCH  | `/api/exercises/:id`       | trainer | Opdater øvelse (kun opretter eller admin)  |
| DELETE | `/api/exercises/:id`       | trainer | Slet øvelse                                |
| POST   | `/api/exercises/:id/image` | trainer | Upload billede → R2                        |
| DELETE | `/api/exercises/:id/image` | trainer | Slet billede fra R2                        |

### Quarters (`/api/quarters`)
| Method | Path                | Rolle        | Beskrivelse           |
|--------|---------------------|--------------|-----------------------|
| GET    | `/api/quarters`     | auth         | `?team_id=X`          |
| PUT    | `/api/quarters/:id` | team_manager | Opdater kvartal-temaer|

### Section Types (`/api/section-types`)
| Method | Path                          | Rolle        | Beskrivelse                   |
|--------|-------------------------------|--------------|-------------------------------|
| GET    | `/api/section-types`          | auth         | `?team_id=X`                  |
| POST   | `/api/section-types`          | team_manager | Opret ny type                 |
| PATCH  | `/api/section-types/:id`      | team_manager | Opdater (label, farve, tags)  |
| DELETE | `/api/section-types/:id`      | team_manager | Slet                          |
| PUT    | `/api/section-types/reorder`  | team_manager | Gem ny rækkefølge             |

### Board (`/api/board`)
| Method | Path                      | Rolle        | Beskrivelse               |
|--------|---------------------------|--------------|---------------------------|
| GET    | `/api/board`              | auth         | `?team_id=X`              |
| POST   | `/api/board`              | trainer      | Opret opslag              |
| PATCH  | `/api/board/:id`          | trainer      | Rediger eget opslag       |
| DELETE | `/api/board/:id`          | trainer      | Slet eget opslag          |
| POST   | `/api/board/:id/pin`      | team_manager | Fastgør/frigør            |
| GET    | `/api/board/:id/comments` | auth         | Kommentarer               |
| POST   | `/api/board/:id/comments` | auth         | Tilføj kommentar          |

### Holdsport (`/api/holdsport`)
| Method | Path                       | Rolle   | Beskrivelse                                      |
|--------|----------------------------|---------|--------------------------------------------------|
| GET    | `/api/holdsport/config`    | trainer | Returnerer `{ workerUrl, token }` til frontend   |

### AI (`/api/ai`)
| Method | Path              | Rolle   | Beskrivelse                                             |
|--------|-------------------|---------|---------------------------------------------------------|
| POST   | `/api/ai/suggest` | trainer | To tilstande: simpel prompt-proxy eller section-baseret |

---

## Auth-flow

- JWT i `localStorage` under nøglen `ajax_token`
- `useAuth()` returnerer `{ user, token, currentTeamId, currentTeamRole, login, logout }`
- `api.ts` indsætter automatisk `Authorization: Bearer <token>`
- Invitationsflow: team_manager genererer link → modtager åbner `/invite/:token` → sætter password → logges ind
- `currentTeamId` gemmes i `localStorage` under `ajax_current_team`

---

## Hold-koncept

- Alle træninger, årshjul og board-indlæg er **team-scoped** (`team_id` FK)
- Øvelseskataloget er **globalt** (filtreres kun på `age_group`)
- Brugere tilknyttes hold via `user_teams` — **ikke automatisk**
- Admin ser alle hold; øvrige ser kun egne hold
- Hold-vælger i nav hvis bruger har > 1 hold

---

## AI-forslag

**Model:** `claude-haiku-4-5-20251001`
**API-nøgle:** Global Cloudflare Worker Secret (`ANTHROPIC_API_KEY`) — deles på tværs af alle hold i BETA. Vises som ghostet felt i Holdindstillinger med note om at det vedligeholdes af admin.

### To tilstande i `POST /api/ai/suggest`

**Simpel prompt-proxy** (`{ prompt: string }`):
- Proxyer direkte til Anthropic — bruges fra katalog

**Section-baseret** (`{ team_id, sections[], themes[], vary }`):
1. Henter sektionstyper for holdet
2. Tilføjer `required`-sektioner der mangler
3. Bygger øvelseskatalog per sektion med strict tag-filter
4. Bygger prompt med nummererede sektioner
5. AI's `type`-felt **ignoreres** — matcher på position i stedet
6. Returnerer valideret array (ukendte øvelses-ID'er filtreres fra)

### Hvorfor position og ikke type?
AI returnerer konsekvent `"type": "fysisk"` uanset instruktion. Løsningen er nummererede sektioner og position-matching.

---

## Sektionstyper (globale defaults)

Defineret i `database/schema.sql` (team_id = NULL). Kopieres til hvert hold ved oprettelse.

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

Arkitektur: Cloudflare worker-to-worker kald på samme konto er blokeret. Løsning: worker eksponerer kun konfiguration (`workerUrl` + `token`) via `GET /api/holdsport/config`, og **frontend kalder Holdsport-workeren direkte fra browser**.

- `holdsport_worker_url` og `holdsport_token` gemmes på `teams`-tabellen (migration 0009)
- Frontend henter config → kalder `https://<workerUrl>/teams` og `/teams/:id/activities` direkte
- `api.ts` har hjælpere: `fetchHoldsportConfig`, `fetchHoldsportTeams`, `fetchHoldsportActivitiesForTeam`, `fetchHoldsportActivity`
- `HoldsportImportModal.tsx` håndterer import-flow: vælg hold → vælg aktivitet → importer til træning
- Ved import populeres `participant_count` (kun `status_code === 1` tæller) og `trainers[]` (matchet mod app-brugere med trainer/team_manager-rolle på holdet via navn-match)
- `TrainingEditor.tsx` har "↺ Opdater"-knap ved `participant_count`-feltet for træninger med `holdsport_id`
- `GET /api/users/team-members` returnerer nu `team_role` (brugt til træner-filtrering)

### Secrets
```bash
wrangler secret put HS_TOKEN   # bruges ikke længere direkte — token gemmes per hold i DB
```

---

## Frontend-sider

### `Trainings.tsx` (`/`)
- Liste over kommende (ikke-arkiverede) træninger for `currentTeamId`
- Dato-boks med dag/måned/ugedag, meta-info, tema-pills
- Klik → `TrainingEditor`

### `TrainingEditor.tsx` (`/traininger/:id` + `/traininger/ny`)
- Auto-gem med debounce 1200ms — `SaveIndicator` viser Gemmer/Gemt/Fejl
- Collapsible header-kort: dato, start/slut-tid, sted, antal spillere, ansvarlig, trænere, temaer, fokuspunkter, noter, stjerne-vurdering
- Ansvarlig og trænere vælges fra hold-medlemmer (dropdown fra `/api/users/team-members`)
- Temaer vælges fra årshjulet for det aktive hold
- `SectionList`-komponent for sektioner og øvelser
- Toolbar: ← Tilbage · 💾 Skabelon · 📦 Arkivér · 🗑 Slet
  - "💾 Skabelon" åbner `SaveTemplateModal` (kun synlig på gemte træninger med sektioner)
- **Holdsport**: "Holdsport"-knap åbner `HoldsportImportModal`. For træninger med `holdsport_id`: "↺ Opdater"-knap ved antal spillere opdaterer `participant_count` + `trainers` fra Holdsport

### `SaveTemplateModal.tsx` (komponent — åbnes fra TrainingEditor toolbar)
- Tab-vælger: **Fuld træning** | **Enkelt sektion**
- Fuld træning: navn, beskrivelse, tema-pills fra årshjul, preview (sektionsliste med farvet dot)
- Enkelt sektion: klikbar kortliste over sektioner med farvet kant + ✓-markering, auto-udfylder navn fra sektionstype-label + træningens første tema, beskrivelse, tema-pills, preview (øvelsenavne, max 5 + "+ X flere")
- Gem-knap disablet hvis navn tomt eller ingen sektion valgt

### `SectionList.tsx` (komponent i TrainingEditor)
- Sektioner med farvet venstre-kant og collapsible body
- Sektion-header: drag op/ned, type-label, øvelse-tæller, gruppe-badge, minutter, gruppe-select, slet
- `DurationBar`: viser planlagt vs. tilgængelig tid (grøn/gul/rød)
- Øvelses-picker (`ExercisePicker`): bottom-sheet på mobil
  - Søgefelt + tag-filter pills i sticky header
  - Øvelser som **liste-rækker** (ikke grid) — titel, tags, minutter, stjerner
  - Klik på øvelse-navn åbner `ExerciseDetailModal`
  - "+ Fri øvelse" i bunden (med `calc(80px + env(safe-area-inset-bottom))` padding for bundnav)
- `ExerciseRow`: afkrydsning (cirkel), op/ned, navn/tags, minutter, 📚 gem til katalog, slet
  - Fri øvelse med navn viser 📚-knap → `SaveToCatalogModal` (vælg hal/fys + tags → `POST /api/exercises`)
  - Efter gem linkes rækken til den nye katalogøvelse (id sættes, customName fjernes)
- Sektionsskabeloner: 📋 indlæs (`LoadSectionTemplateModal`) per sektion — filtrerer på `type=section&section_type=X`
- Fuld træning-skabeloner: 📋 indlæs (`LoadTemplateModal`) fra card-header — filtrerer på `type=training`
- Nulstil alle afkrydsninger
- AI-forslag knapper (deaktiverede til session 5)

### `Archive.tsx` (`/arkiv`)
- Viser alle arkiverede træninger for `currentTeamId`
- Filtre: Vurdering (stjerner) · Sted · Træner
- **Desktop**: tabel — Dato | Træning | Sted | Varighed | Trænere | Vurdering | Handlinger
  - Trænere-badges: rød (lead_trainer) / blå (øvrige)
- **Mobil**: kortliste med "📦 Arkiveret"-badge øverst på hvert kort
- Handlinger: ⎘ Kopi (duplikér som ny aktiv træning), ↩ Genskab (fjern fra arkiv), ✕ Permanent slet
- Kopi stripper: id, created_at, updated_at, archived, holdsport_id — navigerer til ny træning

### `Aarshjul.tsx` (`/aarshjul`)
- 4 kvartaler med temaer for `currentTeamId`
- Redigerbart for `team_manager`+

### `Catalog.tsx` (`/katalog`)
- Tabs: Hal · Keeper · Fysisk
- Keeper: `catalog='hal'` + tag `keeper`
- Søgning, tag-filter, aldersgruppe-filter (U9–U19), stjerne-filter
- Øvelseskort med billede, beskrivelse, tags, aldersgrupper
- Kun opretter eller admin kan redigere/slette
- Upload billede til R2 (max 800px, JPEG 0.75, 2MB)

### `Board.tsx` (`/tavle`)
- Opslagstavle for `currentTeamId`
- Fastgjorte opslag øverst
- Kommentarer inline per opslag
- Fastgør/arkivér (team_manager+)

### `Profile.tsx` (`/profil`)
- Navn, email, rolle, holdtildelinger med roller
- Skift password

### `Brugere.tsx` (`/brugere`)
Kun `team_manager+`. Viser **kun** brugere tilknyttet det aktive hold.
- Invitér ny bruger (genererer link, maks team_manager)
- Rediger hold-rolle med knapper (guest / træner / årgangansvarlig)
- Fjern bruger fra hold
- Nulstil adgangskode (regenerate invite-link)

### `TeamSettings.tsx` (`/holdindstillinger`)
Kun `team_manager+`.
- **Sektionstyper**: opret, rediger (label, farve, tags, temaer, påkrævet), slet, drag-to-reorder
- **AI-forslag**: ghostet sektion med info om at Anthropic API-nøgle vedligeholdes i Cloudflare af admin (BETA)

### `Admin.tsx` (`/admin`)
Kun `admin`. To tabs:

**Hold-tab:**
- Opret hold (navn, aldersgruppe, sæson) — kopierer globale sektionstyper
- List alle hold med members
- Slet hold

**Brugere-tab:**
- Alle brugere med holdtilknytninger
- Klik udvider: vis alle hold med aktuel rolle + **seneste aktivitet** + oprettelsesdato
- Inline navn-redigering (til at matche Holdsport-navne)
- Rolleskift per hold (knapper: Gæst / Træner / Årgangansvarlig)
- Tilføj eksisterende bruger til yderligere hold med valgt rolle
- Fjern bruger fra specifikt hold

---

## Øvelseskatalog — TypeScript-typer

```typescript
interface Exercise {
  id: string
  name: string
  description?: string
  catalog: 'hal' | 'fys'
  category?: string
  tags: string[]
  age_groups: string[]
  stars: number
  variants?: string
  link?: string
  default_mins?: number
  image_url?: string
  image_r2_key?: string
  created_by?: string
  created_by_email?: string
  created_at: string
  updated_at: string
}

interface Section {
  id: string
  type: string        // sektionstype-id
  mins: number
  group?: string      // "A" | "B" | ...
  exercises: SectionExercise[]
  note?: string
}

interface SectionExercise {
  id?: string         // undefined = fri øvelse
  customName?: string
  mins: number
  done: boolean       // afkrydsning under træning
}

interface Template {
  id: string
  team_id: string
  name: string
  type: 'training' | 'section'   // 'training' = fuld træning, 'section' = én sektion
  section_type?: string           // sektionstype-id hvis type='section'
  themes: string[]
  description?: string
  sections: Section[]
  created_by?: string
  created_at: string
}

interface SectionType {
  id: string
  label: string
  color: string
  cls: string
  tags: string[]
  themes: string[]
  required: number    // D1 integer — brug === 1
  sort_order: number
  team_id: string | null
}
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

### Admin + team_id i GET /api/users
`GET /api/users?team_id=X` for admin returnerer **kun** brugere på det hold (ligesom team_manager).
`GET /api/users` uden team_id (kun admin) returnerer alle brugere med alle hold.

### PATCH /api/users/:id/teams/:tid
Åben for `team_manager` (med hold-tjek) og `admin`.
`team_manager` kan maks tildele `team_manager`-niveau.

### displayRole i Brugere.tsx
Brug `teamEntry?.role ?? 'guest'` — aldrig `user.role` som fallback (giver falske holdtilknytninger).

### last_seen opdateres ved
`POST /api/auth/login`, `GET /api/auth/me` (app-load) og `PATCH /api/trainings/:id` (auto-gem). Vises i Admin-siden under brugerens udvidede sektion som "Seneste aktivitet".

### Skabeloner — to typer
- `type='training'`: fuld træning, alle sektioner. Indlæses via 📋 i SectionList card-header.
- `type='section'`: én sektion, filtreres på `section_type`. Indlæses via 📋 i hvert SectionBlock.
- Gem sker via "💾 Skabelon" i TrainingEditor toolbar → `SaveTemplateModal` (håndterer begge typer).
- `fetchTemplates(teamId, { type, section_type })` — worker filtrerer på begge parametre.

### Fri øvelse → katalog
📚-knap på `ExerciseRow` når `isFree && ex.customName?.trim()` → `SaveToCatalogModal` → `POST /api/exercises` returnerer `{ id }` → rækken konverteres til katalogøvelse (id sættes, customName fjernes).

### Øvelsesbilleder (R2)
- Upload: `POST /api/exercises/:id/image` med `multipart/form-data`
- Max 2MB, resize på client (max 800px, JPEG 0.75)
- R2-nøgle: `exercises/{exerciseId}.jpg`

### wrangler.toml bindings
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
wrangler secret put HS_TOKEN
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
wrangler secret put HS_TOKEN
cd worker && wrangler deploy
cd frontend && npm run build
# Push til GitHub → GitHub Actions deployer til Cloudflare Pages
```

### Løbende
Push til `main` → GitHub Actions:
1. Kør nye migrations-filer mod D1
2. `npm run build` i `frontend/`
3. Deploy til Cloudflare Pages + Worker
