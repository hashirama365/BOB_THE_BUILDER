import { Router, Request, Response } from 'express';
import { db } from '../db/database';

const router = Router();

// ─────────────────────────────────────────────
// Status lifecycle pipeline (Section 1.3)
// ─────────────────────────────────────────────
const LIFECYCLE = [
  'Booking Confirmed',
  'Documentation Submitted',
  'Gated In (Origin)',
  'Loaded on Vessel',
  'Departed Origin Port',
  'At Sea',
  'Arrived Destination Port',
  'Customs Cleared',
  'Available for Pickup',
  'Delivered',
];

// Cutoff rule: edit/cancel allowed only if:
//   1. voyage ETD is in the future AND
//   2. current_status is at or before "Gated In (Origin)" (index 2)
const CUTOFF_STATUS_INDEX = LIFECYCLE.indexOf('Gated In (Origin)'); // 2

function checkCutoff(booking: any, voyage: any): { allowed: boolean; reason?: string } {
  const now = new Date();
  const etd = new Date(voyage.etd);
  if (etd <= now) {
    return { allowed: false, reason: `Voyage ETD (${voyage.etd}) has already passed` };
  }
  const statusIdx = LIFECYCLE.indexOf(booking.current_status);
  if (statusIdx > CUTOFF_STATUS_INDEX) {
    return {
      allowed: false,
      reason: `Booking status "${booking.current_status}" is past the edit/cancel cutoff ("Gated In (Origin)")`,
    };
  }
  return { allowed: true };
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/** Auto-generate booking number BKG-YYYY-NNNN */
function generateBookingNumber(): string {
  const year = new Date().getFullYear();
  const row = db
    .prepare(`SELECT COUNT(*) AS cnt FROM bookings WHERE booking_number LIKE ?`)
    .get(`BKG-${year}-%`) as { cnt: number };
  const seq = String(row.cnt + 1).padStart(4, '0');
  return `BKG-${year}-${seq}`;
}

/** Auto-generate ISO 6346-style container number.
 *  Format: XXXX NNNNNN C  (owner 4-alpha + 6-digit serial + 1-digit check)
 *  We use a simplified but realistic-looking format: SWRE + 6 digits + check digit 0–9
 */
function generateContainerNumber(): string {
  const serial = String(Math.floor(Math.random() * 900000) + 100000);
  const check = String(Math.floor(Math.random() * 10));
  return `SWRE${serial}${check}`;
}

// ─────────────────────────────────────────────
// GET /api/bookings
// Query params: route, status, hazmat, container_type, date_from, date_to
// ─────────────────────────────────────────────
router.get('/', (req: Request, res: Response) => {
  const { route, status, hazmat, container_type, date_from, date_to } = req.query;

  let query = `
    SELECT b.*, v.voyage_number, v.vessel_name, v.etd, v.eta
    FROM bookings b
    JOIN voyages v ON v.id = b.voyage_id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (typeof route === 'string' && route) {
    query += ' AND b.route = ?';
    params.push(route);
  }
  if (typeof status === 'string' && status) {
    query += ' AND b.current_status = ?';
    params.push(status);
  }
  if (typeof hazmat === 'string' && hazmat !== '') {
    query += ' AND b.hazmat = ?';
    params.push(hazmat === 'true' || hazmat === '1' ? 1 : 0);
  }
  if (typeof container_type === 'string' && container_type) {
    query += ' AND b.container_type = ?';
    params.push(container_type);
  }
  if (typeof date_from === 'string' && date_from) {
    query += ' AND b.booking_date >= ?';
    params.push(date_from);
  }
  if (typeof date_to === 'string' && date_to) {
    query += ' AND b.booking_date <= ?';
    params.push(date_to);
  }

  query += ' ORDER BY b.booking_date DESC';
  const rows = db.prepare(query).all(...params);
  res.json(rows);
});

// ─────────────────────────────────────────────
// GET /api/bookings/:id — detail with status_history and gps_pings
// ─────────────────────────────────────────────
router.get('/:id', (req: Request, res: Response) => {
  const booking = db.prepare(`
    SELECT b.*, v.voyage_number, v.vessel_name, v.route AS voyage_route,
           v.etd, v.eta, v.origin_port, v.origin_lat, v.origin_lng,
           v.destination_port, v.dest_lat, v.dest_lng
    FROM bookings b
    JOIN voyages v ON v.id = b.voyage_id
    WHERE b.id = ?
  `).get(req.params.id) as any;

  if (!booking) {
    res.status(404).json({ error: 'Booking not found' });
    return;
  }

  const statusHistory = db.prepare(`
    SELECT * FROM status_history WHERE booking_id = ? ORDER BY timestamp ASC
  `).all(req.params.id);

  const gpsPings = db.prepare(`
    SELECT * FROM gps_pings WHERE booking_id = ? ORDER BY timestamp ASC
  `).all(req.params.id);

  res.json({ ...booking, status_history: statusHistory, gps_pings: gpsPings });
});

// ─────────────────────────────────────────────
// POST /api/bookings — create booking
// ─────────────────────────────────────────────
router.post('/', (req: Request, res: Response) => {
  const {
    route, voyage_id,
    container_type, cargo_description,
    gross_weight, weight_unit,
    hazmat, hazmat_un_number, hazmat_imo_class, hazmat_packing_group,
    consignor_name, consignor_address, consignor_contact,
    consignee_name, consignee_address, consignee_contact,
    payor_name, payor_address, payor_contact,
    requested_gate_in_date, special_instructions,
  } = req.body;

  // Basic required-field validation
  const required = [
    'route', 'voyage_id', 'container_type', 'cargo_description',
    'gross_weight', 'weight_unit',
    'consignor_name', 'consignor_address', 'consignor_contact',
    'consignee_name', 'consignee_address', 'consignee_contact',
    'payor_name', 'payor_address', 'payor_contact',
    'requested_gate_in_date',
  ];
  for (const field of required) {
    if (req.body[field] === undefined || req.body[field] === null || req.body[field] === '') {
      res.status(400).json({ error: `Missing required field: ${field}` });
      return;
    }
  }

  // Verify voyage exists
  const voyage = db.prepare('SELECT * FROM voyages WHERE id = ?').get(voyage_id) as any;
  if (!voyage) {
    res.status(400).json({ error: 'voyage_id does not exist' });
    return;
  }

  const booking_number = generateBookingNumber();
  const container_number = generateContainerNumber();
  const booking_date = new Date().toISOString();
  const initial_status = 'Booking Confirmed';

  const insert = db.prepare(`
    INSERT INTO bookings (
      booking_number, route, voyage_id,
      container_type, container_number, cargo_description,
      gross_weight, weight_unit,
      hazmat, hazmat_un_number, hazmat_imo_class, hazmat_packing_group,
      consignor_name, consignor_address, consignor_contact,
      consignee_name, consignee_address, consignee_contact,
      payor_name, payor_address, payor_contact,
      current_status, booking_date, requested_gate_in_date, special_instructions
    ) VALUES (
      @booking_number, @route, @voyage_id,
      @container_type, @container_number, @cargo_description,
      @gross_weight, @weight_unit,
      @hazmat, @hazmat_un_number, @hazmat_imo_class, @hazmat_packing_group,
      @consignor_name, @consignor_address, @consignor_contact,
      @consignee_name, @consignee_address, @consignee_contact,
      @payor_name, @payor_address, @payor_contact,
      @current_status, @booking_date, @requested_gate_in_date, @special_instructions
    )
  `);

  const result = insert.run({
    booking_number, route, voyage_id,
    container_type, container_number, cargo_description,
    gross_weight, weight_unit: weight_unit ?? 'KG',
    hazmat: hazmat ? 1 : 0,
    hazmat_un_number: hazmat_un_number ?? null,
    hazmat_imo_class: hazmat_imo_class ?? null,
    hazmat_packing_group: hazmat_packing_group ?? null,
    consignor_name, consignor_address, consignor_contact,
    consignee_name, consignee_address, consignee_contact,
    payor_name, payor_address, payor_contact,
    current_status: initial_status,
    booking_date,
    requested_gate_in_date,
    special_instructions: special_instructions ?? null,
  });

  const newId = result.lastInsertRowid as number;

  // Seed initial status_history entry
  db.prepare(`
    INSERT INTO status_history (booking_id, status, timestamp, location_name, latitude, longitude)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    newId,
    initial_status,
    booking_date,
    voyage.origin_port,
    voyage.origin_lat,
    voyage.origin_lng,
  );

  const created = db.prepare('SELECT * FROM bookings WHERE id = ?').get(newId);
  res.status(201).json(created);
});

// ─────────────────────────────────────────────
// PUT /api/bookings/:id — edit booking (cutoff enforced)
// ─────────────────────────────────────────────
router.put('/:id', (req: Request, res: Response) => {
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id) as any;
  if (!booking) {
    res.status(404).json({ error: 'Booking not found' });
    return;
  }

  const voyage = db.prepare('SELECT * FROM voyages WHERE id = ?').get(booking.voyage_id) as any;
  const cutoff = checkCutoff(booking, voyage);
  if (!cutoff.allowed) {
    res.status(403).json({ error: 'Booking cannot be edited', reason: cutoff.reason });
    return;
  }

  // Editable fields — only update fields explicitly provided in the body
  const editable = [
    'cargo_description', 'gross_weight', 'weight_unit',
    'hazmat', 'hazmat_un_number', 'hazmat_imo_class', 'hazmat_packing_group',
    'consignor_name', 'consignor_address', 'consignor_contact',
    'consignee_name', 'consignee_address', 'consignee_contact',
    'payor_name', 'payor_address', 'payor_contact',
    'requested_gate_in_date', 'special_instructions',
    'container_type', 'voyage_id', 'route',
  ];

  const updates: string[] = [];
  const values: any[] = [];

  for (const field of editable) {
    if (req.body[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(field === 'hazmat' ? (req.body[field] ? 1 : 0) : req.body[field]);
    }
  }

  if (updates.length === 0) {
    res.status(400).json({ error: 'No editable fields provided' });
    return;
  }

  values.push(req.params.id);
  db.prepare(`UPDATE bookings SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  const updated = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// ─────────────────────────────────────────────
// POST /api/bookings/:id/cancel — cancel booking (cutoff enforced)
// ─────────────────────────────────────────────
router.post('/:id/cancel', (req: Request, res: Response) => {
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id) as any;
  if (!booking) {
    res.status(404).json({ error: 'Booking not found' });
    return;
  }

  if (booking.current_status === 'Cancelled') {
    res.status(409).json({ error: 'Booking is already cancelled' });
    return;
  }

  const voyage = db.prepare('SELECT * FROM voyages WHERE id = ?').get(booking.voyage_id) as any;
  const cutoff = checkCutoff(booking, voyage);
  if (!cutoff.allowed) {
    res.status(403).json({ error: 'Booking cannot be cancelled', reason: cutoff.reason });
    return;
  }

  const reason: string = req.body?.reason ?? '';
  const now = new Date().toISOString();

  // Update booking status
  db.prepare(`UPDATE bookings SET current_status = 'Cancelled' WHERE id = ?`).run(req.params.id);

  // Append status_history entry
  db.prepare(`
    INSERT INTO status_history (booking_id, status, timestamp, location_name, latitude, longitude)
    VALUES (?, 'Cancelled', ?, ?, ?, ?)
  `).run(
    req.params.id,
    now,
    reason ? `Cancellation reason: ${reason}` : voyage.origin_port,
    voyage.origin_lat,
    voyage.origin_lng,
  );

  // Return one available slot to voyage
  db.prepare(`
    UPDATE voyages SET available_slots = available_slots + 1 WHERE id = ?
  `).run(booking.voyage_id);

  const updated = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
  res.json({ message: 'Booking cancelled', booking: updated });
});

// ─────────────────────────────────────────────
// POST /api/bookings/:id/advance-status
// Advances to next lifecycle status, appends history, updates latest GPS position
// ─────────────────────────────────────────────
router.post('/:id/advance-status', (req: Request, res: Response) => {
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id) as any;
  if (!booking) {
    res.status(404).json({ error: 'Booking not found' });
    return;
  }

  if (booking.current_status === 'Cancelled') {
    res.status(409).json({ error: 'Cannot advance a cancelled booking' });
    return;
  }

  const currentIdx = LIFECYCLE.indexOf(booking.current_status);
  if (currentIdx === -1 || currentIdx === LIFECYCLE.length - 1) {
    res.status(409).json({
      error: 'Booking is already at the final status',
      current_status: booking.current_status,
    });
    return;
  }

  const nextStatus = LIFECYCLE[currentIdx + 1];
  const now = new Date().toISOString();

  // Determine location for the new status entry
  const voyage = db.prepare('SELECT * FROM voyages WHERE id = ?').get(booking.voyage_id) as any;

  let locationName: string;
  let lat: number;
  let lng: number;

  // Indices 0–2: origin port; 3–5: at sea (midpoint); 6+: destination port
  const nextIdx = currentIdx + 1;
  if (nextIdx <= 2) {
    locationName = voyage.origin_port;
    lat = voyage.origin_lat;
    lng = voyage.origin_lng;
  } else if (nextIdx >= 6) {
    locationName = voyage.destination_port;
    lat = voyage.dest_lat;
    lng = voyage.dest_lng;
  } else {
    // At sea — use latest GPS ping if available, else midpoint
    const latestPing = db.prepare(`
      SELECT latitude, longitude FROM gps_pings
      WHERE booking_id = ?
      ORDER BY timestamp DESC
      LIMIT 1
    `).get(req.params.id) as any;

    if (latestPing) {
      lat = latestPing.latitude;
      lng = latestPing.longitude;
    } else {
      lat = (voyage.origin_lat + voyage.dest_lat) / 2;
      lng = (voyage.origin_lng + voyage.dest_lng) / 2;
    }
    locationName = 'At Sea';
  }

  // Update booking's current_status
  db.prepare(`UPDATE bookings SET current_status = ? WHERE id = ?`).run(nextStatus, req.params.id);

  // Append status_history
  db.prepare(`
    INSERT INTO status_history (booking_id, status, timestamp, location_name, latitude, longitude)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(req.params.id, nextStatus, now, locationName, lat, lng);

  // Insert a GPS ping to record the new position
  db.prepare(`
    INSERT INTO gps_pings (booking_id, container_number, latitude, longitude, timestamp, status_at_ping)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(req.params.id, booking.container_number, lat, lng, now, nextStatus);

  const updated = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
  res.json({
    message: `Status advanced to "${nextStatus}"`,
    previous_status: booking.current_status,
    new_status: nextStatus,
    booking: updated,
  });
});

export default router;
