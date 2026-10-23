import { playSequence } from '../audio/synth';
import { generateScramble } from '../domain/exercise';
import { midiToFrequency, type PitchClass } from '../domain/music';
import { settings } from './settings.svelte';

/** Seconds between scramble notes, and how long each one sounds: about three seconds in all. */
const STEP = 0.2;
const NOTE = 0.16;

/** True while a scramble is sounding, so singing capture can ignore it. */
export const scramble = $state({ playing: false });
let run = 0;

/**
 * Play a rapid random run that breaks relative pitch before the next question.
 * Any other playback (such as the target note) interrupts it.
 */
export function playScramble(avoid?: PitchClass): Promise<void> {
  const mine = ++run;
  scramble.playing = true;
  const s = settings.value;
  const notes = generateScramble(Math.random, avoid).map(midiToFrequency);
  return playSequence(notes, { duration: NOTE, volume: s.volume, waveform: s.waveform }, 0, STEP).finally(() => {
    if (mine === run) scramble.playing = false;
  });
}
