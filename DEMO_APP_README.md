# BOB_THE_BUILDER 🚢

A full-stack internal web application for booking and tracking ocean freight containers across two US trade lanes, with an AI-powered DB assistant for natural-language data queries.

---

## Overview

**BOB_THE_BUILDER** is a single-user container management system that lets operators create bookings, track containers through a 10-step lifecycle, view live GPS positions on a map, and query shipment data in plain English via an integrated chatbot — all backed by a local SQLite database with zero external infrastructure dependencies.

### Trade Lanes

| Route | Origin | Destination |
|---|---|---|
| JAX-SJU | Jacksonville, FL | San Juan, PR |
| TAC-ANC | Tacoma, WA | Anchorage, AK |

---

## Features

- **Dashboard** — booking counts by status, hazmat summary, upcoming voyage list
- **Bookings List** — filterable/searchable table (route, status, hazmat, container type, date range)
- **Booking Form** — create and edit bookings with conditional hazmat fields, voyage selection, and party info
- **Booking Detail** — full status timeline, advance status, cancel with reason
- **Live Map** — Leaflet/OpenStreetMap with port markers, container GPS positions, and traveled-path polylines
- **DB Assistant** — AI chatbot (powered by IBM Bob) that answers natural-language questions about your data by generating and executing SQL queries in real-time

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + TypeScript + Tailwind CSS |
| Backend | Node.js + Express + TypeScript |
| Database | SQLite via `better-sqlite3` |
| Map | Leaflet + react-leaflet + OpenStreetMap |
| AI | IBM Bob Inference API (OpenAI-compatible) |

---

## Project Structure

```
/
├── client/          # React/Vite frontend
│   └── src/
│       ├── components/   # AppLayout, Sidebar, StatusTimeline, StatusBadge
│       └── pages/        # Dashboard, BookingsList, BookingForm, BookingDetail, Map, Chat
├── server/          # Express API + DB
│   └── src/
│       ├── db/           # schema.sql, database.ts, seed.ts
│       ├── lib/          # bobClient.ts, schemaPrompt.ts
│       └── routes/       # bookings, voyages, dashboard, map, chat
├── docs/            # Full project documentation
└── package.json     # Root monorepo — runs both servers concurrently
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+

### 1. Install dependencies

```bash
npm install
npm install --prefix server
npm install --prefix client
```

### 2. Configure the AI chatbot (optional)

Copy the example env file and fill in your credentials:

```bash
cp server/.env.example server/.env
```

Edit `server/.env`:

```env
BOB_API_KEY=your_inference_api_key_here
BOB_INFERENCE_URL=https://api.us-east.bob.ibm.com/v1/chat/completions
BOB_MODEL=auto
```

> The app runs fully without a Bob API key — the chatbot page will return errors but all other features work normally.

### 3. Seed the database

```bash
npm run seed --prefix server
```

This populates dummy voyages, bookings, status histories, and GPS pings for both trade lanes.

### 4. Start the dev servers

```bash
npm run dev
```

This starts both servers concurrently:
- **Frontend** → http://localhost:5173
- **Backend** → http://localhost:3001

---

## DB Assistant

The chatbot page (`/chat`) lets you ask natural-language questions about your data:

| Example question | What it does |
|---|---|
| "How many bookings are there?" | `SELECT COUNT(*) FROM bookings` |
| "List all hazmat bookings" | Filters by `hazmat = 1` |
| "Which containers are currently at sea?" | Filters by `current_status` |
| "What's the next voyage from Jacksonville?" | Orders upcoming voyages by ETD |
| "How many bookings are in each status?" | `GROUP BY current_status` |

The server extracts SQL from the LLM response, executes it against SQLite (read-only — SELECT only), and feeds the results back to the model for a plain-English answer. Your API key never reaches the browser.

---

## Documentation

Full documentation lives in [`docs/`](./docs/):

- [`business-overview.md`](./docs/business-overview.md) — trade lanes, booking lifecycle, edit/cancel eligibility rules, glossary
- [`architecture.md`](./docs/architecture.md) — stack decisions, folder layout, request flow
- [`data-model.md`](./docs/data-model.md) — all tables, columns, relationships, status lifecycle
- [`api-reference.md`](./docs/api-reference.md) — every REST endpoint with request/response shapes
- [`runbook.md`](./docs/runbook.md) — install, dev, seed, reset, build instructions

---

## Container Lifecycle

Bookings progress through 10 ordered statuses:

1. Booking Confirmed
2. Documents Submitted
3. Customs Cleared (Export)
4. Gated In (Origin)
5. Loaded on Vessel
6. Departed Origin Port / At Sea
7. Arrived Destination Port
8. Customs Cleared (Import)
9. Available for Pickup
10. Delivered / Completed

> **Edit & Cancel cutoff:** once a booking reaches **Gated In (Origin)** or the voyage ETD has passed, edits and cancellations are locked server-side (HTTP 403).

A booking can also be moved to **Cancelled** at any eligible point.

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start both client and server in dev mode |
| `npm run build` | Build both client and server for production |
| `npm run seed --prefix server` | Seed (or re-seed) the SQLite database |
| `npm run dev --prefix server` | Start server only |
| `npm run dev --prefix client` | Start client only |
