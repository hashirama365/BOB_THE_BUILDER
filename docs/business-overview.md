# Business Overview — Container Management System

## What the System Does

The Container Management System is a single-user internal web application for booking and tracking ocean freight containers. It covers two fixed trade lanes and manages the full lifecycle of a container booking from initial confirmation through final delivery.

The system serves operational staff who need to:

- Create and manage container bookings for outbound shipments
- Track containers in real time across their voyage
- Monitor the status of all active bookings from a single dashboard
- View container positions on a live map
- Cancel or amend bookings before the operational cutoff

---

## Trade Lanes

### Lane 1 — Jacksonville → San Juan

| Attribute | Value |
|---|---|
| Route code | `JAX-SJU` |
| Origin port | Jacksonville, FL |
| Destination port | San Juan, PR |
| Ocean | Atlantic / Caribbean |

Vessels depart Jacksonville, travel south along the Atlantic coast, and arrive at the Port of San Juan, Puerto Rico.

### Lane 2 — Tacoma → Anchorage

| Attribute | Value |
|---|---|
| Route code | `TAC-ANC` |
| Origin port | Tacoma, WA |
| Destination port | Anchorage, AK |
| Ocean | Pacific / Inside Passage |

Vessels depart Tacoma, travel north along the Pacific coast through the Inside Passage, and arrive at Anchorage, Alaska.

---

## Booking Lifecycle

Every booking passes through a fixed sequence of statuses. The statuses are ordered — a booking always moves forward through the pipeline; it cannot go backwards.

| Step | Status | Meaning |
|---|---|---|
| 0 | **Booking Confirmed** | The booking has been created and is accepted. |
| 1 | **Documentation Submitted** | Shipping documents (bill of lading, manifests) have been submitted. |
| 2 | **Gated In (Origin)** | The container has physically arrived at the origin port terminal. |
| 3 | **Loaded on Vessel** | The container has been lifted onto the vessel. |
| 4 | **Departed Origin Port** | The vessel has departed the origin port. |
| 5 | **At Sea** | The vessel is in transit on open water. |
| 6 | **Arrived Destination Port** | The vessel has arrived at the destination port. |
| 7 | **Customs Cleared** | The container has passed customs inspection at the destination. |
| 8 | **Available for Pickup** | The container has been released and is ready for the consignee to collect. |
| 9 | **Delivered** | The container has been collected by the consignee. Final state. |

In addition to the above, a booking can be moved to **Cancelled** at any point before the operational cutoff (see below). Cancellation is a terminal state — a cancelled booking cannot be re-activated.

---

## Edit and Cancel Eligibility — The Cutoff Rule

Bookings can be edited or cancelled only while **both** of the following conditions are true:

1. **The booking has not yet been gated in at the origin port.** Specifically, the booking's current status must be "Booking Confirmed" or "Documentation Submitted" (i.e., at or before step 2, "Gated In (Origin)"). Once the container has physically arrived at the terminal, the booking is locked.

2. **The vessel has not yet sailed.** The voyage's scheduled departure date (ETD) must still be in the future. If the ship has already departed — even if the container's recorded status has not yet been advanced in the system — the booking becomes locked automatically.

Both conditions must be satisfied. If either is violated, the API returns a `403 Forbidden` response with a plain-language explanation, and the UI displays a lock message instead of edit/cancel buttons.

**In plain terms:** you can change a booking until the container arrives at the terminal, but never after the ship has left.

---

## Glossary

| Term | Definition |
|---|---|
| **Booking** | A reservation of one container slot on a specific voyage. Each booking covers one container. |
| **Voyage** | A scheduled sailing of a named vessel on a specific trade lane, with a defined ETD and ETA. |
| **Container Number** | A unique identifier for a physical container. Format: `SWRE` + 6-digit serial + 1 check digit (e.g. `SWRE4521870`). Based on the ISO 6346 standard for owner code + serial + check digit. |
| **Booking Number** | A unique reference for a booking. Format: `BKG-YYYY-NNNN` (e.g. `BKG-2025-0001`). Auto-generated on booking creation. |
| **Container Type** | The ISO size/type code for the physical container. Supported types: `20GP` (20-foot general purpose), `40GP`, `40HC` (high-cube), `45HC`, `20RF` (refrigerated), `40RF`. |
| **ISO 6346** | The international standard governing container identification, covering owner code, equipment category, serial number, and check digit. |
| **Consignor** | The shipper — the party sending the goods. Provides name, address, and contact details. |
| **Consignee** | The receiver — the party to whom the goods are being shipped. Provides name, address, and contact details. |
| **Payor** | The party responsible for freight charges. May be the same as the consignor. A "Same as Consignor" shortcut is available in the booking form. |
| **Hazmat** | Hazardous materials. When a booking is marked hazmat, three additional fields are required: UN number, IMO class, and packing group. |
| **UN Number** | A 4-digit United Nations number identifying the specific hazardous substance (e.g. UN1263 for paint). |
| **IMO Class** | The International Maritime Organization dangerous goods class (e.g. Class 3 for flammable liquids). |
| **Packing Group** | Indicates the degree of danger: I (great danger), II (medium danger), III (minor danger). |
| **ETD** | Estimated Time of Departure — the scheduled sailing date/time of the vessel from the origin port. |
| **ETA** | Estimated Time of Arrival — the expected arrival date/time of the vessel at the destination port. |
| **Gated In** | The event when a container physically arrives at the port terminal gate and is checked in. Triggers the edit/cancel cutoff. |
| **Gated Out** | The event when a container leaves the destination terminal after delivery (not tracked as a separate status in this system; "Delivered" serves as the final state). |
| **Available Slots** | The number of remaining container slots on a voyage. Decremented when a booking is created; incremented when a booking is cancelled. |
| **Status History** | A time-ordered audit trail of every status transition a booking has passed through, including timestamps and geographic coordinates. |
| **GPS Ping** | A timestamped latitude/longitude record from a container's tracking device while the vessel is at sea. Used to draw the container's travel path on the map. |
| **Trade Lane** | A fixed origin-to-destination route operated regularly by the carrier. This system operates two trade lanes. |
