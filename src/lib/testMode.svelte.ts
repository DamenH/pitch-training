import { PageModes } from './pageModes.svelte';

/** Test: see a target and produce it. */
export type TestMode = 'sing';

export const testModes = new PageModes<TestMode>('test', ['sing'], { sing: 'Sing' });
