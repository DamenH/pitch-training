import type { ExerciseKind } from '../domain/exercise';
import { PageModes } from './pageModes.svelte';

export type IdentifyMode = 'notes' | 'octaves' | 'chroma' | 'tempo';

export const identifyModes = new PageModes<IdentifyMode>('identify', ['notes', 'octaves', 'chroma', 'tempo'], {
  notes: 'Notes',
  octaves: 'Octaves',
  chroma: 'Chroma',
  tempo: 'Tempo',
});

/** The pitch modes' exercise kinds; Tempo has its own page. */
export const IDENTIFY_MODE_KINDS: Record<Exclude<IdentifyMode, 'tempo'>, ExerciseKind> = {
  notes: 'identify',
  octaves: 'identify-octave',
  chroma: 'identify-chroma',
};
