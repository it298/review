import db from "../db/index.js";
import { scrapeGoogleMaps } from "./googleMapsScraper.js";

import { calendarDate } from "../utils/date.js";
import { workerCount, mapsIdentity } from "./scraperUtils.js";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function normalizeUrl(url) {
  return String(url || '').trim();
}

function saveSnapshot(row) {
  // One snapshot per place per calendar day. If the job runs twice,
  // update today's value instead of creating duplicate rows.
  return db.upsertTodaySnapshot(row.id, row.user_rating_count, row.rating);
}

function toPublic(row) {
  return { ...row };
}

export async function trackPlace({ url, name }) {
  const googleMapsUrl = normalizeUrl(url);
  if (!googleMapsUrl) throw new Error('googleMapsUrl is required');

  const fresh = await scrapeGoogleMaps(googleMapsUrl);
  const identity = mapsIdentity(fresh.url);
  let row = db.getPlaceByGoogleId(identity) || db.getPlaceByUrl(googleMapsUrl) || db.getPlaceByUrl(fresh.url)
    || db.listPlaces().find(p => { try { return mapsIdentity(p.google_maps_uri) === identity; } catch { return false; } });

  if (row) {
    row = db.updatePlace(row.id, {
      name: name?.trim() || row.custom_name || fresh.name || row.name,
      custom_name: name?.trim() || row.custom_name || null,
      last_sync_at: new Date().toISOString(),
      last_error: null,
      place_id: identity,
      rating: fresh.rating,
      user_rating_count: fresh.reviewCount,
      google_maps_uri: fresh.url || row.google_maps_uri || googleMapsUrl,
      tracked: 1
    });
  } else {
    row = db.insertPlace({
      place_id: identity,
      name: name?.trim() || fresh.name,
      custom_name: name?.trim() || null,
      address: fresh.address || '',
      rating: fresh.rating,
      user_rating_count: fresh.reviewCount,
      google_maps_uri: fresh.url || googleMapsUrl
    });
  }

  saveSnapshot(row);
  return row;
}

export function listTracked() {
  const cutoff = Date.now() - WEEK_MS;

  return db.listPlaces().map(p => {
    const old = db.history(p.id)
      .filter(s => new Date(s.captured_at).getTime() <= cutoff)
      .sort((a, b) => new Date(b.captured_at) - new Date(a.captured_at))[0];

    return {
      ...toPublic(p),
      comparisonCapturedAt: old?.captured_at ?? null,
      reviewsSinceBaseline: old ? p.user_rating_count - old.user_rating_count : null
    };
  }).sort((a, b) =>
    (b.reviewsSinceBaseline ?? -1) - (a.reviewsSinceBaseline ?? -1) ||
    a.name.localeCompare(b.name)
  );
}

export function history(placeId) {
  const row = db.getPlaceById(placeId);
  if (!row) throw Object.assign(new Error('Không tìm thấy địa điểm.'), { status: 404 });
  return db.history(row.id).map(s => ({
    capturedAt: s.captured_at,
    userRatingCount: s.user_rating_count,
    rating: s.rating
  }));
}

export function dashboardMatrix() {
  const places = db.listPlaces().map(p => ({
    id: p.id,
    name: p.name,
    rating: p.rating,
    googleMapsUri: p.google_maps_uri,
    snapshots: db.history(p.id).map(s => ({
      date: calendarDate(s.captured_at),
      capturedAt: s.captured_at,
      reviews: s.user_rating_count,
      rating: s.rating
    }))
  }));

  const dateMap = new Map();
  for (const place of places) {
    for (const s of place.snapshots) {
      const current = dateMap.get(s.date) || {};
      current[place.id] = s;
      dateMap.set(s.date, current);
    }
  }

  const dates = [...dateMap.keys()].sort((a, b) => a.localeCompare(b));
  return { places, dates, rows: dates.map(date => ({ date, values: dateMap.get(date) })) };
}

async function syncOne(existing, attempt = 1) {
  try {
    const fresh = await scrapeGoogleMaps(existing.google_maps_uri);
    const current = db.getPlaceById(existing.id);
    if (!current) return { ok: false, placeId: existing.id, name: existing.name, error: 'Địa điểm đã bị xóa trong lúc đồng bộ.' };
    const updated = db.updatePlace(existing.id, {
      name: current.custom_name || fresh.name || current.name,
      last_sync_at: new Date().toISOString(),
      last_error: null,
      address: fresh.address || existing.address || '',
      rating: fresh.rating,
      user_rating_count: fresh.reviewCount,
      google_maps_uri: fresh.url || existing.google_maps_uri
    });
    saveSnapshot(updated);
    return {
      ok: true,
      placeId: existing.id,
      name: updated.name,
      userRatingCount: fresh.reviewCount,
      rating: fresh.rating,
      source: fresh.source
    };
  } catch (error) {
    if (attempt < 2) {
      await new Promise(resolve => setTimeout(resolve, 1200 * attempt));
      return syncOne(existing, attempt + 1);
    }
    db.updatePlace(existing.id, { last_error: error.message });
    return { ok: false, placeId: existing.id, name: existing.name, error: error.message };
  }
}

let syncRunning = false;

export async function syncAll() {
  if (syncRunning) return { skipped: true, reason: 'A sync is already running.' };
  syncRunning = true;

  try {
    const places = db.listPlaces();
    const workers = workerCount(process.env.SCRAPER_WORKERS, places.length);
    const queue = [...places];
    const results = [];

    // Small worker pool: avoids launching hundreds of Maps pages at once.
    async function worker() {
      while (queue.length) {
        const existing = queue.shift();
        if (!existing) return;
        results.push(await syncOne(existing));
      }
    }

    await Promise.all(Array.from({ length: workers }, worker));
    results.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    return { skipped: false, workers, total: places.length, results };
  } finally {
    syncRunning = false;
  }
}
