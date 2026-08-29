# Container Management System — Build Plan

## Top-Level Overview

Build a single-user internal web application for booking and tracking ocean freight containers on two trade lanes:
- **Jacksonville, FL → San Juan, PR**
- **Tacoma, WA → Anchorage, AK**

**Stack chosen:**
- **Backend:** Node.js + Express (TypeScript) — lightweight, well-suited for a single-user internal tool with SQLite
- **Database:** SQLite via `better-sqlite3` — persists to disk, easy to seed, no external server needed
- **Frontend:** React (Vite + TypeScript) + Tailwind CSS — fast, clean, minimal overhead
- **Map:** Leaflet + OpenStreetMap (as specified)
- **API:** REST JSON over Express; React fetches from it

**Monorepo layout:**
```
/
  server/   — Express API + DB layer + seed script
  client/   — React/Vite frontend
```

No authentication. Data persists across restarts. Seed script re-populates dummy data on demand.

---

## Sub-Tasks

---

### Sub-Task 1 — Project Scaffold & Tooling

**Intent:** Stand up the monorepo skeleton with working dev servers for both client and server, so every subsequent sub-task has a runnable environment to build into.

**Expected Outcomes:**
- `server/` runs on port 3001 and responds to `GET /health`
- `client/` runs on port 5173 and proxies `/api` to the server
- TypeScript compiles without errors on both sides
- `npm run dev` (root) starts both concurrently

**Todo List:**
1. Create root `package.json` with `concurrently` dev script
2. Scaffold `server/` — `tsconfig.json`, Express entry point, `better-sqlite3` dep, `nodemon`
3. Scaffold `client/` — Vite + React + TypeScript template, Tailwind CSS, configure `/api` proxy
4. Add `.gitignore` (node_modules, dist, `server/data/*.db`)
5. Verify both dev servers start and communicate

**Relevant Context:** No existing code yet; this is a greenfield project.

**Status:** [x] done

---

### Sub-Task 2 — Database Schema & Seed Script

**Intent:** Define all tables and relationships in SQLite, then write a seed script that drops/re-creates data and populates the full dummy dataset described in Section 3 of the spec.

**Expected Outcomes:**
- All tables exist with correct columns and foreign keys
- Seed script runs via `npm run seed` and is idempotent (can be re-run safely)
- After seeding: 10–15 bookings across both routes, 3–4 voyages per route, GPS pings for every at-sea/arrived booking, at least 1 cancelled booking, bookings at every lifecycle stage

**Todo List:**
1. Create `server/src/db/schema.sql` defining these tables:
   - `voyages` (id, voyage_number, vessel_name, route, origin_port, origin_lat, origin_lng, destination_port, dest_lat, dest_lng, etd, eta, capacity, available_slots, status)
   - `bookings` (id, booking_number, route, voyage_id FK, container_type, container_number, cargo_description, gross_weight, weight_unit, hazmat, hazmat_un_number, hazmat_imo_class, hazmat_packing_group, consignor_name, consignor_address, consignor_contact, consignee_name, consignee_address, consignee_contact, payor_name, payor_address, payor_contact, current_status, booking_date, requested_gate_in_date, special_instructions)
   - `status_history` (id, booking_id FK, status, timestamp, location_name, latitude, longitude)
   - `gps_pings` (id, booking_id, container_number, latitude, longitude, timestamp, status_at_ping)
2. Write `server/src/db/seed.ts` with all dummy voyages, bookings, status history, and GPS pings
3. Generate realistic GPS ping arrays for both shipping lanes:
   - JAX → San Juan: Atlantic coast / Caribbean waypoints
   - Tacoma → Anchorage: Pacific coast / Inside Passage waypoints
4. Wire up schema creation and seed execution in a single `npm run seed` command

**Relevant Context:** Section 1 (data model), Section 3 (dummy data), Section 1.4 (GPS pings)

**Status:** [x] done

---

### Sub-Task 3 — REST API Layer

**Intent:** Expose all data operations the frontend needs as a clean REST API, with server-side enforcement of the eligibility cutoff rules for edit/cancel.

**Expected Outcomes:**
- All endpoints return correct JSON with appropriate HTTP status codes
- Edit and Cancel endpoints return `403` with an explanatory message if the eligibility cutoff is violated (status past "Gated In (Origin)" OR voyage ETD is in the past)
- Status-advance endpoint appends to `status_history` and upserts latest GPS position

**Todo List:**
1. `GET /api/voyages` — list all voyages (optionally filtered by route)
2. `GET /api/voyages/:id` — voyage detail
3. `GET /api/bookings` — list bookings, support query params: `route`, `status`, `hazmat`, `container_type`, `date_from`, `date_to`
4. `GET /api/bookings/:id` — booking detail including full `status_history` and `gps_pings`
5. `POST /api/bookings` — create booking (auto-generate booking number + container number, set initial status to "Booking Confirmed", seed first status history entry)
6. `PUT /api/bookings/:id` — edit booking — enforce cutoff rule server-side
7. `POST /api/bookings/:id/cancel` — cancel booking — enforce cutoff rule, accept optional `reason`, append status history, update voyage available_slots
8. `POST /api/bookings/:id/advance-status` — advance to next lifecycle status, append to history, update GPS position
9. `GET /api/map/containers` — return current position + metadata for all non-cancelled bookings (for map view)
10. `GET /api/dashboard` — return counts by status, hazmat counts, upcoming voyages

**Relevant Context:** Section 2 (features), Section 2.4/2.5 (eligibility cutoff rule), Section 1.3 (status lifecycle order)

**Status:** [x] done

---

### Sub-Task 4 — Core UI Shell & Navigation

**Intent:** Build the app shell — layout, sidebar/nav, routing — so all feature pages have a consistent home.

**Expected Outcomes:**
- React Router configured with routes for: Dashboard, Bookings List, New Booking, Booking Detail, Map View
- Persistent sidebar navigation with links to each section
- Active route highlighted in nav
- Responsive enough to be usable at standard desktop widths

**Todo List:**
1. Install `react-router-dom`
2. Create `AppLayout` component with sidebar + main content area
3. Define all routes in `App.tsx`
4. Build `Sidebar` nav component with links and active-state styling
5. Add a simple page title / breadcrumb header

**Relevant Context:** Section 2 (features list); no existing frontend code yet

**Status:** [x] done

---

### Sub-Task 5 — Booking List & Filters Page

**Intent:** The main working view — a searchable, filterable table of all bookings.

**Expected Outcomes:**
- Table lists all bookings with columns: Booking #, Route, Container #, Type, Voyage, Status, Booking Date
- Filter bar supports: Route, Status, Hazmat, Container Type, Date Range
- Clicking a row navigates to Booking Detail
- "New Booking" button visible and linked

**Todo List:**
1. Create `BookingsListPage` component
2. Fetch from `GET /api/bookings` with filter query params
3. Build filter bar (dropdowns + date inputs) that update query params on change
4. Render results in a sortable table
5. Add status badge component (colour-coded by lifecycle stage)
6. Wire "New Booking" button to `/bookings/new`

**Relevant Context:** Section 2.2

**Status:** [x] done

---

### Sub-Task 6 — Create & Edit Booking Form

**Intent:** The form used for both creating a new booking and editing an existing one (with the edit path enforcing the cutoff rule).

**Expected Outcomes:**
- All fields from Section 1.1 are present with correct input types
- Route dropdown auto-filters Voyage dropdown to matching lane
- Hazmat sub-fields (UN #, IMO class, Packing Group) appear only when Hazmat = Yes
- "Same as Consignor" checkbox pre-fills Payor fields
- Validation: required fields, positive numeric weight, hazmat fields required when hazmat = Yes
- In edit mode: if booking is past cutoff, the form renders read-only with a clear lock message showing the reason
- Successful submit navigates to Booking Detail

**Todo List:**
1. Create `BookingFormPage` (used for both create and edit via route params)
2. Fetch voyages filtered by selected route for the voyage dropdown
3. Implement conditional hazmat field rendering
4. Implement "same as consignor" checkbox logic for Payor section
5. Build client-side validation
6. On submit: `POST /api/bookings` (create) or `PUT /api/bookings/:id` (edit)
7. Handle `403` response from API gracefully (show lock message)
8. In edit mode, pre-populate all fields from the existing booking

**Relevant Context:** Section 2.1, 2.4; eligibility cutoff from Section 2.4/2.5

**Status:** [x] done

---

### Sub-Task 7 — Booking Detail & Status Timeline

**Intent:** The detail view for a single booking — shows all fields, party info, and the full status history timeline. Also hosts the Cancel and Advance Status actions.

**Expected Outcomes:**
- All booking fields displayed in readable layout (not an editable form)
- Full status timeline rendered as a vertical timeline component (status, timestamp, location)
- "Edit Booking" button present (disabled/hidden if past cutoff, with tooltip explaining why)
- "Cancel Booking" button present (same cutoff logic); triggers a modal for optional cancellation reason
- "Advance Status" button present (disabled if booking is Cancelled or Arrived/Completed); shows next status in the pipeline
- After any action, the page refreshes its data

**Todo List:**
1. Create `BookingDetailPage` — fetch `GET /api/bookings/:id`
2. Build field display layout (two-column for parties, single column for cargo/voyage info)
3. Build `StatusTimeline` component (ordered list of status history entries)
4. Add "Advance Status" button — `POST /api/bookings/:id/advance-status`
5. Add "Cancel Booking" button + confirmation modal with reason text field — `POST /api/bookings/:id/cancel`
6. Add "Edit Booking" link/button — conditionally locked with explanation message
7. Handle cutoff-locked state display

**Relevant Context:** Section 2.2, 2.3, 2.4, 2.5; status lifecycle from Section 1.3

**Status:** [x] done

---

### Sub-Task 8 — Live Map View

**Intent:** The Leaflet map showing current container positions, port markers, and traveled paths.

**Expected Outcomes:**
- Map renders with OpenStreetMap tiles
- Origin/destination port markers shown for both lanes (4 ports total: JAX, San Juan, Tacoma, Anchorage)
- Each in-transit container shows a marker at its current GPS position with a popup (booking #, container #, cargo type, status)
- Clicking a container marker navigates to its Booking Detail
- Polyline drawn from origin through historical GPS pings to current position for each in-transit container
- Toggle buttons to filter by route (show JAX→PR, Tacoma→AK, or both)
- Containers not yet at sea show a fixed marker at origin port; arrived/delivered containers show fixed marker at destination

**Todo List:**
1. Install `leaflet` and `react-leaflet`
2. Create `MapPage` component, fetch `GET /api/map/containers`
3. Render port markers with distinct icon (anchor / port icon)
4. Render container markers with popup content
5. Render GPS ping polylines per container
6. Implement route filter toggle (buttons or checkboxes above the map)
7. Wire marker click to navigate to `/bookings/:id`
8. Fix Leaflet icon path issue (known Vite/webpack asset issue with default marker icons)

**Relevant Context:** Section 2.6; Section 1.4 (GPS pings); Leaflet + OpenStreetMap specified

**Status:** [x] done

---

### Sub-Task 9 — Dashboard

**Intent:** Summary overview page with booking counts by status, hazmat breakdown, and upcoming voyages.

**Expected Outcomes:**
- Count cards for each booking status (e.g., "3 At Sea", "2 Gated In", "1 Cancelled", etc.)
- Hazmat vs non-hazmat booking count
- Table/list of upcoming voyages (ETD within next 30 days) showing vessel name, route, ETD, ETA, available slots

**Todo List:**
1. Create `DashboardPage` component, fetch `GET /api/dashboard`
2. Build status count card grid
3. Build hazmat summary card
4. Build upcoming voyages table
5. Add quick-link from each status card to Bookings List pre-filtered by that status

**Relevant Context:** Section 2.7

**Status:** [x] done

---

### Sub-Task 10 — Project Documentation

**Intent:** Produce a `docs/` folder that explains the system to anyone who needs to understand, operate, or extend it — covering business context, architecture, API reference, data model, and operational runbook. Written alongside the code so it accurately reflects what was built.

**Expected Outcomes:**
- `docs/business-overview.md` — business context, the two trade lanes, the booking lifecycle, the cancellation/edit eligibility rules, and glossary of domain terms
- `docs/architecture.md` — system architecture (stack choices, monorepo layout, client/server separation, data flow diagram in text/ASCII)
- `docs/data-model.md` — all tables, columns, types, relationships, and FK constraints; status lifecycle diagram
- `docs/api-reference.md` — every REST endpoint: method, path, query params, request body shape, response shape, error codes (including the 403 cutoff cases)
- `docs/runbook.md` — how to install, run dev servers, run the seed script, reset data, and build for production

**Todo List:**
1. Write `docs/business-overview.md` after Sub-Task 2 (schema) is done — trade lanes, booking lifecycle, edit/cancel rules, glossary
2. Write `docs/architecture.md` after Sub-Task 3 (API) is done — stack, folder layout, request flow, tech decisions
3. Write `docs/data-model.md` after Sub-Task 2 (schema) is done — tables, columns, relationships, status lifecycle
4. Write `docs/api-reference.md` after Sub-Task 3 (API) is done — all endpoints with request/response examples
5. Write `docs/runbook.md` after Sub-Task 1 (scaffold) is done — install, dev, seed, reset, build steps
6. Update the original `docs/container-management-system-prompt.md` with a note pointing to the generated docs (do not modify the original spec content)

**Relevant Context:** All sub-tasks feed into this; written incrementally as code sub-tasks complete

**Status:** [x] done

---

## Decisions Made

| Topic | Decision |
|---|---|
| Tech stack | Node/Express + TypeScript backend, React/Vite/Tailwind frontend, SQLite via better-sqlite3 |
| Persistence | SQLite on disk — survives restarts |
| Alaska destination | Anchorage only (Dutch Harbor excluded) |
| Dashboard | Yes — built as described in Section 2.7 |
| Auth | None (single-user per spec) |
| Editing cutoff enforcement | Server-side (API returns 403) AND reflected in UI |
