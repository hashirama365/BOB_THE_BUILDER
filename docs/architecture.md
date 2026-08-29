# Architecture — Container Management System

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Backend runtime | Node.js 18+ | Lightweight, well-suited for a single-user internal tool; same language as the frontend reduces context switching |
| Backend framework | Express 4 (TypeScript) | Minimal, explicit, no magic — easy to trace the full request path |
| Database | SQLite via `better-sqlite3` | Zero external process, persists to disk, fast synchronous API, trivial to seed and reset |
| Frontend framework | React 18 + Vite | Fast HMR in dev, clean component model, Vite's proxy makes the `/api` integration seamless |
| Frontend styling | Tailwind CSS 3 | Utility-first; no separate CSS files, consistent design tokens |
| Routing (client) | React Router v7 | Standard for React SPAs; declarative nested routes |
| Map | Leaflet + react-leaflet | Open-source, uses OpenStreetMap tiles, no API key required |
| Concurrency (dev) | concurrently | Starts both dev servers from a single `npm run dev` at the monorepo root |

---

## Monorepo Folder Layout

```
/                             ← root (concurrently dev script)
├── package.json              ← root: "dev" and "build" scripts only
├── package-lock.json
├── .gitignore
├── container-management-plan.md
├── docs/                     ← project documentation
│   ├── container-management-system-prompt.md
│   ├── runbook.md
│   ├── business-overview.md
│   ├── data-model.md
│   ├── api-reference.md
│   └── architecture.md
│
├── server/                   ← Express API + SQLite
│   ├── package.json          ← server deps (express, better-sqlite3, cors)
│   ├── tsconfig.json
│   ├── nodemon.json
│   ├── data/
│   │   └── container_mgmt.db ← SQLite database file (gitignored)
│   └── src/
│       ├── index.ts          ← Express app entry point, port 3001
│       ├── db/
│       │   ├── database.ts   ← singleton DB connection + schema init
│       │   ├── schema.sql    ← CREATE TABLE statements
│       │   └── seed.ts       ← drop/re-seed dummy data (npm run seed)
│       └── routes/
│           ├── bookings.ts   ← CRUD + cancel + advance-status
│           ├── voyages.ts    ← list + detail
│           ├── map.ts        ← /containers + /pings
│           └── dashboard.ts  ← summary counts + upcoming voyages
│
└── client/                   ← React + Vite frontend
    ├── package.json          ← client deps (react, leaflet, react-router-dom, tailwind)
    ├── tsconfig.json
    ├── vite.config.ts        ← port 5173, /api proxy → localhost:3001
    ├── tailwind.config.js
    ├── postcss.config.js
    └── src/
        ├── main.tsx          ← React entry point
        ├── App.tsx           ← BrowserRouter + route tree
        ├── index.css         ← Tailwind directives
        ├── components/
        │   ├── AppLayout.tsx     ← sidebar + <Outlet> wrapper
        │   ├── Sidebar.tsx       ← nav links with active-state styling
        │   ├── PageHeader.tsx    ← title bar / breadcrumb
        │   ├── StatusBadge.tsx   ← colour-coded status pill
        │   └── StatusTimeline.tsx← vertical status history timeline
        └── pages/
            ├── DashboardPage.tsx     ← summary cards + upcoming voyages
            ├── BookingsListPage.tsx  ← filterable table of all bookings
            ├── BookingFormPage.tsx   ← create + edit form (shared)
            ├── BookingDetailPage.tsx ← full detail view + actions
            └── MapPage.tsx           ← Leaflet map with container positions
```

---

## Request Flow

```
Browser (port 5173)
   │
   │  GET /api/bookings?route=JAX-SJU
   ▼
Vite Dev Server proxy
   │  (rewrites /api/* → http://localhost:3001/api/*)
   ▼
Express (port 3001)
   │  app.use('/api/bookings', bookingsRouter)
   ▼
bookings.ts route handler
   │  db.prepare('SELECT ...').all(...)
   ▼
better-sqlite3 (synchronous)
   │
   ▼
server/data/container_mgmt.db  (SQLite file on disk)
   │
   ▼  JSON array
Express res.json(rows)
   │
   ▼
Vite proxy returns response to browser
   │
   ▼
React component updates state → re-render
```

In production (no Vite proxy), the browser fetches directly from `http://localhost:3001/api` (or whatever public URL the server is deployed to).

---

## Key Architectural Decisions

### SQLite on disk

SQLite was chosen over Postgres/MySQL because this is a single-user internal tool with no concurrent write contention. It needs no external server process, the database file can be deleted and re-created in seconds, and the `better-sqlite3` synchronous API keeps the Express route handlers simple (no `async/await` needed). WAL mode is enabled for better read performance alongside writes.

### Synchronous database access

`better-sqlite3` is synchronous by design. All `db.prepare(...).get()` / `.all()` / `.run()` calls block the Node.js event loop, which is acceptable here because there is only one user. This eliminates a class of async bugs and keeps route handlers readable.

### REST API with no authentication

No auth layer was specified in the requirements. CORS is open (`cors()` middleware with defaults). If the system is later deployed in a multi-user environment, an authentication middleware layer can be inserted before the route handlers without restructuring the API.

### Cutoff rule enforced server-side

The edit/cancel eligibility check (`checkCutoff`) lives entirely in the server (`server/src/routes/bookings.ts`). The API returns `403 Forbidden` with a plain-language `reason` string if the cutoff is violated. The frontend mirrors this logic visually (disabling buttons, showing a lock message) but never relies on client-side logic alone — the server is always the authority.

### Seed script pattern

All dummy data is generated in a single `server/src/db/seed.ts` file that truncates all tables and re-inserts a deterministic dataset. This makes the app safe to reset at any time with `npm run seed`. The schema itself (`schema.sql`) uses `CREATE TABLE IF NOT EXISTS` so it is safe to run on every server startup.

### Shared `BookingFormPage` for create and edit

Rather than separate `CreateBookingPage` and `EditBookingPage` components, the frontend uses a single `BookingFormPage` that detects whether it has an `:id` route param. In edit mode it fetches the existing booking, pre-fills all fields, and calls `PUT /api/bookings/:id`. In create mode it calls `POST /api/bookings`. This avoids duplicating form logic.

### Vite proxy

The Vite dev server is configured to proxy all `/api/*` requests to `http://localhost:3001`. This means the frontend never has to know the API's port — it just fetches `/api/bookings` as a relative URL. In production the client build is a static bundle that can be served from any CDN or static host.

---

## Frontend Structure

### Routing

Routes are defined in [`App.tsx`](../client/src/App.tsx) using React Router v7. All routes are nested under `AppLayout`, which renders the sidebar and a `<main>` area with `<Outlet>`.

| Path | Component | Description |
|---|---|---|
| `/` | `DashboardPage` | Summary cards and upcoming voyages |
| `/bookings` | `BookingsListPage` | Filterable table of all bookings |
| `/bookings/new` | `BookingFormPage` | Create a new booking |
| `/bookings/:id` | `BookingDetailPage` | Full detail + status timeline + actions |
| `/bookings/:id/edit` | `BookingFormPage` | Edit an existing booking |
| `/map` | `MapPage` | Leaflet map with container positions |

### Components

| Component | Purpose |
|---|---|
| `AppLayout` | Outer shell: sidebar + `<Outlet>` content area |
| `Sidebar` | Navigation links with active-route highlighting |
| `PageHeader` | Page title / breadcrumb bar |
| `StatusBadge` | Coloured pill displaying a booking's current status |
| `StatusTimeline` | Vertical list of `status_history` entries |

---

## Backend Structure

### Entry Point

[`server/src/index.ts`](../server/src/index.ts) creates the Express app, attaches CORS and JSON body parsing middleware, mounts the four routers, and listens on port 3001. A `GET /health` endpoint is also registered directly here.

### Database Module

[`server/src/db/database.ts`](../server/src/db/database.ts) exports a singleton `db` instance. On first import it:
1. Ensures `server/data/` directory exists
2. Opens the SQLite file
3. Sets `journal_mode = WAL` and `foreign_keys = ON`
4. Executes `schema.sql` (safe to re-run due to `IF NOT EXISTS`)

### Route Modules

| File | Mounts at | Endpoints |
|---|---|---|
| `routes/voyages.ts` | `/api/voyages` | `GET /`, `GET /:id` |
| `routes/bookings.ts` | `/api/bookings` | `GET /`, `GET /:id`, `POST /`, `PUT /:id`, `POST /:id/cancel`, `POST /:id/advance-status` |
| `routes/map.ts` | `/api/map` | `GET /containers`, `GET /pings` |
| `routes/dashboard.ts` | `/api/dashboard` | `GET /` |
