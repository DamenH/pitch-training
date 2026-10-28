import { PageModes } from './pageModes.svelte';

/** Anchor: exercises that build one remembered reference note. More modes join Tune later. */
export type AnchorMode = 'tune';

export const anchorModes = new PageModes<AnchorMode>('anchor', ['tune'], { tune: 'Tune' });
