import { PageModes } from './pageModes.svelte';

/** Test: see a target and produce it, by singing a note or tapping a tempo. */
export type TestMode = 'sing' | 'tap';

export const testModes = new PageModes<TestMode>('test', ['sing', 'tap'], { sing: 'Sing', tap: 'Tap' });
