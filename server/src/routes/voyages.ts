import { Router, Request, Response } from 'express';
import { db } from '../db/database';

const router = Router();

// GET /api/voyages  — list all voyages, optional ?route= filter
router.get('/', (req: Request, res: Response) => {
  const { route } = req.query;
  let query = 'SELECT * FROM voyages';
  const params: string[] = [];
  if (typeof route === 'string' && route) {
    query += ' WHERE route = ?';
    params.push(route);
  }
  query += ' ORDER BY etd ASC';
  const rows = db.prepare(query).all(...params);
  res.json(rows);
});

// GET /api/voyages/:id — single voyage detail
router.get('/:id', (req: Request, res: Response) => {
  const voyage = db
    .prepare('SELECT * FROM voyages WHERE id = ?')
    .get(req.params.id);
  if (!voyage) {
    res.status(404).json({ error: 'Voyage not found' });
    return;
  }
  res.json(voyage);
});

export default router;
