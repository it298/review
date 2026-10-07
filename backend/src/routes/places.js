import { Router } from 'express';
import { trackPlace, listTracked, history, dashboardMatrix, syncAll } from '../services/placeService.js';

import db from '../db/index.js';
import { validateMapsUrl } from '../services/scraperUtils.js';

const router = Router();
router.patch('/:placeId', (req, res) => {
  const row = db.getPlaceById(req.params.placeId);
  if (!row) return res.status(404).json({ error: 'Không tìm thấy địa điểm.' });
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  if (!name || name.length > 200) return res.status(400).json({ error: 'Tên phải dài 1–200 ký tự.' });
  res.json(db.updatePlace(row.id, { name, custom_name: name }));
});
router.delete('/:placeId', (req, res) => {
  const row = db.getPlaceById(req.params.placeId);
  if (!row) return res.status(404).json({ error: 'Không tìm thấy địa điểm.' });
  db.removePlace(row.id);
  res.json({ ok: true });
});

router.get('/', async (_req, res, next) => {
  try { res.json(await listTracked()); } catch (e) { next(e); }
});

router.post('/track', async (req, res, next) => {
  try {
    const { googleMapsUrl, name } = req.body;
    if (typeof googleMapsUrl !== 'string' || !googleMapsUrl.trim()) return res.status(400).json({ error: 'googleMapsUrl is required' });
    if (name !== undefined && (typeof name !== 'string' || name.length > 200)) return res.status(400).json({ error: 'Tên không hợp lệ.' });
    try { validateMapsUrl(googleMapsUrl.trim()); } catch (error) { return res.status(400).json({ error: error.message }); }
    res.json(await trackPlace({ url: googleMapsUrl, name }));
  } catch (e) { next(e); }
});

router.get('/dashboard-matrix', async (_req, res, next) => {
  try { res.json(dashboardMatrix()); } catch (e) { next(e); }
});

router.get('/:placeId/history', async (req, res, next) => {
  try { res.json(await history(req.params.placeId)); } catch (e) { next(e); }
});

router.post('/sync', async (_req, res, next) => {
  try { res.json(await syncAll()); } catch (e) { next(e); }
});

export default router;
