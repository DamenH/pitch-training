// localStorage wrapper that never throws (private mode, quota, disabled storage).

import { STORAGE_PREFIX as PREFIX } from './storageScope';

// Copy this app's legacy data once. Never clear origin-wide storage or remove
// legacy keys that another already-open installation may still be using.
try {
  const marker = `${PREFIX}legacy-copied/v1`;
  if (localStorage.getItem(marker) === null) {
    for (const key of ['settings/v1', 'history/v1']) {
      const previous = localStorage.getItem(`pitch-training:${key}`);
      if (previous !== null && localStorage.getItem(PREFIX + key) === null) localStorage.setItem(PREFIX + key, previous);
    }
    localStorage.setItem(marker, 'true');
  }
} catch { /* Storage may be disabled; the app still runs in memory. */ }

export function loadJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? undefined : (JSON.parse(raw) as unknown);
  } catch {
    return undefined;
  }
}

export function saveJson(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeKey(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // ignore
  }
}
