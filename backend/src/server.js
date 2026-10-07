import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import placesRouter from './routes/places.js';
import { startReviewSync } from './jobs/reviewSync.js';

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 4000);

app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/places', placesRouter);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

startReviewSync();

app.listen(port, process.env.HOST || '127.0.0.1', () => {
  console.log(`Backend running at http://localhost:${port}`);
});
