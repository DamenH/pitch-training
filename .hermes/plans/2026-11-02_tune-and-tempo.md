# Tune and Tempo Roadmap

Agreed on 2026-11-02. The aim is tempo training that works like pitch training: remember a tempo
without a reference, the way the app trains remembering a note. It also teaches tempo notation.
No new tabs: the five tabs stay, and tempo arrives as modes inside existing tabs.

Every decision needed to build this is made below, so the phases can run one after another
without check-ins. Where a choice was a judgement call it says so; revisit it after trying it.

---

## Target structure

| Tab | Route(s) | Modes |
|---|---|---|
| Reference | `#/reference` | Keyboard, microphone, pieces, plus a **Metronome** panel |
| Identify | `#/identify/<mode>` | Notes · Octaves · Chroma · **Tempo** |
| **Tune** (was Anchor) | `#/tune/<mode>` | **Pitch** (today's Anchor → Tune, unchanged) · **Tempo** |
| Sing | `#/sing-practice` | unchanged |
| **Test** (was Sing test) | `#/test/<mode>` | **Sing** (today's Sing test, unchanged) · **Tap** |

The rule that keeps this tidy: **Identify means hear it and answer, Tune means adjust a sound until
it matches, and Test means see a target and produce it.**

Old links keep working: `#/anchor`, `#/anchor/tune`, `#/sing-test` and anything under them redirect
(with `history.replaceState`) to `#/tune/pitch` and `#/test/sing`.

---

## Decisions

These were open questions in the discussion. They are settled here so the work can run unattended.

- **Internal names stay.** Only user-facing names and routes change. `src/domain/anchor.ts`,
  `anchorPitchClass`, `anchorOctave`, the `--anchor` colour tokens, the `anchor-tune` history
  exercise and the `sing-test` exercise kind keep their names, so stored settings and history need
  no migration. In Tune → Pitch's options, the note is still called the **Anchor note**.
- **Quarter-note beats only.** Marks are shown as `♩ = 96`. Dotted beats (`♩. = 60` in 6/8) are
  left out.
- **Plain click.** No bar accents or time signatures.
- **Default anchor tempo: ♩ = 120.** This is a judgement call: it is the most familiar tempo and
  sits in the middle of the range. It can be changed in Tune options (40–208).
- **Tempo error is a signed percentage:** `(answer / target − 1) × 100`. Positive means fast.
  Tolerance and every stat use percent, never BPM, because tempo is perceived proportionally.
- **One tempo tolerance** (`tempoTolerancePct`, default 5, range 1–20, step 1) shared by every tempo
  exercise. It appears in Settings → Tempo and in the Tune options sheet (same value).
- **Tempo range** for generated targets: `tempoMin`/`tempoMax`, default 60–160, bounds 40–208,
  at least 20 BPM wide.
- **History:** tempo results go into the same History page as new exercise types, with a Tempo
  stats section. They never count towards per-note stats, and they don't affect pitch cold-round
  detection (see Phase 4).
- **Pushing:** each phase ends with a commit and a push to `main` once all its checks pass. That
  matches how changes have shipped so far, and every push deploys to GitHub Pages.

---

## Tempo terms (the single source of truth)

`src/domain/tempo.ts` holds one table. Each term has a **display range** (conventional and
overlapping, shown to the user) and a **band** (disjoint, contiguous and covering 40–208). Bands
are used whenever the app must pick exactly one term: the live label on the metronome, scoring term
answers, and generating term targets.

| Term | Meaning | Display range | Band (scoring) |
|---|---|---|---|
| Grave | very slow, solemn | 25–45 | 40–44 |
| Largo | broad | 40–60 | 45–59 |
| Adagio | at ease | 55–75 | 60–75 |
| Andante | at a walking pace | 75–105 | 76–103 |
| Moderato | moderate | 100–120 | 104–115 |
| Allegretto | fairly fast | 105–125 | 116–119 |
| Allegro | fast, bright | 120–155 | 120–155 |
| Vivace | lively | 150–175 | 156–175 |
| Presto | very fast | 170–200 | 176–199 |
| Prestissimo | as fast as possible | 200+ | 200–208 |

Allegretto's band is narrow by design. As an answer choice it is too fine to judge by ear, so the
term quiz uses only a subset (see Phase 5). The UI says the ranges are approximate conventions.

Words for changing tempo (shown in the term list on the metronome, not used in exercises):
*accelerando* (gradually faster), *ritardando* / *rallentando* (gradually slower), *a tempo* (back
to the original speed), *rubato* (flexible timing), *più mosso* / *meno mosso* (more / less motion).

---

## Phase 1: Rename Anchor → Tune and Sing test → Test

**Shipped 2026-11-02.** Also brought two browser checks up to date: held Reference keys (they
now ring for at least the note length after release) and Identify's autoplay on Next.

No behaviour changes. Ships on its own.

**Steps**
1. `src/lib/anchorMode.svelte.ts` → `src/lib/tuneMode.svelte.ts`: `tuneModes = new PageModes('tune',
   ['pitch'], { pitch: 'Pitch' })`. (Tempo is added in Phase 4.)
2. New `src/lib/testMode.svelte.ts`: `testModes = new PageModes('test', ['sing'], { sing: 'Sing' })`.
   (Tap is added in Phase 3.)
3. Router (`src/lib/router.svelte.ts`): routes become `tune` and `test` instead of `anchor` and
   `sing-test`; `MODES` gains `tune` and `test`. In `parse`, map the legacy names `anchor` → `tune`
   and `sing-test` → `test`, and rewrite the hash with `replaceState` so the URL shows the new
   route. A legacy mode segment (`/tune` under anchor) maps to `pitch`.
4. `App.svelte`: tab labels **Tune** and **Test**, titles **Tune** and **Test**, widths, the `fills`
   check and the mode pill for both tabs. The mode pill shows even when a tab has a single mode
   (as Anchor does today). Keep the `--anchor` colours for the Tune pill. Add a `tune` icon to
   `Icon.svelte` (a dial or knob) and use it for the tab.
5. `AnchorPage.svelte` → `TunePage.svelte`. Rename the session comment, `.anchor` class and the
   options sheet title to Tune. The sheet stays the Pitch options for now.
6. `ExercisePage` still serves `sing-test` (the kind is unchanged). It is rendered for route
   `test` when `testModes.value === 'sing'`.
7. History labels: `anchor-tune` shows as **Tune pitch**; `sing-test` shows as **Test sing**.
8. Grep the whole repo (including `public/`, `scripts/`, `README.md` and `.hermes/plans/`) for
   `#/anchor`, `#/sing-test`, `'anchor'` and `Sing test`, and update user-facing text and links.
   Update `scripts/verify-singing.mjs` to `#/test/sing`.
9. In `2026-10-27_anchor-roadmap.md`, add one line at the top: the tab is now **Tune**
   (`#/tune/<mode>`), and its future modes (octave tune, *Is it X?*, *Spot X*) will join it there.

**Tests**
- Unit (new `tests/router.test.ts`, or extend an existing one): legacy hash → new route and mode
  mapping, as a pure function pulled out of `parse`.
- Browser: extend `scripts/verify-pwa.mjs` (or the singing script) to open `#/anchor/tune` and
  `#/sing-test` and assert they land on `#/tune/pitch` and `#/test/sing` with the right page shown.

**Done when** `npm run verify` and `npm run test:pwa` pass, the phone and desktop tab bars show
Tune and Test (screenshots at 390×844 and 1280×900), and old links redirect.

---

## Phase 2: Metronome engine, Reference panel and tempo notation

**Shipped 2026-11-02.** As planned, except: `beatsUntil(lastBeat, bpm, now, horizon)` replaces
`beatTimesBetween`, finite click runs (`playClicks` in `synth.ts`) stop with `stopAll()` while the
metronome's clicks don't, the quarter note is drawn as SVG (`TempoMark.svelte`) because fonts
render ♩ badly, and tapping a tempo term also starts the clicks.

**Domain** (`src/domain/tempo.ts`, pure and fully unit-tested):
- `TEMPO_TERMS` (the table above), `termForBpm(bpm)` using bands, `termByName`, `bandCentre(term)`.
- `formatMark(bpm)` → `♩ = 96`.
- `BPM_MIN = 40`, `BPM_MAX = 208`, `clampBpm`.
- `beatTimesBetween(anchorTime, bpm, from, to)`: the beat times in `[from, to)` for a click grid
  anchored at `anchorTime`. The scheduler uses it.

**Audio** (`src/audio/metronome.ts`):
- A click voice: a short (~30 ms) band-passed noise burst or a 1.5 kHz sine blip with a fast
  exponential decay, at `settings.volume`. It is the same for every instrument, because a click
  must be percussive.
- A look-ahead scheduler: every 25 ms, schedule any beats in the next 120 ms on the AudioContext
  clock. Never time beats with `setTimeout`.
- API: `start(bpm)`, `setBpm(bpm)` (takes effect from the next beat not yet scheduled, keeping the
  phase of the last beat, so no beat is doubled or dropped), `stop()`, `isRunning`, plus an
  `onbeat(time)` hook for visual pulses (fired with `setTimeout` at the beat's audio time).
- The metronome owns its nodes. `stopAll()` in `synth.ts` must not stop it; pages stop it
  explicitly in `onDestroy`. Starting it calls `resumeAudio()` synchronously in the gesture (iOS).
- In a hidden tab browsers throttle timers, so the scheduler widens its look-ahead to 1.2 s while
  `document.hidden` is true.

**Tap tempo** (pure, in `tempo.ts`): `analyzeTaps(times: number[])` → `{ bpm, intervals, cv }`,
using the median of the last up-to-8 intervals. A gap more than 2 s longer than the median
restarts the tap run.

**Reference panel** (`src/components/Metronome.svelte`, placed in `ReferencePage` below the voice
section, max-width 720px and centred like the readout):
- A row: play/stop button · `−` · large `♩ = 120` · `+` · the live term ("Allegro").
  `−`/`+` step by 1 (hold or Shift for 5).
- A slider from 40 to 208.
- A **Tap** button: tapping sets the BPM from `analyzeTaps` and does not start the clicks.
- A pulse dot that lights on each beat (reduced motion: no animation, colour change only).
- A disclosure, **Tempo terms**, with the table (term, meaning, display range) and the
  changing-tempo words. Tapping a term sets the BPM to its band centre.
- BPM is remembered for the session like the octave (`lastBpm` in a module script), not saved
  to settings.
- Keyboard: none added (the Reference shortcuts already use the letter keys).

**Tests**
- Unit: term lookup at every band edge (each BPM from 40 to 208 maps to exactly one term, and bands
  are contiguous), `formatMark`, `beatTimesBetween` (including a BPM change mid-grid: no doubled or
  missing beat), and `analyzeTaps` (a steady run, one sloppy tap, a restart after a long gap).
- Browser: start the metronome on Reference, change the BPM, stop it. Assert the label and term
  update and that the pulse dot toggles at least twice in 1.5 s at 120 BPM.

**Done when** checks pass, the panel looks right at 390 and 1280 wide in both themes, and leaving
the Reference tab stops the clicks.

---

## Phase 3: Test → Tap

**Behaviour**
- The target shows as one of three **target styles** (Settings → Tempo, default *Mark*):
  - **Number**: "96 BPM"
  - **Mark**: `♩ = 96`
  - **Term**: "Andante". The target is a band, and any tempo inside it counts.
- An optional scramble plays first (the existing `scramble` setting; see "Tempo scramble" below).
- A large tap pad. Taps make **no sound**; the pad flashes and a row of 8 dots fills.
- After the 8th tap the round scores itself (median of 7 intervals). **Start over** clears the
  taps.
- Reveal: your tempo as a mark and term, the target, the signed %, a meter of ±20% with the
  tolerance band, and how steady you were (the interval CV, shown as "steady", "a little uneven"
  or "uneven" at < 3%, < 6% and above). **Hear it** plays 8 clicks at the target, then **Next**.
- Term targets: correct when the tapped BPM is inside the band. The % shown is from the band's
  nearest edge (0% when inside), and the reveal names the band.
- Targets are drawn uniformly within the tempo range. Term targets are drawn from terms whose band
  overlaps the range, never Allegretto (too narrow), and new targets differ from the previous
  target by at least 8%.
- Keys: `Space` or `T` taps, `Backspace` starts over, `Enter` moves to the next round after the
  reveal.

**Implementation**
- `testModes` gains `tap`. New `src/components/TapQuestion.svelte`; a small `TapPage` keeps the
  session tally, like `ExercisePage` does.
- Pure helpers in `tempo.ts`: `createTempoTarget(settings, rng, previous?)` and
  `evaluateTempo(target, bpm, tolerancePct)` → `{ bpm, errorPct, correct, term }`.
- Use `PointerEvent.timeStamp` and `KeyboardEvent.timeStamp` for tap times, not `Date.now()`.

**Settings → new "Tempo" section**: tempo range (two selects, as for octaves), tolerance slider (%),
target style (segmented: Number / Mark / Term).

**History**: new exercise `test-tap` (see "History changes" below).

**Tests**
- Unit: target generation (in range, minimum change from the previous target, never Allegretto),
  evaluation (fast/slow sign, tolerance edge, term band inside/outside), settings sanitising.
- Browser: dispatch 8 key taps at 500 ms intervals (`page.keyboard.press('Space')` with
  `waitForTimeout`) on a fixed-target test hook. Assert the reveal shows about `♩ = 120`. A
  test-only `?seed=` query in the URL may fix the RNG if needed; add one only if the test can't
  read the target from the page.

---

## Phase 4: Tune → Tempo

**Behaviour** (mirrors Tune → Pitch):
- **Levels** (Tune options): **Anchor**, which tunes to your anchor tempo (default ♩ = 120, set in
  options), and **Shown**, which tunes to a target drawn like Tap's and written in the chosen
  target style.
- Start: the metronome clicks at a random tempo at least 10% from the target. The BPM is never
  shown while tuning.
- The wheel works in log space: 1 px of drag is 0.1%, the nudges are ±1% (Shift ±5%), and a scroll
  wheel works too. Rate changes use `setBpm`, so there are no stutters.
- The round's range is target × [0.6, 1.6] with both ends moved at random by up to ±5%, clamped to
  40–208, so neither end gives the target away.
- **Lock in** reveals your BPM as a mark and term, the target, the signed %, the grade and a
  ±20% meter. Grades: perfect ≤ 1%, close ≤ 2.5%, found within tolerance, otherwise missed.
- **Compare** plays 4 clicks at your tempo, a 1 s gap, then 4 at the target.
- **Mute** silences the clicks while you keep turning (`M`), as Pitch's mute does.
- The masker (the existing `tuneMasker` toggle) plays the tempo scramble before each round.
- Cold rounds: pitch and tempo each check only their own history entries. Pitch cold detection
  uses the last `anchor-tune` / `identify*` / `sing-test` entry, and tempo uses the last tempo
  entry. Change `isCold`'s callers in `TunePage` accordingly.

**Implementation**
- Pull the drag, wheel and keyboard handling out of `TuneQuestion.svelte` into
  `src/components/TuneWheel.svelte`, with props: `onmove(delta)`, `enabled`, `label`, `turn`
  (ridge offset) and `position`. `TuneQuestion` (pitch) uses it unchanged in behaviour. Check
  Pitch by hand afterwards: drag, scroll, arrows, Shift and the edge haptic.
- New `src/components/TempoTuneQuestion.svelte` and pure `src/domain/tempoTune.ts`
  (`createTempoRound`, `evaluateTempoTune`, `clampTempo`), tested like `anchor.ts`.
- `tuneModes` gains `tempo`. `TunePage` shows the mode's question and its own options section
  (anchor tempo stepper, level, tolerance, and masker shared with Pitch).
- Settings: `tempoAnchorBpm` (default 120), `tempoTuneLevel: 'anchor' | 'shown'` (default
  `anchor`).
- History: exercise `tune-tempo`.

**Tests**: unit tests for round generation (start ≥ 10% away, the target always in range, the
range clamped) and evaluation/grades. Browser: start a round, press ArrowUp a few times, lock in,
and assert the reveal shows a mark, a term and a signed %.

---

## Phase 5: Identify → Tempo

**Behaviour**
- Plays 8 clicks at the target tempo (Replay as for notes; single-play mode applies; it
  autoplays on Next like the other modes, and the scramble applies).
- **Answer by** (Settings → Tempo, default *Term*):
  - **Term**: one tap among **Largo, Adagio, Andante, Moderato, Allegro, Vivace, Presto**. Targets
    are drawn from inside those bands, at least 4% from either edge, so no target sits on a
    boundary. The verdict appears in place, as in Chroma.
  - **Number**: a numeric input (or a stepper with −/+ and the large mark) plus Submit, scored by
    % against the tolerance.
- After answering, the verdict shows the real mark and term, and **Hear it** replays.

**Implementation**
- `identifyModes` gains `tempo` (route `#/identify/tempo`). `ExerciseKind` gains `identify-tempo`;
  `createQuestion` produces a question with `targetBpm`. Rendering is in a new
  `IdentifyTempoQuestion.svelte` (keeping it out of `IdentifyQuestion` keeps that component from
  growing further).
- Settings: `tempoIdentifyAnswer: 'term' | 'number'`.
- History: exercise `identify-tempo`.

**Tests**: unit tests for target generation per answer mode (term targets clear of band edges,
within the tempo range) and term/number evaluation. Browser: answer one term question, assert a
verdict and the autoplay on Next.

---

## Shared pieces

**Tempo scramble** (`src/lib/scramble.svelte.ts` gains `playTempoScramble()`): about 2.5 s of
clicks at random, irregular intervals (120–600 ms, each drawn independently), so no steady pulse
survives into the next round. Used wherever the pitch scramble is used: Identify Tempo and Test Tap
with `scramble`, Tune Tempo with `tuneMasker`.

**History changes** (`src/domain/history.ts`)
- New exercises: `tune-tempo`, `test-tap`, `identify-tempo`.
- New nullable fields: `targetBpm`, `answerBpm` and `tempoErrorPct` (signed). For tempo entries,
  `targetMidi` and `targetPitchClass` become `null`, so their types widen to `number | null` and
  `PitchClass | null`. Fix every consumer (about 14 references in `history.ts` and
  `HistoryPage.svelte`); per-note stats skip tempo entries.
- `sanitizeHistory`: accept a tempo entry without `targetMidi` when `targetBpm` is a number, and
  keep old entries exactly as they are today.
- `tempoStats(entries)`: per tempo exercise, the rounds, mean |%| and mean signed % (the bias:
  "you tend to rush" or "you tend to drag"). The History page shows them in a **Tempo** section
  like Tune pitch's stats, and the exercise filter lists the new types.
- Unit tests: entries round-trip through `sanitizeHistory`, old pitch-only history is unchanged,
  and the stats are correct.

**Settings** (`src/domain/settings.ts`): every new field gets a default, sanitising (clamps,
`oneOf`, and `tempoMax − tempoMin ≥ 20`), and a test in `tests/settings-history.test.ts`, following
the existing pattern exactly.

**README**: update the tab table for every phase (Tune, Test, Metronome, the three tempo modes,
the keys and routes) and the `src/` layout list.

---

## How each phase is done

1. Implement the phase, matching the surrounding code (Svelte 5 runes, comment density, naming).
2. `npm run verify` (svelte-check with `--fail-on-warnings`, vitest, build) must pass.
3. `npm run test:pwa` must pass, including the new browser checks. Keep new checks in
   `scripts/verify-tempo.mjs` and call them from `verify-pwa.mjs`, like `verify-singing.mjs`.
4. Take screenshots with Playwright at 390×844, 844×390 (phone on its side) and 1280×900, in light
   and dark themes, of every screen the phase touched. Look at them: no overflow, no wrapped
   segmented controls, nothing hidden behind the tab bar, and the action button still in the thumb
   zone.
5. Update the README and this plan (mark the phase shipped with its date).
6. Commit with a message describing the phase, then push:
   `GH_TOKEN=$(gh auth token --user DamenH) git push` (the active gh account gets a 403).
7. If a check fails and the fix isn't clear after two attempts, stop, leave the phase uncommitted,
   and report what failed rather than pushing around it.

Order: 1 → 2 → 3 → 4 → 5. Each phase depends only on earlier ones. Phase 2's engine is used by
3, 4 and 5, and Phase 4 reuses Phase 3's target generation and settings.

---

## Not included (possible later)

- Dotted-beat marks (`♩. = 60`) and a lesson on compound time.
- Bar accents and time signatures on the metronome.
- Showing a mark and term on library pieces: scores store seconds, not tempo, so this needs a
  tempo field in the score format first.
- Tempo error scatter over time (like the Tune error scatter idea in the Anchor roadmap).
