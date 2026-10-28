import type { ExerciseKind } from '../domain/exercise';
import { PageModes } from './pageModes.svelte';

export type IdentifyMode = 'notes' | 'octaves' | 'chroma';

export const identifyModes = new PageModes<IdentifyMode>('identify', ['notes', 'octaves', 'chroma'], {
  notes: 'Notes',
  octaves: 'Octaves',
  chroma: 'Chroma',
});

export const IDENTIFY_MODE_KINDS: Record<IdentifyMode, ExerciseKind> = {
  notes: 'identify',
  octaves: 'identify-octave',
  chroma: 'identify-chroma',
};
