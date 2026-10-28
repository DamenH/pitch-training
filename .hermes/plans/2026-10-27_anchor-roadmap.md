# Anchor and Chroma Roadmap

Steps 1–4 shipped on 2026-10-27:

1. Chroma answers straight away (one tap, toast, next pair).
2. Chroma masker (random notes between the pair, and before it on a replay, with 1/2 markers).
3. Soft synth voice, defined as a preset in `src/audio/presets.ts`.
4. Anchor tab (`#/anchor/<mode>`) with **Tune**, an on-page Options sheet, and cold-round tracking.

Then, on 2026-10-28: Tune's range reaches about two octaves either side of the anchor note
(C4 by default) with randomly moved ends, an *Exact octave* level, and a struck *Piano* sound.

This file records the agreed next steps.

---

## 5. Chroma rounds between Tune rounds

**Why:** after a Tune reveal you have just heard the real anchor. One masker before the next
round helps, but you would probably still find it by the second round. A short task in between
should break short-term pitch memory more reliably than random notes alone.

**Behaviour**
- Setting in Anchor → Options: *Chroma rounds between* = 0 / 1 / 2 / 3 (default 0 until tried).
- After *Next round*, run that many Chroma pairs **with the masker**, answered by tapping and
  confirmed only by a toast. Never show note names, because a named note is a reference.
- Then the usual Tune masker (if on) and the Tune round.
- These rounds are logged as ordinary `identify-chroma` history entries, so they count.
- Undecided: whether the rounds in between can be skipped (risk: skipping becomes a habit).
  Leaning towards no skip, but a short count.

**Implementation notes**
- Reuse `chromaTimeline` / `playChromaPair` and `IdentifyQuestion`'s chroma branch, or pull the
  chroma UI into its own component so Anchor can host it without the Identify page around it.
- Consider leaving the anchor pitch class out of these pairs.
- `TuneRound.cold` must stay false for rounds after the chroma rounds (it already will, because
  chroma answers are recorded first).

## 6. Octave tune

**Behaviour**
- New Anchor mode `octave-tune` (`#/anchor/octave-tune`), cycled with the title pill.
- A reference note plays (any enabled pitch class, not just the anchor). The tuning tone starts in a
  different octave, and you tune it to the same note there.
- Scored against the **exact** target octave (crossing octaves is the point), shown in cents.
- Trains keeping pitch class across octaves (relative), so it is a chroma exercise that shares the
  Tune control.

**Implementation notes**
- Generalise `TuneRound` with a `target` (exact MIDI or a pitch class) and an optional reference note.
- Pull the wheel out of `TuneQuestion` into a `TuneWheel` component.
- History: new exercise `anchor-octave-tune`, or `anchor-tune` with a mode field.

## 7. Is it X? and Spot X

**Is it X?** (`#/anchor/is-it`)
- Masker, then one note: yes or no. The anchor plays about 30–50% of the time.
- Wrong notes get closer as you improve: a tritone first, then down to a semitone (adaptive).
- Notes in random octaves.

**Spot X** (`#/anchor/spot`)
- A stream of random notes; tap whenever the anchor sounds.
- Score hits and false alarms separately (d′), so tapping a lot isn't rewarded.
- Adjustable stream speed and anchor frequency.

## 8. Instrument editor

- Edit `SynthPreset` fields in the UI: oscillator mix (type, detune, level), brightness,
  resonance, attack and release.
- Saved, named presets selectable anywhere a sound is chosen (Settings → Instrument,
  Anchor → Tuning sound).
- Presets are stored as data, so `sanitizeSettings` must validate user presets and fall back to `soft`.
- Preview plays a random note, never the anchor.

## 9. More tuning sounds

- **Cleaner Soft:** drop the ±4¢ detune, whose slow beating blurs the pitch being judged.
- **More synth presets:** organ, clarinet-ish, flute-ish, strings or pad, a voice "ooh".
- **Recorded cello and violin:** free sustained samples (e.g. VSCO 2 Community Edition; check the
  licence), with loop points prepared once by a script so a note holds while you tune. Several
  recordings per instrument, so no note is stretched far; ~1–3 MB each, loaded only when chosen.
  Keep vibrato small or off: it blurs the pitch.

---

## Other ideas noted along the way

- **Tune error scatter:** a chart of past Tune errors over time, cold rounds highlighted, showing
  bias and spread. History currently shows average miss and bias only.
- **Options sheet for Identify:** move mode-specific settings (replay octave, chroma contrast,
  masker) from Settings to an Options sheet on the Identify page, like Anchor's.
- **Better cold detection:** the Reference page and Sing practice play notes without
  writing history, so they don't count. A "last labelled note heard" timestamp would be more accurate.
- **Listening phase** (deferred): a short warm-up playing the anchor in several octaves and sounds.
