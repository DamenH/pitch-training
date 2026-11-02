import { PageModes } from './pageModes.svelte';

/** Tune: turn a sound until it matches one you remember. */
export type TuneMode = 'pitch';

export const tuneModes = new PageModes<TuneMode>('tune', ['pitch'], { pitch: 'Pitch' });
