import { validateScore, type PianoScore } from '../domain/score';
import { STORAGE_PREFIX } from './storageScope';
import { loadJson, saveJson } from './storage';

export interface SavedScore {
  id: string;
  savedAt: number;
  score: PianoScore;
}
const KEY = 'piano-library/v1';
const DB_NAME = `${STORAGE_PREFIX}piano-library`;
const LIMIT = 100;
let database: Promise<IDBDatabase | null> | undefined;

function openDatabase(): Promise<IDBDatabase | null> {
  database ??= new Promise<IDBDatabase | null>((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, 1);
      let blocked = false;
      request.onupgradeneeded = () => request.result.createObjectStore('scores', { keyPath: 'id' });
      request.onsuccess = () => {
        if (blocked) { request.result.close(); return; }
        request.result.onversionchange = () => { request.result.close(); database = undefined; };
        resolve(request.result);
      };
      request.onerror = () => resolve(null);
      request.onblocked = () => { blocked = true; resolve(null); };
    } catch { resolve(null); }
  });
  return database;
}

function localScores(): SavedScore[] {
  const raw = loadJson(KEY);
  return Array.isArray(raw) ? raw : [];
}

export async function listScores(): Promise<SavedScore[]> {
  const db = await openDatabase();
  const raw: SavedScore[] = db ? await new Promise((resolve, reject) => {
    const tx = db.transaction('scores', 'readonly');
    const request = tx.objectStore('scores').getAll();
    tx.oncomplete = () => resolve(request.result);
    tx.onabort = () => reject(new Error('Could not read the piano library.'));
    tx.onerror = () => reject(new Error('Could not read the piano library.'));
  }) : localScores();
  return raw.flatMap((entry) => {
    try {
      if (typeof entry.id !== 'string' || !Number.isFinite(entry.savedAt)) return [];
      return [{ ...entry, score: validateScore(entry.score) }];
    } catch { return []; }
  }).sort((a, b) => b.savedAt - a.savedAt);
}

async function write(entry: SavedScore | string): Promise<void> {
  const db = await openDatabase();
  if (!db) {
    const entries = localScores().filter((e) => e.id !== (typeof entry === 'string' ? entry : entry.id));
    if (typeof entry !== 'string') entries.push(entry);
    if (!saveJson(KEY, entries)) throw new Error('Storage is unavailable or full. Export your score to keep a copy.');
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('scores', 'readwrite');
    const store = tx.objectStore('scores');
    if (typeof entry === 'string') store.delete(entry);
    else store.put(entry);
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(new Error('Could not save the piano library. Storage may be full. Export a copy.'));
    tx.onerror = () => reject(new Error('Could not save the piano library. Export a copy.'));
  });
}

export async function saveScore(score: PianoScore, id?: string): Promise<string> {
  const entries = await listScores();
  if (entries.length >= LIMIT && !entries.some((e) => e.id === id)) throw new Error(`Library limit is ${LIMIT} pieces. Export or delete a piece first.`);
  const key = id ?? crypto.randomUUID();
  await write({ id: key, savedAt: Date.now(), score: validateScore(score) });
  return key;
}

export async function deleteScore(id: string): Promise<void> { await write(id); }
