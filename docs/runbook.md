# Operational Runbook — Container Management System

## Prerequisites

| Requirement | Minimum version |
|---|---|
| Node.js | 18 LTS or later |
| npm | 9 or later (bundled with Node 18) |

Verify your environment:

```bash
node -v   # should print v18.x.x or higher
npm -v    # should print 9.x.x or higher
```

---

## Installation

The project is a monorepo with three `package.json` files: one at the root, one in `server/`, and one in `client/`. Install each independently (they have separate `node_modules`).

```bash
# From the project root
npm install

# Server dependencies
npm install --prefix server

# Client dependencies
npm install --prefix client
```

---

## Running the Development Servers

A single command at the root starts both the Express server and the Vite dev server concurrently:

```bash
npm run dev
```

- **Server** starts on **http://localhost:3001**
- **Client** starts on **http://localhost:5173**

The client's Vite proxy forwards every `/api/*` request to the server, so the browser never needs to know the server's port directly.

To start them independently:

```bash
# Server only (from server/)
npm run dev --prefix server

# Client only (from client/)
npm run dev --prefix client
```

---

## Database File

SQLite persists data to disk at:

```
server/data/container_mgmt.db
```

The `data/` directory is created automatically on first start if it does not exist. The file is listed in `.gitignore` and will not be committed.

---

## Running the Seed Script

The seed script drops and re-creates all data (voyages, bookings, status history, GPS pings) with a realistic dummy dataset. Run it from the project root or from `server/`:

```bash
# From the project root
npm run seed --prefix server

# Or from server/
cd server && npm run seed
```

The script uses `ts-node` to run `server/src/db/seed.ts` directly against the live database file.

> **Safe to re-run.** The seed script truncates all tables before inserting, so you can run it as many times as needed to reset to a clean state.

> **Local-only data.** `server/data/*.db*` is git-ignored and has never been committed to this repo — each developer's database is entirely local. If you create test data by hand (via the UI, a manual API call, etc.) instead of adding it to `seed.ts`, nobody else will see it after you push, even though your code changes go through fine. If you want a teammate to see specific test data, add it to `server/src/db/seed.ts` and have them re-run `npm run seed --prefix server` after pulling.

> **DB Assistant needs its own `.env`.** `server/.env` is also git-ignored (only `server/.env.example` is tracked). A fresh clone has no `.env` at all, so the "DB Assistant" chat page will fail with `"No API key found..."` until you copy `server/.env.example` to `server/.env` and fill in a working `LLM_API_KEY` (Gemini, via Google AI Studio) — this step isn't needed for the rest of the app (bookings, map, dashboard), only for `/chat`.

---

## Resetting Data

To wipe all data and start fresh, simply re-run the seed:

```bash
npm run seed --prefix server
```

To delete the database file entirely (full reset):

```bash
# PowerShell
Remove-Item server/data/container_mgmt.db -ErrorAction SilentlyContinue
npm run seed --prefix server
```

The database file and schema are re-created automatically on the next server start or seed run.

---

## Building for Production

### Client (Vite)

```bash
npm run build --prefix client
# Output: client/dist/
```

### Server (TypeScript → JavaScript)

```bash
npm run build --prefix server
# Output: server/dist/
```

To build both in one command from the root:

```bash
npm run build
```

### Running the compiled server

```bash
node server/dist/index.js
```

In production the client's `dist/` folder should be served by a static file host (Nginx, Caddy, etc.) or you can add `express.static` middleware in `server/src/index.ts` to serve it from the API server directly.

---

## Port Reference

| Service | Default port |
|---|---|
| Express API server | **3001** |
| Vite dev server | **5173** |

---

## Health Check

Once the server is running, verify it responds:

```bash
curl http://localhost:3001/health
# {"status":"ok","timestamp":"2025-..."}
```
