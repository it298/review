import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { calendarDate } from "../utils/date.js";

dotenv.config();

const configuredPath = process.env.DB_FILE || "./data/places.json";
const dbPath = path.isAbsolute(configuredPath)
  ? configuredPath
  : path.resolve(process.cwd(), configuredPath);

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const empty = { nextPlaceId: 1, nextSnapshotId: 1, places: [], snapshots: [] };

function load() {
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify(empty, null, 2), "utf8");
    return structuredClone(empty);
  }
  try {
    const data = JSON.parse(fs.readFileSync(dbPath, "utf8"));
    return {
      nextPlaceId: data.nextPlaceId ?? 1,
      nextSnapshotId: data.nextSnapshotId ?? 1,
      places: data.places ?? [],
      snapshots: data.snapshots ?? []
    };
  } catch {
    throw new Error(`Cannot read database file: ${dbPath}`);
  }
}

let state = load();

function persist() {
  const tmp = `${dbPath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), "utf8");
  fs.renameSync(tmp, dbPath);
}

const db = {
  getPlaceByGoogleId(placeId) {
    return state.places.find(p => p.place_id === placeId) || null;
  },
  getPlaceByUrl(url) {
    return state.places.find(p => p.google_maps_uri === url) || null;
  },
  getPlaceById(id) {
    return state.places.find(p => p.id === Number(id)) || null;
  },
  listPlaces() {
    return state.places.filter(p => p.tracked === 1);
  },
  insertPlace(data) {
    const now = new Date().toISOString();
    const row = {
      id: state.nextPlaceId++,
      place_id: data.place_id,
      name: data.name,
      custom_name: data.custom_name || null,
      last_sync_at: now,
      last_error: null,
      address: data.address ?? "",
      rating: data.rating ?? null,
      user_rating_count: data.user_rating_count ?? 0,
      google_maps_uri: data.google_maps_uri ?? null,
      tracked: 1,
      created_at: now,
      updated_at: now
    };
    state.places.push(row);
    persist();
    return row;
  },
  updatePlace(id, data) {
    const row = this.getPlaceById(id);
    if (!row) return null;
    Object.assign(row, data, { updated_at: new Date().toISOString() });
    persist();
    return row;
  },
  addSnapshot(placeId, count, rating) {
    const row = {
      id: state.nextSnapshotId++,
      place_id: Number(placeId),
      captured_at: new Date().toISOString(),
      user_rating_count: Number(count ?? 0),
      rating: rating ?? null
    };
    state.snapshots.push(row);
    persist();
    return row;
  },
  upsertTodaySnapshot(placeId, count, rating) {
    const today = calendarDate();
    const existing = state.snapshots
      .filter(s => s.place_id === Number(placeId) && calendarDate(s.captured_at) === today)
      .sort((a, b) => new Date(b.captured_at) - new Date(a.captured_at))[0];

    if (existing) {
      existing.captured_at = new Date().toISOString();
      existing.user_rating_count = Number(count ?? 0);
      existing.rating = rating ?? null;
      persist();
      return existing;
    }

    return db.addSnapshot(placeId, count, rating);
  },
  removePlace(id) {
    state.places = state.places.filter(p => p.id !== Number(id));
    state.snapshots = state.snapshots.filter(s => s.place_id !== Number(id));
    persist();
  },
  history(placeId) {
    return state.snapshots
      .filter(s => s.place_id === Number(placeId))
      .sort((a,b) => new Date(a.captured_at)-new Date(b.captured_at));
  }
};

export default db;
