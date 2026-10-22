import { HISTORY_LIMIT, sanitizeHistory, type HistoryEntry } from '../domain/history';
import { loadJson, removeKey, saveJson } from './storage';
import { settings } from './settings.svelte';

const KEY = 'history/v1';

class HistoryStore {
  entries = $state<HistoryEntry[]>(sanitizeHistory(loadJson(KEY)));

  /** Records only when history tracking is enabled. */
  add(entry: HistoryEntry): void {
    if (!settings.value.historyEnabled) return;
    const next = [...this.entries, entry];
    this.entries = next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
    saveJson(KEY, this.entries);
  }

  clear(): void {
    this.entries = [];
    removeKey(KEY);
  }
}

export const history = new HistoryStore();
