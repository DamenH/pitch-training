import type { ExerciseKind } from '../domain/exercise';

export type IdentifyMode = 'notes' | 'octaves' | 'chroma';

const ORDER: readonly IdentifyMode[] = ['notes', 'octaves', 'chroma'];

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

export function cycleIdentifyMode(): void {
  identifyMode.value = nextIdentifyMode(identifyMode.value);
}
