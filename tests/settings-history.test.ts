import { describe, expect, it } from 'vitest';
import {
  defaultSettings,
  normalizeVocalRange,
  sanitizeSettings,
  togglePitchClass,
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
});
