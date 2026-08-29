> **📚 Project documentation has been generated in this folder.**
> See: [runbook.md](./runbook.md) · [business-overview.md](./business-overview.md) · [data-model.md](./data-model.md) · [api-reference.md](./api-reference.md) · [architecture.md](./architecture.md)

---


# Build Prompt: Container Booking & Tracking System

## Project Overview
Build a **Container Management System** — a single-user internal web application for booking ocean freight containers and tracking them from origin to destination. The app covers two trade lanes:

1. **Jacksonville, FL → Puerto Rico**
2. **Tacoma, WA → Alaska**

The system has two core modules: **Booking Management** and **Container Tracking** (with a live map view), plus supporting reference data (routes, voyages, container types).

Tech stack is flexible — choose whatever you're most productive with (e.g., a Node/Express or Python/FastAPI backend, React frontend, SQLite/Postgres for storage). No auth/login system is needed since this is single-user.

---

## 1. Data Model

### 1.1 Booking
Each booking must capture:

| Field | Notes |
|---|---|
| Booking Number | Auto-generated unique ID (e.g., `BKG-2026-0001`) |
| Origin Port | Jacksonville, FL or Tacoma, WA |
| Destination Port | Puerto Rico (San Juan) or Alaska (Anchorage / Dutch Harbor) |
| Voyage | Linked to a Voyage record (see 1.4) |
| Container Type | 20GP, 40GP, 40HC, 40RF (Reefer), 45HC, 20RF, etc. |
| Container Number | ISO container number format (e.g., `MSCU1234567`) — can be auto-generated for dummy data |
| Cargo Description | Free text / commodity type (e.g., "General Merchandise," "Auto Parts," "Frozen Goods," "Building Materials") |
| Gross Weight | Numeric + unit (lbs or kg) |
| Hazmat Flag | Yes/No |
| Hazmat Details | If Yes: UN Number, IMO/Hazard Class, Packing Group (conditionally required) |
| Consignor (Shipper) | Name, address, contact info |
| Consignee | Name, address, contact info |
| Payor / Bill-To Party | Name, billing address, contact info (can be same as consignor/consignee via a checkbox) |
| Booking Status | See tracking status list (1.3) |
| Booking Date | Date created |
| Requested Gate-In Date | Date cargo expected to be dropped off |
| Special Instructions | Optional free text |

### 1.2 Voyage
| Field | Notes |
|---|---|
| Voyage Number | e.g., `VSL-JAX-PR-0142` |
| Vessel Name | Dummy vessel names, e.g., "MV Caribbean Star" |
| Route | Jacksonville→Puerto Rico or Tacoma→Alaska |
| Origin Port / Destination Port | With lat/long coordinates for map plotting |
| ETD (Estimated Departure) | Date/time |
| ETA (Estimated Arrival) | Date/time |
| Capacity / Available Slots | Optional, for realism |
| Status | Scheduled / Departed / Arrived / Completed |

### 1.3 Container Tracking Status (lifecycle)
Each booking's container should move through a defined status pipeline, each with a timestamp and location:

1. **Booking Confirmed**
2. **Empty Container Dispatched** (to shipper for stuffing)
3. **Gated In (Origin)** — full container received at origin port terminal
4. **Loaded on Vessel**
5. **Departed Origin Port / At Sea**
6. **In Transit** (with periodic GPS pings while at sea)
7. **Arrived Destination Port**
8. **Gated Out (Destination)** — full container released to consignee
9. **Empty Returned** (optional final step)

Additionally, a booking can move to a terminal **Cancelled** status instead of progressing further, if cancelled before its eligibility cutoff (see Section 2.5).

Store a **status history log** per booking (status + timestamp + location/coordinates) so the full journey timeline can be displayed, not just the current status.

### 1.4 GPS / Location Tracking
For each in-transit container, generate a series of dummy GPS pings (lat/long + timestamp) tracing a plausible path along the real-world shipping lane:

- **Jacksonville → San Juan, PR**: roughly following the Atlantic coast/Caribbean route.
- **Tacoma → Anchorage, AK**: following the Pacific coast/Inside Passage route.

Each ping should include: `booking_id/container_number`, `latitude`, `longitude`, `timestamp`, and `status_at_ping` (e.g., "At Sea"). Containers not yet at sea (still gated in) or already gated out should just show a single fixed point at the relevant port, not a moving trail.

---

## 2. Application Features

### 2.1 Create Booking
A form to create a new booking capturing all fields in section 1.1, with:
- Dropdown for Route (which auto-filters Voyage options to that lane)
- Dropdown for Voyage (filtered by selected route)
- Dropdown for Container Type
- Conditional Hazmat sub-fields that appear only when Hazmat = Yes
- Basic validation (required fields, weight must be numeric/positive, hazmat details required if hazmat = yes)

### 2.2 Booking List / Search
A table/list view of all bookings with filters by:
- Route
- Status
- Hazmat Yes/No
- Container type
- Date range

Clicking a booking opens a **Booking Detail** view showing all fields, party info, and the full status timeline.

### 2.3 Update Tracking Status
Ability to manually advance a booking's status (simulating a terminal operator update), which appends to the status history log and updates the current GPS position marker accordingly.

### 2.4 Edit Booking
Bookings can be edited (cargo details, weight, hazmat info, parties, container type, voyage selection, etc.) **only while the booking is still eligible** — see cutoff rule below. Once past the cutoff, the edit form should be read-only/disabled, with a clear message explaining why (e.g., "This booking can no longer be edited — the voyage has already departed (ETD: <date>)."). Editing should be blocked once the booking's status has moved past **Gated In (Origin)**, not just based on the date, so a booking manually advanced ahead of schedule is protected too.

### 2.5 Cancel Booking
Bookings can be cancelled, subject to the same eligibility cutoff as editing. Cancelling should:
- Set status to a new terminal status: **Cancelled**
- Append a "Cancelled" entry to the status history log with a timestamp and optional cancellation reason (free text field)
- Free up/release the voyage slot if you're tracking capacity (2.2 Voyage — Available Slots)
- Leave the booking visible in the booking list/search (filterable by "Cancelled" status) rather than deleting it outright, so there's a record

**Eligibility cutoff rule (applies to both Edit and Cancel):** A booking may only be edited or cancelled **before its assigned voyage's ETD (Estimated Time of Departure / POL ETD — Port of Loading ETD)** AND while its status is still at or before **"Gated In (Origin)"**. Once the voyage's POL ETD has passed, or the booking has progressed to "Loaded on Vessel" or beyond, the booking is locked — no further edits or cancellation, only status-advancing tracking updates. Enforce this check server-side (not just hiding the UI button), since ETD is a scheduling detail the requester will rely on for real workflow integrity.

### 2.6 Live Map View
Using **Leaflet + OpenStreetMap**, show:
- Markers for the origin and destination ports on both lanes
- Current position markers for all containers currently "At Sea" / "In Transit," with a popup showing booking number, container number, cargo type, and status
- A polyline showing the traveled path (and optionally the remaining planned path) for each in-transit container
- Ability to click a container marker to jump to its Booking Detail view
- A way to toggle/filter which route(s) are shown on the map

### 2.7 Dashboard (optional but recommended)
A simple summary view showing:
- Count of bookings by status (e.g., X gated in, Y at sea, Z delivered)
- Count of hazmat vs non-hazmat bookings
- Upcoming voyages (ETD within next N days)

---

## 3. Dummy Data Requirements

Pre-populate the system with:

- **10–15 sample bookings**, spread across both routes (Jacksonville→Puerto Rico and Tacoma→Alaska), with a realistic mix of:
  - Different container types (20GP, 40GP, 40HC, reefer, etc.)
  - A few hazmat bookings and mostly non-hazmat
  - Different consignors/consignees/payors (varied dummy company names)
  - Different current statuses — include bookings at *every* stage of the lifecycle (some just booked, some gated in, some at sea, some arrived/gated out, some fully delivered) so the tracking pipeline and map are populated realistically
  - At least 1 **Cancelled** booking, to demonstrate that flow
- **A matching set of voyages** (at least 3–4 per route) with realistic vessel names, ETDs/ETAs
- **GPS ping history** for every booking currently "At Sea" or "In Transit," forming a believable path between the origin and destination port coordinates, plus historical ping trails for already-arrived bookings (for timeline playback if you choose to support it)

---

## 4. Non-Functional Notes
- Single user, no authentication required
- Data can be stored in a local database (SQLite is fine) or in-memory/JSON seed file — persistence across restarts is preferred but not mandatory
- Clean, functional UI is more important than heavy visual design polish
- Include a seed script or startup routine that (re)populates the dummy data described in Section 3

---

## 5. Open Items to Confirm With Requester (if any arise)
If anything is ambiguous while building — e.g., exact port list beyond San Juan/Anchorage, exact hazmat classification fields needed, or whether editing/deleting bookings should be supported — make a reasonable assumption, note it clearly, and proceed rather than blocking on it.
