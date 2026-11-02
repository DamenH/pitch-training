import { PageModes } from './pageModes.svelte';

/** Tune: turn a sound until it matches one you remember. */
export type TuneMode = 'pitch' | 'tempo';

export const tuneModes = new PageModes<TuneMode>('tune', ['pitch', 'tempo'], { pitch: 'Pitch', tempo: 'Tempo' });
