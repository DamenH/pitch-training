import { defaultSettings, sanitizeSettings, type Settings } from '../domain/settings';
import { loadJson, saveJson } from './storage';

const KEY = 'settings/v1';

class SettingsStore {
  value = $state<Settings>(sanitizeSettings(loadJson(KEY)));

  update(patch: Partial<Settings>): void {
    this.value = sanitizeSettings({ ...this.value, ...patch });
    saveJson(KEY, this.value);
  }

  reset(): void {
    this.value = defaultSettings();
    saveJson(KEY, this.value);
  }
}

export const settings = new SettingsStore();
