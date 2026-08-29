import express from 'express';
import cors from 'cors';

import voyagesRouter from './routes/voyages';
import bookingsRouter from './routes/bookings';
import mapRouter from './routes/map';
import dashboardRouter from './routes/dashboard';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/voyages', voyagesRouter);
app.use('/api/bookings', bookingsRouter);
app.use('/api/map', mapRouter);
app.use('/api/dashboard', dashboardRouter);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

export default app;
