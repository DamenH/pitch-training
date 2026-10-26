import { describe, expect, it } from 'vitest';
import {
  defaultSettings,
  normalizeVocalRange,
  sanitizeSettings,
  togglePitchClass,
  visibleOctaves,
  VOCAL_MIN_SPAN,
} from '../src/domain/settings';
import { entryFromResult, sanitizeHistory, summarize, type HistoryEntry } from '../src/domain/history';
import type { Question } from '../src/domain/exercise';

describe('settings', () => {
  it('falls back to defaults for garbage input', () => {
    expect(sanitizeSettings(null)).toEqual(defaultSettings());
    expect(sanitizeSettings('nope')).toEqual(defaultSettings());
  });

  it('never allows zero enabled notes', () => {
    expect(sanitizeSettings({ enabledPitchClasses: [] }).enabledPitchClasses).toHaveLength(12);
    expect(sanitizeSettings({ enabledPitchClasses: [42, 'x'] }).enabledPitchClasses).toHaveLength(12);
    expect(togglePitchClass([3], 3)).toEqual([3]);
    expect(togglePitchClass([3, 5], 3)).toEqual([5]);
    expect(togglePitchClass([5], 3)).toEqual([3, 5]);
  });

  it('dedupes and sorts pitch classes', () => {
    expect(sanitizeSettings({ enabledPitchClasses: [9, 0, 9] }).enabledPitchClasses).toEqual([0, 9]);
  });

  it('uses one scramble toggle and migrates legacy per-exercise values', () => {
    expect(sanitizeSettings({ scramble: true }).scramble).toBe(true);
    expect(sanitizeSettings({ scramble: false }).scramble).toBe(false);
    expect(sanitizeSettings({ scramble: { identify: true } }).scramble).toBe(true);
    expect(sanitizeSettings({ scramble: { identify: false, 'sing-test': false } }).scramble).toBe(false);
    expect(sanitizeSettings({ scramble: 'yes' }).scramble).toBe(false);
  });

  it('validates the reference keyboard size', () => {
    expect(sanitizeSettings({ referenceOctaves: 3 }).referenceOctaves).toBe(3);
    expect(sanitizeSettings({ referenceOctaves: 4 }).referenceOctaves).toBe(1);
    expect(sanitizeSettings({ referenceOctaves: '2' }).referenceOctaves).toBe(1);
  });

  it('centres the visible reference octaves on the chosen one, within range', () => {
    expect(visibleOctaves(4, 1)).toEqual([4]);
    expect(visibleOctaves(4, 2)).toEqual([4, 5]);
    expect(visibleOctaves(4, 3)).toEqual([3, 4, 5]);
    expect(visibleOctaves(1, 3)).toEqual([1, 2, 3]);
    expect(visibleOctaves(7, 3)).toEqual([5, 6, 7]);
    expect(visibleOctaves(7, 2)).toEqual([6, 7]);
  });

  it('validates the replay octave and chroma contrast options', () => {
    expect(sanitizeSettings({ replayOctave: 'random', chromaContrast: 'fifth' })).toMatchObject({
      replayOctave: 'random',
      chromaContrast: 'fifth',
    });
    expect(sanitizeSettings({ replayOctave: 'sweep' }).replayOctave).toBe('sweep');
    expect(sanitizeSettings({ replayOctave: 'loud', chromaContrast: 7 })).toMatchObject({
      replayOctave: 'same',
      chromaContrast: 'far',
    });
  });

  it('orders octave ranges and clamps values', () => {
    const s = sanitizeSettings({ playbackOctaveMin: 6, playbackOctaveMax: 2, volume: 5, toleranceCents: -3 });
    expect([s.playbackOctaveMin, s.playbackOctaveMax]).toEqual([2, 6]);
    expect(s.volume).toBe(1);
    expect(s.toleranceCents).toBe(5);
  });

  it('keeps the vocal range at least one octave wide', () => {
    const r = normalizeVocalRange(60, 62);
    expect(r.high - r.low).toBeGreaterThanOrEqual(VOCAL_MIN_SPAN);
    const top = normalizeVocalRange(200, 200);
    expect(top.high - top.low).toBeGreaterThanOrEqual(VOCAL_MIN_SPAN);
  });
});

describe('history', () => {
  const q: Question = { id: 'q', kind: 'sing-test', targetMidi: 69, targetPitchClass: 9, scoringPolicy: 'pitch-class', createdAt: 0 };

  it('summarises accuracy, separating failed detections from wrong answers', () => {
    const entries: HistoryEntry[] = [
      entryFromResult({ ...q, kind: 'identify' }, { kind: 'identify', targetMidi: 69, answer: 9, correct: true }, { mixed: false, responseMs: 1000 }),
      entryFromResult({ ...q, kind: 'identify' }, { kind: 'identify', targetMidi: 69, answer: 2, correct: false }, { mixed: true, responseMs: 3000 }),
      entryFromResult(q, { kind: 'sing', outcome: 'no-detection', reason: 'never', targetMidi: 69, policy: 'pitch-class', toleranceCents: 50 }, { mixed: false, responseMs: 500 }),
    ];
    const s = summarize(entries);
    expect(s.overall).toMatchObject({ answered: 2, correct: 1, incorrect: 1, noDetection: 1, accuracy: 0.5, meanResponseMs: 2000 });
    expect(s.byExercise['sing-test']).toMatchObject({ answered: 0, noDetection: 1, accuracy: null });
    expect(s.byPitchClass[9].answered).toBe(2);
    expect(s.byPitchClass[0].accuracy).toBeNull();
  });

  it('round-trips through sanitizeHistory and drops malformed rows', () => {
    const e = entryFromResult({ ...q, kind: 'identify' }, { kind: 'identify', targetMidi: 69, answer: 9, correct: true }, { mixed: false, responseMs: 10 });
    expect(sanitizeHistory([e, { foo: 1 }, null])).toEqual([e]);
    expect(sanitizeHistory('x')).toEqual([]);
  });

  it('stores and summarises octave identification separately', () => {
    const octaveQuestion = { ...q, kind: 'identify-octave' as const, targetMidi: 60, targetPitchClass: 0 as const };
    const entry = entryFromResult(
      octaveQuestion,
      { kind: 'identify-octave', targetMidi: 60, answer: 3, correct: false },
      { mixed: false, responseMs: 1200 },
    );
    expect(entry).toMatchObject({ exercise: 'identify-octave', answer: 3, outcome: 'incorrect' });
    expect(sanitizeHistory([entry])).toEqual([entry]);
    expect(summarize([entry]).byExercise['identify-octave']).toMatchObject({ answered: 1, incorrect: 1 });
  });

  it('stores chroma pairs and keeps them out of the per-note tally', () => {
    const chromaQuestion = { ...q, kind: 'identify-chroma' as const, targetMidi: 50, targetPitchClass: 2 as const, comparisonMidi: 74 };
    const entry = entryFromResult(
      chromaQuestion,
      { kind: 'identify-chroma', targetMidi: 50, comparisonMidi: 74, answer: 'same', correct: true },
      { mixed: false, responseMs: 900 },
    );
    expect(entry).toMatchObject({ exercise: 'identify-chroma', answer: 1, comparisonMidi: 74, outcome: 'correct' });
    expect(sanitizeHistory([entry])).toEqual([entry]);
    const summary = summarize([entry]);
    expect(summary.byExercise['identify-chroma']).toMatchObject({ answered: 1, correct: 1 });
    expect(summary.byPitchClass[2].answered).toBe(0);
  });
});
