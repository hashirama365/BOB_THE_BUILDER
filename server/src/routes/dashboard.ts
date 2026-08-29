import { Router, Request, Response } from 'express';
import { db } from '../db/database';

const router = Router();

// GET /api/dashboard
// Returns: counts by status, hazmat vs non-hazmat counts, upcoming voyages (ETD within next 30 days)
router.get('/', (_req: Request, res: Response) => {
  // Counts by status
  const statusCounts = db.prepare(`
    SELECT current_status AS status, COUNT(*) AS count
    FROM bookings
    GROUP BY current_status
  `).all() as { status: string; count: number }[];

  // Hazmat counts
  const hazmatRow = db.prepare(`
    SELECT
      SUM(CASE WHEN hazmat = 1 THEN 1 ELSE 0 END)    AS hazmat_count,
      SUM(CASE WHEN hazmat = 0 THEN 1 ELSE 0 END)    AS non_hazmat_count,
      COUNT(*)                                         AS total_count
    FROM bookings
  `).get() as { hazmat_count: number; non_hazmat_count: number; total_count: number };

  // Upcoming voyages: ETD within the next 30 days from now
  const now = new Date().toISOString();
  const in30 = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const upcomingVoyages = db.prepare(`
    SELECT
      id, voyage_number, vessel_name, route,
      origin_port, destination_port,
      etd, eta, capacity, available_slots, status
    FROM voyages
    WHERE etd >= ? AND etd <= ?
    ORDER BY etd ASC
  `).all(now, in30);

  res.json({
    status_counts: statusCounts,
    hazmat_summary: {
      hazmat: hazmatRow.hazmat_count ?? 0,
      non_hazmat: hazmatRow.non_hazmat_count ?? 0,
      total: hazmatRow.total_count ?? 0,
    },
    upcoming_voyages: upcomingVoyages,
  });
});

export default router;
