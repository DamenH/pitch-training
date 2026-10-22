/** Storage namespaces are application conventions, not same-origin security boundaries. */
export function storagePrefix(scope: string): string {
  return `pitch-training:${encodeURIComponent(scope)}:`;
}

export const APP_SCOPE = new URL(import.meta.env.BASE_URL, document.baseURI).pathname;
export const STORAGE_PREFIX = storagePrefix(APP_SCOPE);
