import { toPitchClass, type PitchClass } from '../domain/music';

const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Ignore shortcuts while typing in a form control or when a modifier is held. */
export function shouldIgnoreShortcut(e: KeyboardEvent): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return true;
  const t = e.target;
  if (!(t instanceof HTMLElement)) return false;
  if (t instanceof HTMLInputElement) return t.type !== 'radio' && t.type !== 'checkbox';
  return t.isContentEditable || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement;
}

/** Letter A–G selects a natural; Shift + letter selects the note a semitone above (C♯ = D♭). */
export function pitchClassFromKey(e: KeyboardEvent): PitchClass | null {
  if (e.key.length !== 1) return null;
  const base = LETTER_PC[e.key.toUpperCase()];
  if (base === undefined) return null;
  return toPitchClass(base + (e.shiftKey ? 1 : 0));
}

/** Piano-style layout for the reference keyboard: A W S E D F T G Y H U J = C … B. */
const PIANO_CODES = ['KeyA', 'KeyW', 'KeyS', 'KeyE', 'KeyD', 'KeyF', 'KeyT', 'KeyG', 'KeyY', 'KeyH', 'KeyU', 'KeyJ'];

export function pianoPitchClassFromKey(e: KeyboardEvent): PitchClass | null {
  const i = PIANO_CODES.indexOf(e.code);
  return i === -1 ? null : toPitchClass(i);
}
