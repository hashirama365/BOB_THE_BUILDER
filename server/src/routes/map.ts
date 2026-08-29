import { Router, Request, Response } from 'express';
import { db } from '../db/database';

const router = Router();

// GET /api/map/containers
// Returns current position + metadata for all non-cancelled bookings.
// Position logic:
//   - If booking has GPS pings (At Sea / in-transit), use latest ping.
//   - Otherwise use origin port coords (not yet departed) or dest port coords (Delivered/Available for Pickup).
router.get('/containers', (_req: Request, res: Response) => {
  const AT_DEST_STATUSES = new Set([
    'Arrived Destination Port',
    'Customs Cleared',
    'Available for Pickup',
    'Delivered',
  ]);

  const bookings = db.prepare(`
    SELECT
      b.id, b.booking_number, b.container_number, b.container_type,
      b.cargo_description, b.hazmat, b.current_status, b.route,
      v.origin_port, v.origin_lat, v.origin_lng,
      v.destination_port, v.dest_lat, v.dest_lng,
      v.vessel_name, v.voyage_number
    FROM bookings b
    JOIN voyages v ON v.id = b.voyage_id
    WHERE b.current_status != 'Cancelled'
  `).all() as any[];

  const result = bookings.map((b) => {
    // Latest GPS ping
    const latestPing = db.prepare(`
      SELECT latitude, longitude, timestamp, status_at_ping
      FROM gps_pings
      WHERE booking_id = ?
      ORDER BY timestamp DESC
      LIMIT 1
    `).get(b.id) as any;

    let lat: number;
    let lng: number;
    let positionSource: string;

    if (latestPing) {
      lat = latestPing.latitude;
      lng = latestPing.longitude;
      positionSource = 'gps';
    } else if (AT_DEST_STATUSES.has(b.current_status)) {
      lat = b.dest_lat;
      lng = b.dest_lng;
      positionSource = 'destination_port';
    } else {
      lat = b.origin_lat;
      lng = b.origin_lng;
      positionSource = 'origin_port';
    }

    return {
      id: b.id,
      booking_number: b.booking_number,
      container_number: b.container_number,
      container_type: b.container_type,
      cargo_description: b.cargo_description,
      hazmat: b.hazmat === 1,
      current_status: b.current_status,
      route: b.route,
      vessel_name: b.vessel_name,
      voyage_number: b.voyage_number,
      origin_port: b.origin_port,
      origin_lat: b.origin_lat,
      origin_lng: b.origin_lng,
      destination_port: b.destination_port,
      dest_lat: b.dest_lat,
      dest_lng: b.dest_lng,
      position: { lat, lng },
      position_source: positionSource,
    };
  });

  res.json(result);
});

// GET /api/map/pings
// Returns all GPS pings for non-cancelled bookings, grouped by booking_id.
// Used by the map to draw polylines without N+1 requests.
router.get('/pings', (_req: Request, res: Response) => {
  const rows = db.prepare(`
    SELECT g.booking_id, g.latitude, g.longitude, g.timestamp
    FROM gps_pings g
    JOIN bookings b ON b.id = g.booking_id
    WHERE b.current_status != 'Cancelled'
    ORDER BY g.booking_id, g.timestamp ASC
  `).all() as { booking_id: number; latitude: number; longitude: number; timestamp: string }[];

  // Group into a map: booking_id -> [[lat, lng], ...]
  const grouped: Record<number, [number, number][]> = {};
  for (const r of rows) {
    if (!grouped[r.booking_id]) grouped[r.booking_id] = [];
    grouped[r.booking_id].push([r.latitude, r.longitude]);
  }

  res.json(grouped);
});

export default router;
