import type { ExerciseKind } from '../domain/exercise';

export type IdentifyMode = 'notes' | 'octaves' | 'chroma';

const ORDER: readonly IdentifyMode[] = ['notes', 'octaves', 'chroma'];

export function isIdentifyMode(value: string): value is IdentifyMode {
  return (ORDER as readonly string[]).includes(value);
}

/** Each mode has its own shareable route, e.g. `#/identify/octaves`. */
export function identifyHref(mode: IdentifyMode): string {
  return `#/identify/${mode}`;
}

export const IDENTIFY_MODE_LABELS: Record<IdentifyMode, string> = { notes: 'Notes', octaves: 'Octaves', chroma: 'Chroma' };

export const IDENTIFY_MODE_KINDS: Record<IdentifyMode, ExerciseKind> = {
  notes: 'identify',
  octaves: 'identify-octave',
  chroma: 'identify-chroma',
};

export const identifyMode = $state<{ value: IdentifyMode }>({ value: 'notes' });

export function nextIdentifyMode(mode: IdentifyMode): IdentifyMode {
  return ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length]!;
}

/** Switching modes replaces the URL rather than piling up history entries. */
export function setIdentifyMode(mode: IdentifyMode): void {
  identifyMode.value = mode;
  if (location.hash !== identifyHref(mode)) history.replaceState(history.state, '', identifyHref(mode));
}

export function cycleIdentifyMode(): void {
  setIdentifyMode(nextIdentifyMode(identifyMode.value));
}
