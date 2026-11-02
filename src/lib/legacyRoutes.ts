/** Tabs renamed since links to them were shared: old name → new route and its first mode. */
const RENAMED: Record<string, { route: string; modes: Record<string, string>; fallback: string }> = {
  anchor: { route: 'tune', modes: { tune: 'pitch' }, fallback: 'pitch' },
  'sing-test': { route: 'test', modes: {}, fallback: 'sing' },
};

/** The current hash for a link to a renamed tab, e.g. `#/anchor/tune` → `#/tune/pitch`; null if it isn't one. */
export function upgradeLegacyHash(hash: string): string | null {
  const [path = '', query] = hash.replace(/^#\/?/, '').split('?');
  const [name = '', mode = ''] = path.split('/');
  const renamed = RENAMED[name];
  if (!renamed) return null;
  return `#/${renamed.route}/${renamed.modes[mode] ?? renamed.fallback}${query === undefined ? '' : `?${query}`}`;
}
