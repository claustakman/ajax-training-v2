# Ajax Træningsplanlægger v2 — CLAUDE.md

App til planlægning af håndboldtræninger for Ajax håndbold — multiple hold, rollebaseret adgang, AI-forslag.

**Live URL:** https://ajax-traening.pages.dev
**GitHub:** https://github.com/claustakman/ajax-traening

---

## Stack

| Lag       | Teknologi                        | Noter                              |
|-----------|----------------------------------|------------------------------------|
| Frontend  | React + Vite → Cloudflare Pages  | Samme som forzachang               |
| API       | Cloudflare Workers (TypeScript)  | REST, JWT-auth                     |
| Database  | Cloudflare D1 (SQLite)           | Relationsmodel, versionstyrede migrationer |
| Storage   | Cloudflare R2                    | Øvelsesbilleder                    |
| Email     | Resend                           | Invitationsmail (fase 2+)          |
| CI/CD     | GitHub Actions                   | Auto-deploy + DB-migration ved push|

---

## Mappestruktur

```
ajax-traening/
├── database/
│   ├── schema.sql              # D1 skema — alle tabeller + seed
│   └── migrations/             # Versionstyrede migrationer (0001_initial.sql osv.)
├── worker/
│   ├── src/
│   │   ├── index.ts            # Router (Hono eller vanilla fetch-handler)
│   │   ├── lib/
│   │   │   ├── auth.ts         # JWT sign/verify + password bcrypt (kopieret fra forzachang-mønster)
│   │   │   └── r2.ts           # R2 upload/delete helpers
│   │   └── routes/
│   │       ├── auth.ts         # POST /api/auth/login, /logout, /invite, /reset-password
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
│   │   │   └── auth.tsx        # Auth context (JWT i localStorage)
│   │   ├── components/
│   │   │   ├── Layout.tsx      # Nav shell: 3 tabs + hamburger (CFC-stil)
│   │   │   └── ui/             # Genbrugelige komponenter: Button, Modal, Toast, Card
│   │   └── pages/
│   │       ├── Login.tsx
│   │       ├── Trainings.tsx   # Træningsliste + editor (rutet som /)
│   │       ├── Aarshjul.tsx    # Årshjul med temaer (rutet som /aarshjul)
│   │       ├── Catalog.tsx     # Øvelseskatalog med aldersgruppe-filter (rutet som /katalog)
│   │       ├── Board.tsx       # Opslagstavle (rutet som /tavle, under hamburger)
│   │       ├── Profile.tsx     # Brugerprofil (under hamburger)
│   │       └── Admin.tsx       # Brugere, hold, indstillinger (under hamburger, kun admin)
│   ├── vite.config.ts
│   └── tailwind.config.ts      # Bruges IKKE — CSS-variabler og custom CSS i stedet
├── CLAUDE.md
└── .github/workflows/
    ├── deploy.yml              # Push til main → build frontend + deploy worker + run migrations
    └── migrate.yml             # Manuel workflow til DB-migrationer
```

---

## Design — CFC-stil (lys tema, rød accent)

Appen skal ligne forzachang-appen visuelt. Lys baggrund, rød Ajax-accent.

### CSS-variabler (root)
```css
:root {
  /* Baggrunde */
  --bg: #f5f5f3;
  --bg-card: #ffffff;
  --bg-input: #f0efed;

  /* Accenter */
  --accent: #C8102E;        /* Ajax rød */
  --accent-hover: #a50d25;
  --accent-light: rgba(200, 16, 46, 0.08);

  /* Tekst */
  --text: #1a1a1a;
  --text2: #6b6b6b;
  --text3: #a8a8a8;

  /* Grænser */
  --border: rgba(0, 0, 0, 0.08);
  --border2: rgba(0, 0, 0, 0.14);

  /* Status */
  --green: #1D9E75;
  --yellow: #d97706;
  --blue: #2563eb;
  --red: #dc2626;
  --purple: #7c3aed;

  /* Typografi */
  --font-body: 'DM Sans', sans-serif;
  --font-heading: 'Barlow Condensed', sans-serif;
}
```

### Navigation (identisk mønster som forzachang)
- **Topbar** (desktop): Logo + 3 faste tabs + hold-switcher (hvis > 1 hold) + hamburger-menu til højre
- **Bundnav** (mobil): 3 faste ikoner + Mere-knap (☰)
- **3 faste tabs/ikoner:** Træning · Årshjul · Katalog
- **Hamburger/Mere-panel:** Tavle · Profil · Brugere *(kun team_manager+)* · Admin *(kun admin)* · Skift hold *(hvis > 1 hold)* · Log ud
- Hold-switcher i header viser aktivt hold med dropdown. Viser hold-specifik rolle ved siden af hvert hold-navn.
- Topbar har 3px rød bundkant (`border-bottom: 3px solid var(--accent)`)
- Aktiv tab har rød understregning
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

| Rolle               | Rettigheder                                                                                         |
|---------------------|-----------------------------------------------------------------------------------------------------|
| `guest`             | View-only: kan se træninger og katalog for tildelte hold. Ingen redigering. Ingen Admin-tab.        |
| `trainer`           | CRUD træninger og katalog. Holdsport-import. Se årshjul. Opslagstavle.                              |
| `team_manager`      | Alt trainer + redigere årshjul + styre brugere for eget hold (`/brugere`-siden)                    |
| `admin`             | Global rolle. CRUD hold (`/admin`). Se alle hold. Tildele alle roller.                              |

### Adgangskontrol pr. side

| Side            | Gæst | Træner | Årgangansv. | Admin |
|-----------------|------|--------|-------------|-------|
| Træning (view)  | ✓    | ✓      | ✓           | ✓     |
| Træning (CRUD)  | —    | ✓      | ✓           | ✓     |
| Årshjul (view)  | —    | ✓      | ✓           | ✓     |
| Årshjul (rediger)| —   | —      | ✓           | ✓     |
| Katalog (view)  | ✓    | ✓      | ✓           | ✓     |
| Katalog (CRUD)  | —    | ✓      | ✓           | ✓     |
| Tavle           | ✓    | ✓      | ✓           | ✓     |
| Brugere (`/brugere`) | — | —   | ✓           | ✓     |
| Admin (`/admin`)| —    | —      | —           | ✓     |

### Hold-roller i `user_teams`
`user_teams`-tabellen har en `role`-kolonne (`guest | trainer | team_manager`).
`users.role` bruges kun til at markere global `admin`-status.
`currentTeamRole` udledes i frontend fra det aktive holds `user_teams.role` (eller `'admin'` hvis global admin).

---

## Datamodel (D1 SQLite)

### `teams`
```sql
CREATE TABLE teams (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,           -- fx "Ajax U11 2025/2026"
  age_group   TEXT NOT NULL,           -- fx "U11", "U13"
  season      TEXT NOT NULL,           -- fx "2025/2026"
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### `users`
```sql
CREATE TABLE users (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  email           TEXT UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'guest',   -- guest | trainer | team_manager | admin
  last_seen       TEXT,
  invite_token    TEXT,               -- NULL efter accept
  invite_expires  TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### `user_teams` (mange-til-mange: brugere ↔ hold)
```sql
CREATE TABLE user_teams (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id    TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'trainer',   -- guest | trainer | team_manager (admin er global på users.role)
  PRIMARY KEY (user_id, team_id)
);
```

### `trainings`
```sql
CREATE TABLE trainings (
  id           TEXT PRIMARY KEY,
  team_id      TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  title        TEXT,
  date         TEXT,                  -- ISO 8601 date
  start_time   TEXT,                  -- "HH:MM"
  end_time     TEXT,                  -- "HH:MM"
  location     TEXT,
  lead_trainer TEXT,
  trainers     TEXT,                  -- JSON array
  themes       TEXT,                  -- JSON array
  focus_points TEXT,
  sections     TEXT NOT NULL DEFAULT '[]',  -- JSON array af sektioner
  stars        INTEGER DEFAULT 0,
  archived     INTEGER DEFAULT 0,
  holdsport_id TEXT,                  -- fra Holdsport import
  created_by   TEXT REFERENCES users(id),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### `exercises`
```sql
CREATE TABLE exercises (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  description    TEXT,
  catalog        TEXT NOT NULL DEFAULT 'hal',  -- "hal" | "fys"
  category       TEXT,
  tags           TEXT NOT NULL DEFAULT '[]',   -- JSON array
  age_groups     TEXT NOT NULL DEFAULT '[]',   -- JSON array: ["U9","U11","U13"...]
  stars          INTEGER DEFAULT 0,
  variants       TEXT,
  link           TEXT,
  default_mins   INTEGER,
  image_r2_key   TEXT,                         -- R2-nøgle til billede (NULL = intet billede)
  image_url      TEXT,                         -- Public R2 URL
  created_by     TEXT REFERENCES users(id),
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### `quarters` (årshjul)
```sql
CREATE TABLE quarters (
  id        TEXT PRIMARY KEY,
  team_id   TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  quarter   INTEGER NOT NULL,         -- 1-4
  themes    TEXT NOT NULL DEFAULT '[]',  -- JSON array af temastrenge
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
  tags       TEXT NOT NULL DEFAULT '[]',    -- JSON array
  themes     TEXT NOT NULL DEFAULT '[]',    -- JSON array — holdspecifikt
  required   INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  team_id    TEXT REFERENCES teams(id) ON DELETE CASCADE  -- NULL = global default
);
-- UNIQUE INDEX: section_types_id_team ON (id, COALESCE(team_id, ''))
```

**Regler:**
- Globale defaults har `team_id = NULL` — redigeres aldrig af brugere
- Når et hold oprettes, kopieres globale defaults til holdet (med `themes = '[]'`)
- Hold redigerer kun egne rækker (`team_id = holdets id`)
- Temaer er holdspecifikke og sættes ikke ved kopiering

### `board_posts` (opslagstavle)
```sql
CREATE TABLE board_posts (
  id         TEXT PRIMARY KEY,
  team_id    TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id),
  title      TEXT,
  body       TEXT NOT NULL,
  pinned     INTEGER DEFAULT 0,
  archived   INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  edited_at  TEXT
);
```

### `board_comments`
```sql
CREATE TABLE board_comments (
  id         TEXT PRIMARY KEY,
  post_id    TEXT NOT NULL REFERENCES board_posts(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id),
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  edited_at  TEXT
);
```

### `templates`
```sql
CREATE TABLE templates (
  id         TEXT PRIMARY KEY,
  team_id    TEXT REFERENCES teams(id) ON DELETE CASCADE,  -- NULL = global
  name       TEXT NOT NULL,
  sections   TEXT NOT NULL DEFAULT '[]',  -- JSON array
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

## Worker API — Routes

### Auth (`/api/auth`)
| Method | Path                        | Rolle        | Beskrivelse                                                        |
|--------|-----------------------------|--------------|---------------------------------------------------------------------|
| POST   | `/api/auth/login`           | —            | Body: `{email, password}` → JWT + teams med hold-roller            |
| POST   | `/api/auth/logout`          | auth         | Invalidér token (client-side primært)                              |
| POST   | `/api/auth/invite`          | team_manager | Opret invite. team_manager angiver `team_id`, maks rolle: trainer  |
| POST   | `/api/auth/accept-invite`   | —            | Acceptér invitation, sæt password                                  |
| POST   | `/api/auth/reset-password`  | auth         | Skift password (kræver gammelt password)                           |
| GET    | `/api/auth/me`              | auth         | Returnér aktuel bruger + hold med hold-roller                      |

### Teams (`/api/teams`)
| Method | Path              | Rolle       | Beskrivelse           |
|--------|-------------------|-------------|-----------------------|
| GET    | `/api/teams`      | auth        | List hold (filtreret på rolle) |
| POST   | `/api/teams`      | admin       | Opret hold            |
| PATCH  | `/api/teams/:id`  | team_manager| Opdater hold          |
| DELETE | `/api/teams/:id`  | admin       | Slet hold             |

### Users (`/api/users`)
| Method | Path                          | Rolle        | Beskrivelse                                                     |
|--------|-------------------------------|--------------|------------------------------------------------------------------|
| GET    | `/api/users`                  | team_manager | Admin: alle brugere. team_manager: `?team_id=X` påkrævet       |
| GET    | `/api/users/:id`              | auth         | Hent bruger (kun sig selv eller admin)                          |
| PATCH  | `/api/users/:id`              | admin        | Opdater global rolle, navn                                      |
| DELETE | `/api/users/:id`              | admin        | Slet bruger                                                     |
| POST   | `/api/users/:id/teams`        | team_manager | Tilføj bruger til hold med rolle                                |
| PATCH  | `/api/users/:id/teams/:tid`   | admin        | Opdater brugerens rolle på et hold                              |
| DELETE | `/api/users/:id/teams/:tid`   | team_manager | Fjern bruger fra hold                                           |

### Trainings (`/api/trainings`)
| Method | Path                    | Rolle   | Beskrivelse                             |
|--------|-------------------------|---------|------------------------------------------|
| GET    | `/api/trainings`        | auth    | `?team_id=X&archived=0` — list træninger|
| POST   | `/api/trainings`        | trainer | Opret træning                            |
| GET    | `/api/trainings/:id`    | auth    | Hent enkelt træning                      |
| PATCH  | `/api/trainings/:id`    | trainer | Opdater træning                          |
| DELETE | `/api/trainings/:id`    | trainer | Slet træning                             |

### Exercises (`/api/exercises`)
| Method | Path                        | Rolle   | Beskrivelse                               |
|--------|-----------------------------|---------|-------------------------------------------|
| GET    | `/api/exercises`            | auth    | `?catalog=hal&age_group=U11` — list øvelser|
| POST   | `/api/exercises`            | trainer | Opret øvelse                              |
| PATCH  | `/api/exercises/:id`        | trainer | Opdater øvelse                            |
| DELETE | `/api/exercises/:id`        | trainer | Slet øvelse                               |
| POST   | `/api/exercises/:id/image`  | trainer | Upload billede → R2                       |
| DELETE | `/api/exercises/:id/image`  | trainer | Slet billede fra R2                       |

### Quarters (`/api/quarters`)
| Method | Path                   | Rolle        | Beskrivelse                  |
|--------|------------------------|--------------|------------------------------|
| GET    | `/api/quarters`        | auth         | `?team_id=X` — hent årshjul |
| PUT    | `/api/quarters/:id`    | team_manager | Opdater kvartal-temaer       |

### Board (`/api/board`)
| Method | Path                          | Rolle   | Beskrivelse                          |
|--------|-------------------------------|---------|--------------------------------------|
| GET    | `/api/board`                  | auth    | `?team_id=X` — list opslag           |
| POST   | `/api/board`                  | trainer | Opret opslag                         |
| PATCH  | `/api/board/:id`              | trainer | Rediger opslag (kun eget)            |
| DELETE | `/api/board/:id`              | trainer | Slet opslag (kun eget, trainer+ alt) |
| POST   | `/api/board/:id/pin`          | team_manager | Fastgør/frigør opslag           |
| GET    | `/api/board/:id/comments`     | auth    | List kommentarer til opslag          |
| POST   | `/api/board/:id/comments`     | auth    | Tilføj kommentar                     |

### Holdsport (`/api/holdsport`)
| Method | Path                    | Rolle   | Beskrivelse                            |
|--------|-------------------------|---------|----------------------------------------|
| GET    | `/api/holdsport/activities` | trainer | Proxy til Holdsport API med dato-range |

### AI (`/api/ai`)
| Method | Path               | Rolle   | Beskrivelse                                      |
|--------|--------------------|---------|--------------------------------------------------|
| POST   | `/api/ai/suggest`  | trainer | Proxy til Anthropic API — træningsforslag        |

---

## Auth-flow

- JWT i `localStorage` under nøglen `ajax_token`
- Auth context i `src/lib/auth.tsx` — `useAuth()` hook returnerer `{ user, token, login, logout }`
- `api.ts` indsætter automatisk `Authorization: Bearer <token>` header
- Invitationsflow: admin opretter invite → genererer UUID-token → kopiér link → modtager åbner `/invite/:token` → sætter navn + password → logges ind automatisk
- Password reset: kun via "glemt password"-flow (kræver admin at sende link manuelt i fase 1)

---

## Hold-koncept

- Alle træninger, årshjul og opslagstavle-indlæg er **team-scoped** (`team_id` FK)
- Øvelseskataloget er **globalt** (deles på tværs af hold — filtreres kun på `age_group`)
- Brugere kan være tilknyttet **flere hold** via `user_teams`
- Admin ser alle hold; trainer/team_manager ser kun egne hold
- Hold-vælger vises i navigation hvis bruger har > 1 hold
- `currentTeamId` gemmes i `localStorage` under `ajax_current_team`

---

## AI-forslag

### Hele træningen (`runAISuggest`)
1. Temaer hentes **kun** fra `training.themes` (aktivt valgte på træningen)
2. Sektionstyper dedupliceres inden kald (max én af hver type)
3. Øvelseslister bygges med **strict tag-filter**: øvelse skal matche sektionstype-tags
4. Sektioner nummereres `SEKTION 1, SEKTION 2…` i promptet
5. AI's `type`-felt i svaret **ignoreres** — type tildeles fra vores eget `secsMins` array **ved position**
6. `validateAISections` filtrerer ukendte øvelses-ID'er fra

### Hvorfor position og ikke type?
AI returnerer konsekvent `"type": "fysisk"` uanset instruktion. Løsningen er at nummerere sektionerne og matche på position.

### Per sektion
- Sender `[]` som temaer til `runAISuggest` — funktionen henter selv fra `training.themes`
- Returnerer ét element fra AI-svaret og sætter det på sektionen

---

## Sektionstyper (defaults)

Globale defaults i `database/schema.sql` (team_id = NULL). Kopieres til hvert hold ved oprettelse (temaer = []).

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

Temaer er holdspecifikke og sættes i Holdindstillinger (ikke i globale defaults).

---

## Holdsport-integration

Worker: `routes/holdsport.ts` — proxy til Holdsport API.

Worker-URL og token gemmes i `localStorage` og sendes som headers til proxy.

Funktionalitet:
- Hent aktiviteter fra dato-range
- Import valgte aktiviteter som træninger
- Mapper Holdsport-felter til `training`-skema: titel, dato, starttid, sluttid, lokation

---

## Vigtige gotchas

### D1 returnerer integers (ikke booleans)
`archived === 1` (ikke `archived === true`) i conditional rendering. Brug altid `=== 1` check.

### JSON-felter i D1
Felter som `sections`, `tags`, `trainers`, `themes` gemmes som JSON-strings i D1.
Worker parser med `JSON.parse()` ved læsning, `JSON.stringify()` ved skrivning.
Frontend modtager allerede parsed arrays/objekter (worker deserialiserer).

### Optimistisk UI
Brug optimistisk opdatering i React: opdater lokal state straks, send API-kald i baggrunden.
Vis fejl-toast ved API-fejl og revert til forrige state.

### Team-context i alle API-kald
Næsten alle GET-kald sender `?team_id=<currentTeamId>`. Sæt denne som standard i `api.ts`-klienten.

### Øvelsesbilleder (R2)
- Upload via `POST /api/exercises/:id/image` med `multipart/form-data`
- Max størrelse: 2MB (resize på client side inden upload — max 800px, JPEG 0.75 kvalitet)
- R2-nøgle format: `exercises/{exerciseId}.jpg`
- Public URL via R2 custom domain eller `r2.dev`-URL

### wrangler.toml — D1 og R2 binding
```toml
[[d1_databases]]
binding = "DB"
database_name = "ajax-traening"
database_id = "<udfyldes efter `wrangler d1 create ajax-traening`>"

[[r2_buckets]]
binding = "STORAGE"
bucket_name = "ajax-traening-storage"
```

### JWT-hemmelighed
Sættes som Worker-secret: `wrangler secret put JWT_SECRET`

### Holdsport Worker-token
Sættes som Worker-secret: `wrangler secret put HS_TOKEN`

### AI Worker-proxy
Anthropic API-nøgle: `wrangler secret put ANTHROPIC_API_KEY`

---

## Frontend-sider

### `Trainings.tsx` (`/`)
- Liste over kommende træninger for `currentTeamId` (ikke arkiverede)
- Kalender-datovisning (dato-boks med dag/måned/ugedag)
- Klik → åbn træning i editor
- Editor: Oplysninger (dato, tid, sted, trænere, temaer) + Sektioner
- AI-forslag: hele træning + per sektion
- Skabeloner: gem og indlæs
- Holdsport-import: hent og vælg aktiviteter

### `Aarshjul.tsx` (`/aarshjul`)
- 4 kvartaler med temaer for `currentTeamId`
- Redigerbart for `team_manager`+

### `Catalog.tsx` (`/katalog`)
- Tabs: Hal · Keeper · Fysisk
- Keeper-øvelser gemmes som `catalog='hal'` med tag `keeper` — Keeper-tab filtrerer på dette tag
- Søgning, tag-filter, **aldersgruppe-filter** (U9/U11/U13/U15/U17/U19)
- Stjerne-filter
- Øvelseskort med billede (R2), beskrivelse, tags, aldersgrupper, defaultMins
- Upload billede til R2
- Opret-editor: vælg Hal/Keeper/Fysisk → keeper sætter automatisk `catalog='hal'` + `tags=['keeper',…]`

### `Board.tsx` (`/tavle`)
- Opslagstavle for `currentTeamId`
- Fastgjorte opslag øverst
- Opslag med forfatter, tidsstempel, tekst, kommentarer
- Ny kommentar inline per opslag
- Fastgør (team_manager+), arkivér (team_manager+)

### `Profile.tsx` (`/profil`)
- Navn, email, rolle, holdtildelinger
- Skift password
- Seneste login

### `Brugere.tsx` (`/brugere`)
Kun `team_manager+`. Viser brugere for det aktive hold.
- Invitér ny bruger til holdet (genererer link, maks rolle: trainer)
- Rediger hold-rolle (guest/træner/årgangsansvarlig)
- Fjern bruger fra hold
- Nulstil adgangskode

### `Admin.tsx` (`/admin`)
Kun `admin`. Viser alle hold med CRUD.
- Opret hold (navn, aldersgruppe, sæson)
- Slet hold (sletter også tilknyttede træninger og data)

---

## Øvelseskatalog — struktur

```typescript
interface Exercise {
  id: string
  name: string
  description?: string
  catalog: 'hal' | 'fys'
  category?: string
  tags: string[]
  age_groups: string[]        // ['U9', 'U11', 'U13', ...]
  stars: number               // 0-5
  variants?: string
  link?: string
  default_mins?: number
  image_url?: string          // R2 public URL
  image_r2_key?: string
}
```

### Tags (hal-katalog)
`opvarmning`, `afleveringer`, `teknik`, `kontra`, `spil`, `keeper`, `forsvar`, `1v1`, `2v1`, `skud`

### Tags (fys-katalog)
`plyometrik`, `styrke`, `eksplosion`, `hurtighed`, `finter`

---

## Sektion-struktur (JSON i `trainings.sections`)

```typescript
interface Section {
  id: string
  type: string              // sektionstype-id (fx "opvarmning")
  mins: number
  group?: string            // parallelle grupper: "A" | "B" | ...
  exercises: SectionExercise[]
  note?: string
}

interface SectionExercise {
  id?: string               // NULL = fri øvelse
  customName?: string       // bruges ved fri øvelse
  mins: number
  done: boolean             // afkrydsning til brug under træning
}
```

---

## Deployment

### Første gang
```bash
# Opret D1 database
wrangler d1 create ajax-traening

# Kør schema (udfyld database_id i wrangler.toml først)
wrangler d1 execute ajax-traening --file=database/schema.sql

# Opret R2 bucket
wrangler r2 bucket create ajax-traening-storage

# Sæt secrets
wrangler secret put JWT_SECRET
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put HS_TOKEN

# Deploy worker
cd worker && wrangler deploy

# Byg og deploy frontend
cd frontend && npm run build
# Push til GitHub → GitHub Actions deployer til Cloudflare Pages
```

### Løbende
Push til `main` → GitHub Actions:
1. `wrangler d1 execute` med alle nye migrations-filer
2. `npm run build` i `frontend/`
3. Deploy til Cloudflare Pages

