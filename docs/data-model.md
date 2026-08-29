# Data Model — Container Management System

## Overview

The database is SQLite (WAL mode, foreign keys ON) stored at `server/data/container_mgmt.db`. Four tables represent the full domain: `voyages`, `bookings`, `status_history`, and `gps_pings`.

---

## Entity Relationship Diagram

```
voyages
 └─< bookings (voyage_id FK)
       └─< status_history (booking_id FK, CASCADE DELETE)
       └─< gps_pings     (booking_id FK, CASCADE DELETE)
```

```
┌──────────────────────┐
│       voyages        │
│  PK  id              │
│      voyage_number   │
│      vessel_name     │
│      route           │
│      origin_port     │
│      origin_lat/lng  │
│      destination_port│
│      dest_lat/lng    │
│      etd / eta       │
│      capacity        │
│      available_slots │
│      status          │
└──────────┬───────────┘
           │ 1
           │
           │ N
┌──────────▼───────────┐
│       bookings       │
│  PK  id              │
│  FK  voyage_id       │──────────────┐
│      booking_number  │              │
│      route           │              │
│      container_type  │         ┌────▼──────────────┐
│      container_number│         │  status_history   │
│      cargo_description│        │  PK id            │
│      gross_weight    │         │  FK booking_id    │
│      weight_unit     │         │     status        │
│      hazmat          │         │     timestamp     │
│      hazmat_*        │         │     location_name │
│      consignor_*     │         │     latitude/lng  │
│      consignee_*     │         └───────────────────┘
│      payor_*         │
│      current_status  │    ┌───────────────────────┐
│      booking_date    │    │       gps_pings        │
│      requested_gate_ │    │  PK  id               │
│        in_date       │    │  FK  booking_id        │
│      special_instr.  │    │      container_number  │
└──────────────────────┘    │      latitude/lng      │
           │ 1              │      timestamp         │
           └──────────── N ─│      status_at_ping    │
                            └───────────────────────┘
```

---

## Table: `voyages`

Represents a scheduled sailing of a named vessel between an origin and destination port.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER | PK, AUTOINCREMENT | Surrogate primary key |
| `voyage_number` | TEXT | NOT NULL, UNIQUE | Human-readable voyage identifier (e.g. `JAX-SJU-001`) |
| `vessel_name` | TEXT | NOT NULL | Name of the vessel (e.g. `MV Atlantic Carrier`) |
| `route` | TEXT | NOT NULL | Trade lane code: `JAX-SJU` or `TAC-ANC` |
| `origin_port` | TEXT | NOT NULL | Name of the origin port (e.g. `Jacksonville, FL`) |
| `origin_lat` | REAL | NOT NULL | Latitude of the origin port |
| `origin_lng` | REAL | NOT NULL | Longitude of the origin port |
| `destination_port` | TEXT | NOT NULL | Name of the destination port |
| `dest_lat` | REAL | NOT NULL | Latitude of the destination port |
| `dest_lng` | REAL | NOT NULL | Longitude of the destination port |
| `etd` | TEXT | NOT NULL | Estimated Time of Departure (ISO-8601 datetime string) |
| `eta` | TEXT | NOT NULL | Estimated Time of Arrival (ISO-8601 datetime string) |
| `capacity` | INTEGER | NOT NULL | Total container slots on this voyage |
| `available_slots` | INTEGER | NOT NULL | Remaining unbooked slots; decremented on booking, incremented on cancellation |
| `status` | TEXT | NOT NULL, DEFAULT `'Scheduled'`, CHECK | Voyage state: `Scheduled`, `Departed`, `Arrived`, or `Cancelled` |

---

## Table: `bookings`

Represents one container booking on a specific voyage.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER | PK, AUTOINCREMENT | Surrogate primary key |
| `booking_number` | TEXT | NOT NULL, UNIQUE | Auto-generated reference (format: `BKG-YYYY-NNNN`) |
| `route` | TEXT | NOT NULL | Denormalized trade lane code (`JAX-SJU` or `TAC-ANC`) |
| `voyage_id` | INTEGER | NOT NULL, FK → `voyages(id)` | The voyage this booking is assigned to |
| `container_type` | TEXT | NOT NULL, CHECK | ISO size/type code: `20GP`, `40GP`, `40HC`, `45HC`, `20RF`, `40RF` |
| `container_number` | TEXT | NOT NULL, UNIQUE | Auto-generated ISO 6346-style container ID (format: `SWREXXXXXXC`) |
| `cargo_description` | TEXT | NOT NULL | Free-text description of the cargo |
| `gross_weight` | REAL | NOT NULL | Total gross weight of the cargo |
| `weight_unit` | TEXT | NOT NULL, DEFAULT `'KG'`, CHECK | Unit of weight: `KG` or `LB` |
| `hazmat` | INTEGER | NOT NULL, DEFAULT `0`, CHECK (0 or 1) | Boolean flag: `1` = hazardous materials |
| `hazmat_un_number` | TEXT | NULL | UN number for the hazardous substance (required when `hazmat = 1`) |
| `hazmat_imo_class` | TEXT | NULL | IMO dangerous goods class (required when `hazmat = 1`) |
| `hazmat_packing_group` | TEXT | NULL | Packing group I, II, or III (required when `hazmat = 1`) |
| `consignor_name` | TEXT | NOT NULL | Name of the shipper |
| `consignor_address` | TEXT | NOT NULL | Address of the shipper |
| `consignor_contact` | TEXT | NOT NULL | Contact info for the shipper |
| `consignee_name` | TEXT | NOT NULL | Name of the receiver |
| `consignee_address` | TEXT | NOT NULL | Address of the receiver |
| `consignee_contact` | TEXT | NOT NULL | Contact info for the receiver |
| `payor_name` | TEXT | NOT NULL | Name of the party responsible for freight charges |
| `payor_address` | TEXT | NOT NULL | Address of the payor |
| `payor_contact` | TEXT | NOT NULL | Contact info for the payor |
| `current_status` | TEXT | NOT NULL, DEFAULT `'Booking Confirmed'` | Latest status in the booking lifecycle |
| `booking_date` | TEXT | NOT NULL | ISO-8601 datetime when the booking was created |
| `requested_gate_in_date` | TEXT | NOT NULL | Date the shipper intends to deliver the container to the port gate |
| `special_instructions` | TEXT | NULL | Free-text notes or special handling instructions |

---

## Table: `status_history`

Append-only audit log of every status transition a booking has passed through.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER | PK, AUTOINCREMENT | Surrogate primary key |
| `booking_id` | INTEGER | NOT NULL, FK → `bookings(id)`, CASCADE DELETE | The booking this entry belongs to |
| `status` | TEXT | NOT NULL | The status value at this point in the lifecycle |
| `timestamp` | TEXT | NOT NULL | ISO-8601 datetime when this status was recorded |
| `location_name` | TEXT | NULL | Human-readable name of the location at this status (e.g. `Jacksonville, FL`, `At Sea`) |
| `latitude` | REAL | NULL | Latitude of the location at this status |
| `longitude` | REAL | NULL | Longitude of the location at this status |

---

## Table: `gps_pings`

Time-series GPS positions recorded while the vessel is in transit. Used to draw polyline paths on the map.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER | PK, AUTOINCREMENT | Surrogate primary key |
| `booking_id` | INTEGER | NOT NULL, FK → `bookings(id)`, CASCADE DELETE | The booking this ping belongs to |
| `container_number` | TEXT | NOT NULL | Denormalized container number (for quick lookup without a join) |
| `latitude` | REAL | NOT NULL | GPS latitude at the time of the ping |
| `longitude` | REAL | NOT NULL | GPS longitude at the time of the ping |
| `timestamp` | TEXT | NOT NULL | ISO-8601 datetime of the ping |
| `status_at_ping` | TEXT | NOT NULL | Booking status at the time of the ping |

---

## Status Lifecycle

Statuses are ordered and advance strictly forward. The index position is used by the cutoff rule (edit/cancel allowed only if index ≤ 2).

| Index | Status |
|---|---|
| 0 | `Booking Confirmed` |
| 1 | `Documentation Submitted` |
| 2 | `Gated In (Origin)` ← **cutoff boundary** |
| 3 | `Loaded on Vessel` |
| 4 | `Departed Origin Port` |
| 5 | `At Sea` |
| 6 | `Arrived Destination Port` |
| 7 | `Customs Cleared` |
| 8 | `Available for Pickup` |
| 9 | `Delivered` |

`Cancelled` is a terminal state that can be reached from any status at or before index 2 (while the voyage ETD is in the future).

---

## Identifier Formats

### Container Number

Format: **`SWRE` + 6-digit serial + 1 check digit**

Example: `SWRE4521870`

Modeled after ISO 6346:
- `SWRE` — owner code (4 alpha characters; `U` as 4th character denotes container equipment)
- 6-digit serial number
- 1-digit check digit (0–9)

Container numbers are auto-generated on booking creation and guaranteed unique.

### Booking Number

Format: **`BKG-YYYY-NNNN`**

Example: `BKG-2025-0001`

- `YYYY` — the calendar year of creation
- `NNNN` — a zero-padded sequential counter per year (restarts at `0001` each year)

Booking numbers are auto-generated on booking creation and guaranteed unique.
