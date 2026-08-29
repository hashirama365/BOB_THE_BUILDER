# API Reference — Container Management System

## Base URL

All endpoints are served from:

```
http://localhost:3001/api
```

During development, the Vite proxy forwards `/api/*` requests from `http://localhost:5173` to the server, so the browser can use relative paths.

All request and response bodies use `application/json`.

---

## Voyages

### `GET /api/voyages`

List all voyages, ordered by ETD ascending.

**Query Parameters**

| Parameter | Type | Description |
|---|---|---|
| `route` | string | Filter by trade lane code (`JAX-SJU` or `TAC-ANC`) |

**Response** `200 OK`

Array of voyage objects:

```json
[
  {
    "id": 1,
    "voyage_number": "JAX-SJU-001",
    "vessel_name": "MV Atlantic Carrier",
    "route": "JAX-SJU",
    "origin_port": "Jacksonville, FL",
    "origin_lat": 30.3322,
    "origin_lng": -81.6557,
    "destination_port": "San Juan, PR",
    "dest_lat": 18.4655,
    "dest_lng": -66.1057,
    "etd": "2025-04-15T08:00:00.000Z",
    "eta": "2025-04-18T14:00:00.000Z",
    "capacity": 50,
    "available_slots": 12,
    "status": "Scheduled"
  }
]
```

---

### `GET /api/voyages/:id`

Retrieve a single voyage by its numeric ID.

**Path Parameters**

| Parameter | Type | Description |
|---|---|---|
| `id` | integer | Voyage primary key |

**Response** `200 OK` — single voyage object (same shape as above)

**Error Responses**

| Status | Body | Condition |
|---|---|---|
| `404 Not Found` | `{"error": "Voyage not found"}` | No voyage with that ID |

---

## Bookings

### `GET /api/bookings`

List all bookings, joined with their voyage's `voyage_number`, `vessel_name`, `etd`, and `eta`. Results are ordered by `booking_date` descending.

**Query Parameters**

| Parameter | Type | Description |
|---|---|---|
| `route` | string | Filter by trade lane (`JAX-SJU` or `TAC-ANC`) |
| `status` | string | Filter by `current_status` (exact match) |
| `hazmat` | string | `true` or `1` for hazmat only; `false` or `0` for non-hazmat |
| `container_type` | string | Filter by container type (e.g. `40HC`) |
| `date_from` | string | Include bookings with `booking_date >= date_from` (ISO-8601) |
| `date_to` | string | Include bookings with `booking_date <= date_to` (ISO-8601) |

All parameters are optional and combinable.

**Response** `200 OK` — array of booking objects (each includes `voyage_number`, `vessel_name`, `etd`, `eta` from the joined voyage)

---

### `GET /api/bookings/:id`

Retrieve a single booking with its full status history and GPS pings.

**Path Parameters**

| Parameter | Type | Description |
|---|---|---|
| `id` | integer | Booking primary key |

**Response** `200 OK`

```json
{
  "id": 7,
  "booking_number": "BKG-2025-0007",
  "route": "JAX-SJU",
  "voyage_id": 2,
  "container_type": "40HC",
  "container_number": "SWRE4521870",
  "cargo_description": "Electronics",
  "gross_weight": 12500,
  "weight_unit": "KG",
  "hazmat": 0,
  "hazmat_un_number": null,
  "hazmat_imo_class": null,
  "hazmat_packing_group": null,
  "consignor_name": "Acme Exports Inc.",
  "consignor_address": "100 Port Road, Jacksonville FL 32201",
  "consignor_contact": "Jane Smith, 904-555-0100",
  "consignee_name": "Caribbean Imports LLC",
  "consignee_address": "45 Dock Street, San Juan PR 00901",
  "consignee_contact": "Carlos Rivera, 787-555-0200",
  "payor_name": "Acme Exports Inc.",
  "payor_address": "100 Port Road, Jacksonville FL 32201",
  "payor_contact": "Jane Smith, 904-555-0100",
  "current_status": "At Sea",
  "booking_date": "2025-03-20T10:00:00.000Z",
  "requested_gate_in_date": "2025-04-12",
  "special_instructions": null,
  "voyage_number": "JAX-SJU-002",
  "vessel_name": "MV Atlantic Carrier",
  "voyage_route": "JAX-SJU",
  "etd": "2025-04-15T08:00:00.000Z",
  "eta": "2025-04-18T14:00:00.000Z",
  "origin_port": "Jacksonville, FL",
  "origin_lat": 30.3322,
  "origin_lng": -81.6557,
  "destination_port": "San Juan, PR",
  "dest_lat": 18.4655,
  "dest_lng": -66.1057,
  "status_history": [
    {
      "id": 10,
      "booking_id": 7,
      "status": "Booking Confirmed",
      "timestamp": "2025-03-20T10:00:00.000Z",
      "location_name": "Jacksonville, FL",
      "latitude": 30.3322,
      "longitude": -81.6557
    }
  ],
  "gps_pings": [
    {
      "id": 45,
      "booking_id": 7,
      "container_number": "SWRE4521870",
      "latitude": 27.9,
      "longitude": -79.5,
      "timestamp": "2025-04-16T06:00:00.000Z",
      "status_at_ping": "At Sea"
    }
  ]
}
```

**Error Responses**

| Status | Body | Condition |
|---|---|---|
| `404 Not Found` | `{"error": "Booking not found"}` | No booking with that ID |

---

### `POST /api/bookings`

Create a new booking. The server auto-generates `booking_number`, `container_number`, `booking_date`, and sets `current_status` to `"Booking Confirmed"`. A first `status_history` entry is inserted automatically.

**Request Body**

```json
{
  "route": "JAX-SJU",
  "voyage_id": 2,
  "container_type": "40HC",
  "cargo_description": "Electronics",
  "gross_weight": 12500,
  "weight_unit": "KG",
  "hazmat": false,
  "hazmat_un_number": null,
  "hazmat_imo_class": null,
  "hazmat_packing_group": null,
  "consignor_name": "Acme Exports Inc.",
  "consignor_address": "100 Port Road, Jacksonville FL 32201",
  "consignor_contact": "Jane Smith, 904-555-0100",
  "consignee_name": "Caribbean Imports LLC",
  "consignee_address": "45 Dock Street, San Juan PR 00901",
  "consignee_contact": "Carlos Rivera, 787-555-0200",
  "payor_name": "Acme Exports Inc.",
  "payor_address": "100 Port Road, Jacksonville FL 32201",
  "payor_contact": "Jane Smith, 904-555-0100",
  "requested_gate_in_date": "2025-04-12",
  "special_instructions": null
}
```

Required fields: `route`, `voyage_id`, `container_type`, `cargo_description`, `gross_weight`, `weight_unit`, `consignor_name`, `consignor_address`, `consignor_contact`, `consignee_name`, `consignee_address`, `consignee_contact`, `payor_name`, `payor_address`, `payor_contact`, `requested_gate_in_date`.

**Response** `201 Created` — the newly created booking object

**Error Responses**

| Status | Body | Condition |
|---|---|---|
| `400 Bad Request` | `{"error": "Missing required field: <field>"}` | A required field is absent or empty |
| `400 Bad Request` | `{"error": "voyage_id does not exist"}` | The referenced voyage was not found |

---

### `PUT /api/bookings/:id`

Edit an existing booking. Only the fields provided in the request body are updated. The edit/cancel cutoff rule is enforced server-side.

**Editable fields:** `cargo_description`, `gross_weight`, `weight_unit`, `hazmat`, `hazmat_un_number`, `hazmat_imo_class`, `hazmat_packing_group`, `consignor_name`, `consignor_address`, `consignor_contact`, `consignee_name`, `consignee_address`, `consignee_contact`, `payor_name`, `payor_address`, `payor_contact`, `requested_gate_in_date`, `special_instructions`, `container_type`, `voyage_id`, `route`.

**Request Body** — a partial object with any of the editable fields above.

**Response** `200 OK` — the updated booking object

**Error Responses**

| Status | Body | Condition |
|---|---|---|
| `404 Not Found` | `{"error": "Booking not found"}` | No booking with that ID |
| `400 Bad Request` | `{"error": "No editable fields provided"}` | Request body had no recognized editable fields |
| `403 Forbidden` | see below | Cutoff rule violated |

**403 Cutoff Response Example**

```json
{
  "error": "Booking cannot be edited",
  "reason": "Booking status \"Gated In (Origin)\" is past the edit/cancel cutoff (\"Gated In (Origin)\")"
}
```

or

```json
{
  "error": "Booking cannot be edited",
  "reason": "Voyage ETD (2025-04-15T08:00:00.000Z) has already passed"
}
```

---

### `POST /api/bookings/:id/cancel`

Cancel a booking. The cutoff rule is enforced. On success, `current_status` is set to `"Cancelled"`, a `status_history` entry is appended, and the voyage's `available_slots` is incremented by 1.

**Request Body** (optional)

```json
{
  "reason": "Shipment postponed"
}
```

If `reason` is provided, it is stored in the cancellation history entry's `location_name` field prefixed with `"Cancellation reason: "`.

**Response** `200 OK`

```json
{
  "message": "Booking cancelled",
  "booking": { /* updated booking object */ }
}
```

**Error Responses**

| Status | Body | Condition |
|---|---|---|
| `404 Not Found` | `{"error": "Booking not found"}` | No booking with that ID |
| `409 Conflict` | `{"error": "Booking is already cancelled"}` | Booking is already in Cancelled state |
| `403 Forbidden` | `{"error": "Booking cannot be cancelled", "reason": "..."}` | Cutoff rule violated |

---

### `POST /api/bookings/:id/advance-status`

Advance a booking to the next status in the lifecycle pipeline. Appends a `status_history` record and inserts a GPS ping for the new position.

Position logic for the new status entry:
- Statuses at index ≤ 2 ("Gated In (Origin)" and before) → origin port coordinates
- Statuses at index ≥ 6 ("Arrived Destination Port" and after) → destination port coordinates
- Statuses at index 3–5 (loading/at sea) → latest GPS ping coordinates if available, otherwise the geographic midpoint

**Request Body** — none required

**Response** `200 OK`

```json
{
  "message": "Status advanced to \"Documentation Submitted\"",
  "previous_status": "Booking Confirmed",
  "new_status": "Documentation Submitted",
  "booking": { /* updated booking object */ }
}
```

**Error Responses**

| Status | Body | Condition |
|---|---|---|
| `404 Not Found` | `{"error": "Booking not found"}` | No booking with that ID |
| `409 Conflict` | `{"error": "Cannot advance a cancelled booking"}` | Booking is cancelled |
| `409 Conflict` | `{"error": "Booking is already at the final status", "current_status": "Delivered"}` | Booking is already at "Delivered" |

---

## Map

### `GET /api/map/containers`

Returns current position metadata for all non-cancelled bookings. Position is resolved as follows:
- If the booking has GPS pings → latest ping coordinates
- If status is `Arrived Destination Port`, `Customs Cleared`, `Available for Pickup`, or `Delivered` → destination port coordinates
- Otherwise → origin port coordinates

**Response** `200 OK` — array of container position objects:

```json
[
  {
    "id": 7,
    "booking_number": "BKG-2025-0007",
    "container_number": "SWRE4521870",
    "container_type": "40HC",
    "cargo_description": "Electronics",
    "hazmat": false,
    "current_status": "At Sea",
    "route": "JAX-SJU",
    "vessel_name": "MV Atlantic Carrier",
    "voyage_number": "JAX-SJU-002",
    "origin_port": "Jacksonville, FL",
    "origin_lat": 30.3322,
    "origin_lng": -81.6557,
    "destination_port": "San Juan, PR",
    "dest_lat": 18.4655,
    "dest_lng": -66.1057,
    "position": { "lat": 27.9, "lng": -79.5 },
    "position_source": "gps"
  }
]
```

`position_source` values: `"gps"`, `"origin_port"`, `"destination_port"`.

---

### `GET /api/map/pings`

Returns all GPS pings for non-cancelled bookings, grouped by `booking_id`. Used by the map to draw polyline paths without N+1 requests.

**Response** `200 OK`

```json
{
  "7": [
    [27.9, -79.5],
    [25.1, -77.4]
  ],
  "12": [
    [53.0, -131.5],
    [55.8, -130.2]
  ]
}
```

Keys are booking IDs (as strings); values are ordered arrays of `[latitude, longitude]` pairs.

---

## Dashboard

### `GET /api/dashboard`

Returns summary data for the dashboard view: booking counts by status, hazmat summary, and upcoming voyages.

**Response** `200 OK`

```json
{
  "status_counts": [
    { "status": "Booking Confirmed", "count": 3 },
    { "status": "At Sea", "count": 2 },
    { "status": "Delivered", "count": 1 }
  ],
  "hazmat_summary": {
    "hazmat": 4,
    "non_hazmat": 11,
    "total": 15
  },
  "upcoming_voyages": [
    {
      "id": 3,
      "voyage_number": "JAX-SJU-003",
      "vessel_name": "MV Atlantic Carrier",
      "route": "JAX-SJU",
      "origin_port": "Jacksonville, FL",
      "destination_port": "San Juan, PR",
      "etd": "2025-04-28T08:00:00.000Z",
      "eta": "2025-05-01T14:00:00.000Z",
      "capacity": 50,
      "available_slots": 42,
      "status": "Scheduled"
    }
  ]
}
```

`upcoming_voyages` contains voyages with ETD within the next 30 days from the time of the request, ordered by ETD ascending.

---

## Health Check

### `GET /health`

Confirm the server is running. Not under the `/api` prefix.

**Response** `200 OK`

```json
{ "status": "ok", "timestamp": "2025-04-01T12:00:00.000Z" }
```
