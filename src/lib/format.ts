/** "+12¢" / "−30¢". */
export function signedCents(cents: number): string {
  const r = Math.round(cents);
  return r > 0 ? `+${r}¢` : r < 0 ? `−${-r}¢` : '0¢';
}

/**
 * Phrase a deviation relative to a reference note, e.g. "12¢ sharp of",
 * "in tune with", "≈4 semitones below". The caller appends the note name.
 */
export function describeDeviation(cents: number): string {
  const r = Math.round(cents);
  const abs = Math.abs(r);
  if (abs === 0) return 'exactly on';
  if (abs < 100) return `${abs}¢ ${r > 0 ? 'sharp of' : 'flat of'}`;
  const semis = Math.round(abs / 100);
  return `≈${semis} semitone${semis === 1 ? '' : 's'} (${signedCents(r)}) ${r > 0 ? 'above' : 'below'}`;
}
