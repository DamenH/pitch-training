# Identify Octaves Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Add octave identification beside existing note identification, reuse Reference's octave-selector component and the existing piano, integrate the mode toggle into the Identify title bar, and move Scramble to one app-wide Settings switch.

**Architecture:** Preserve `identify` unchanged and add `identify-octave` as a separate exercise kind behind the same route. A shared rune module owns only the current Identify mode, while a reusable octave-picker component serves Reference and Identify with independent selection state. Distinct result/history discriminators prevent octave numbers from being confused with pitch-class numbers.

**Tech Stack:** Svelte 5, TypeScript, Vitest, Vite, Playwright, localStorage-backed settings/history.

---

## Agreed behavior

- The top bar reads visually as **Identify Notes** or **Identify Octaves**: `Identify` remains the heading and a button immediately to its right displays `Notes` or `Octaves`.
- Notes is teal; Octaves is a related purple. Text, pressed state, and accessible labels also communicate mode, so color is not the only signal.
- Reloading starts in Notes, preserving existing behavior. Tab changes retain mode for the current app session.
- Notes and Octaves keep separate questions and session tallies.
- Octave targets and answers use the configured Identify/Reference lowest and highest octaves.
- Reference and Identify Octaves reuse the same picker component but do **not** share selection state. Reference retains its own last octave; every new Octaves question starts with no octave answer selected.
- In Octaves, the octave picker is the answer. Before selection, the piano shows only the tested pitch class without an octave suffix; after selection it shows that candidate octave. Other keys use the existing disabled appearance. It cannot play candidate notes before submission.
- After submission, the picker marks correct and incorrect octaves, the piano shows the correct full note, and feedback says, for example, “It was C♯4. You chose C♯3.”
- Existing Play/Replay and Submit/Next behavior remains unchanged.
- Scramble becomes one boolean in Settings for Identify Notes, Identify Octaves, Sing, and Test. Reference does not scramble.
- Legacy per-exercise scramble data migrates to enabled if any old exercise toggle was enabled.

## Acceptance criteria

1. Existing users land in Notes with unchanged generation, interaction, scoring, replay, and history meaning.
2. The title toggle is usable at 320px and desktop widths, clearly button-like, teal in Notes, purple in Octaves, and accessible by keyboard/screen reader.
3. Octaves shows exactly one emphasized pitch class on the piano and only configured octaves as answers.
4. Reference and Octaves render the same selector component while their selected values remain independent.
5. Questions, unfinished state, and tallies never cross modes.
6. History distinguishes Identify notes from Identify octaves while retaining legacy rows.
7. A single Settings switch controls Scramble everywhere and no exercise header contains it.
8. `npm run verify` and responsive browser acceptance checks pass.

---

### Task 1: Add shared Identify-mode state

**Objective:** Let App and Exercise pages coordinate the active Identify mode without coupling their implementations.

**Files:**
- Create: `src/lib/identifyMode.svelte.ts`

**Step 1: Add Identify state**

```ts
export type IdentifyMode = 'notes' | 'octaves';
export const identifyMode = $state<{ value: IdentifyMode }>({ value: 'notes' });
export function toggleIdentifyMode(): void {
  identifyMode.value = identifyMode.value === 'notes' ? 'octaves' : 'notes';
}
```

Keep this out of persisted Settings so Notes remains the reload default.

**Step 2: Verify and commit**

Run: `npm run check` — expected zero errors/warnings.

```bash
git add src/lib/identifyMode.svelte.ts
git commit -m "Add shared identify mode state"
```

---

### Task 2: Extract a reusable octave picker

**Objective:** Share the selector's rendering, interaction contract, styling, accessibility, and result markers while callers retain their own state.

**Files:**
- Create: `src/components/OctavePicker.svelte`
- Modify: `src/pages/ReferencePage.svelte`

**Step 1: Define the picker interface**

```ts
let {
  octaves, value, onselect, answer = null, correct = null, disabled = false,
}: {
  octaves: readonly number[];
  value: number | null;
  onselect: (octave: number) => void;
  answer?: number | null;
  correct?: number | null;
  disabled?: boolean;
} = $props();
```

Use real buttons and permit `null` so Identify can require an explicit answer while Reference always passes its local octave. Give the group `aria-label="Octave"`; result labels announce correct and incorrect choices. Move Reference's existing dark piano-board styles into this component.

**Step 2: Replace Reference's inline picker**

- Keep Reference's module-local `lastOctave` and local `octave` state exactly as its independent selection source.
- Render `OctavePicker` with `OCTAVE_MIN...OCTAVE_MAX`.
- Preserve Z/X shortcuts, preloading, and piano behavior.

**Step 3: Verify and commit**

Run `npm run check`, then verify picker taps and Z/X survive tab changes.

```bash
git add src/components/OctavePicker.svelte src/pages/ReferencePage.svelte
git commit -m "Extract shared octave picker"
```

---

### Task 3: Add octave generation and scoring without changing Notes

**Objective:** Introduce a separately discriminated domain path for octave questions.

**Files:**
- Modify: `src/domain/exercise.ts`
- Modify: `tests/exercise.test.ts`
- Modify: `tests/scoring.test.ts`

**Step 1: Write failing generation tests**

Test that `identify-octave` uses the same configured MIDI candidates, never leaves enabled pitch classes/range, avoids the previous octave when alternatives exist, and still works with a single octave. Run `npx vitest run tests/exercise.test.ts`; expect failure because the kind is absent.

**Step 2: Implement generation**

Extend `ExerciseKind` with `'identify-octave'`. Keep the current `identify` branch unchanged. For octave mode, choose uniformly among allowed octaves (excluding the previous octave when possible), then uniformly among enabled pitch classes in it.

**Step 3: Write failing scoring tests**

Cover B3/C4 boundaries:

```ts
expect(evaluateIdentifyOctave(question(59), 3).correct).toBe(true);
expect(evaluateIdentifyOctave(question(60), 3).correct).toBe(false);
expect(evaluateIdentifyOctave(question(60), 4).correct).toBe(true);
```

**Step 4: Add a distinct result**

```ts
export interface IdentifyOctaveResult {
  kind: 'identify-octave';
  targetMidi: number;
  answer: number;
  correct: boolean;
}
```

Add `evaluateIdentifyOctave` using `midiToOctave`, and include the result in `ExerciseResult`. Preserve `IdentifyResult` and `evaluateIdentify` exactly.

**Step 5: Verify and commit**

Run: `npx vitest run tests/exercise.test.ts tests/scoring.test.ts` — expected pass.

```bash
git add src/domain/exercise.ts tests/exercise.test.ts tests/scoring.test.ts
git commit -m "Add octave identification domain behavior"
```

---

### Task 4: Preserve and distinguish history

**Objective:** Store octave answers unambiguously without migrating or reinterpreting existing rows.

**Files:**
- Modify: `src/domain/history.ts`
- Modify: `src/pages/HistoryPage.svelte`
- Modify: `tests/settings-history.test.ts`

**Step 1: Write failing tests**

Test `entryFromResult`, `sanitizeHistory`, and `summarize` for `identify-octave`; assert legacy `identify` remains valid and means pitch-class identification.

**Step 2: Extend history**

Add `identify-octave` to `HistoryExercise`, conversion, sanitization, and `byExercise`. Do not rename `identify`.

**Step 3: Update presentation**

Show separate `Identify notes` and `Identify octaves` summary rows. Format octave recent rows as `target C4 · answer C3`. Keep both modes in the existing By note summary; do not add an octave chart yet.

**Step 4: Verify and commit**

Run: `npx vitest run tests/settings-history.test.ts` — expected pass.

```bash
git add src/domain/history.ts src/pages/HistoryPage.svelte tests/settings-history.test.ts
git commit -m "Track octave identification history"
```

---

### Task 5: Put the mode toggle beside the title

**Objective:** Make mode visible and switchable in the top bar at every layout size.

**Files:**
- Modify: `src/App.svelte`
- Modify: `src/app.css`

**Step 1: Add theme tokens**

Add exact light/dark `--octave`, `--octave-text`, and `--octave-soft` variables:

```css
/* Light */
--octave: #6f4b9b;
--octave-text: #ffffff;
--octave-soft: #ece4f5;

/* Dark */
--octave: #c0a3ed;
--octave-text: #1a1026;
--octave-soft: #332743;
```

Use a solid filled background for the mode button. The measured text contrast is 6.65:1 in light mode and 8.47:1 in dark mode. Notes reuses the existing `--accent`/`--accent-text` pair, measured at 7.49:1 light and 8.78:1 dark. These exceed WCAG AA's 4.5:1 normal-text requirement and WCAG AAA's 7:1 requirement except the light purple state, which still comfortably exceeds AA.

**Step 2: Add title control**

Wrap the heading and conditional Identify button in `.page-title`. The visible button says `Notes` or `Octaves`; only Identify renders it. It calls `toggleIdentifyMode`, exposes `aria-pressed`, and uses an action label such as “Identify Notes mode; switch to Octaves.” Update `document.title` reactively.

The button must remain visibly button-like, keep the global focus ring, and provide at least a 44px phone target. At 320px it must not collide with Settings/History controls.

**Step 3: Verify and commit**

Run: `npm run check`.

```bash
git add src/App.svelte src/app.css
git commit -m "Add identify mode toggle to title bar"
```

---

### Task 6: Build the octave question interface

**Objective:** Reuse the Identify shell while swapping in octave answers and a single-note piano.

**Files:**
- Modify: `src/components/IdentifyQuestion.svelte`
- Modify: `src/components/Piano.svelte` only if display-only semantics require it

**Step 1: Add mode-specific answer state**

Leave the current `PitchClass | null` path unchanged for `question.kind === 'identify'`. For each octave question, derive allowed octaves from Settings and initialize a component-local `selectedOctave` to `null`. Selecting an octave updates only that question's answer; it never changes Reference state.

**Step 2: Branch evaluation**

Notes continues calling `evaluateIdentify`. Octaves requires playback plus an octave and calls `evaluateIdentifyOctave`. Widen the result callback to the two explicit result types.

**Step 3: Render Octaves**

- Render `OctavePicker` and a `Piano` with `octave={displayedOctave}` and `enabled={[question.targetPitchClass]}`.
- Before selection, pass `octave={null}` so the piano labels only the given pitch class. After selection, show the selected candidate octave; after submission, show the correct octave.
- Make Piano display-only before result so it cannot reveal the answer. If needed, add a narrow `interactive={false}` prop that removes keys from the tab order and suppresses callbacks without losing `enabled` styling.
- Label it, for example, “C sharp; choose its octave.”

**Step 4: Feedback and shortcuts**

Show full target/chosen notes. Number keys within the configured range select octaves. Keep R/Space and Enter unchanged; A–G applies only in Notes.

**Step 5: Verify and commit**

Run `npm run check`; verify the existing fixed mobile action and reserved feedback keep Submit/Next stationary.

```bash
git add src/components/IdentifyQuestion.svelte src/components/Piano.svelte
git commit -m "Add octave identify question interface"
```

---

### Task 7: Keep independent sessions behind one route

**Objective:** Switch kinds without crossing questions or tallies.

**Files:**
- Modify: `src/App.svelte`
- Modify: `src/pages/ExercisePage.svelte`

**Step 1: Select and key the kind**

Derive `identify` for Notes and `identify-octave` for Octaves. Key `ExercisePage` by that value so switching destroys/saves the old instance and creates/restores the selected one.

**Step 2: Extend ExercisePage**

Treat both kinds as playback exercises, render `IdentifyQuestion` for both, accept both result types, and retain the module-level session map keyed by `ExerciseKind`.

**Step 3: Verify and commit**

Answer one question in each mode and switch repeatedly; each must retain its own `Session 1/1` and unfinished question.

```bash
git add src/App.svelte src/pages/ExercisePage.svelte
git commit -m "Keep separate identify mode sessions"
```

---

### Task 8: Make Scramble one app-wide Settings switch

**Objective:** Replace the current per-exercise record and header controls with one backwards-compatible boolean.

**Files:**
- Modify: `src/domain/settings.ts`
- Modify: `src/pages/SettingsPage.svelte`
- Modify: `src/pages/ExercisePage.svelte`
- Modify: `tests/settings-history.test.ts`

**Step 1: Write migration tests**

```ts
expect(sanitizeSettings({ scramble: true }).scramble).toBe(true);
expect(sanitizeSettings({ scramble: false }).scramble).toBe(false);
expect(sanitizeSettings({ scramble: { identify: true } }).scramble).toBe(true);
expect(sanitizeSettings({ scramble: { identify: false, 'sing-test': false } }).scramble).toBe(false);
expect(sanitizeSettings({ scramble: 'yes' }).scramble).toBe(false);
```

Run `npx vitest run tests/settings-history.test.ts`; expect failure first.

**Step 2: Change and migrate Settings**

Change `Settings.scramble` to boolean, default false, remove record cloning, accept booleans, and map legacy objects to `true` when any recognized old value is exactly true.

**Step 3: Move the UI**

Remove the checkbox and updater from `ExercisePage`. Add a switch row under **Sound**, after Note length: “Scramble before each new note,” with helper text “Play a brief random run to break relative pitch.” Reuse the existing Settings switch styling.

**Step 4: Apply globally**

Change `next()` to `if (s.scramble)` for all four exercise kinds. Preserve the microphone reset while scramble audio plays. Do not apply it to Reference or imported pieces.

**Step 5: Verify and commit**

Run focused settings/exercise tests, then `npm run verify`.

```bash
git add src/domain/settings.ts src/pages/SettingsPage.svelte src/pages/ExercisePage.svelte tests/settings-history.test.ts
git commit -m "Make scramble an app-wide setting"
```

---

### Task 9: Browser acceptance and final verification

**Objective:** Prove the complete interaction and Notes regression behavior.

**Files:**
- No committed files unless a defect is found; temporary Playwright scripts go in `$TMPDIR`.

**Step 1: Run locally**

Run: `npm run dev -- --host 127.0.0.1`.

**Step 2: Check Notes at 390×844, 320×568, and 1280×800**

Confirm teal title toggle, existing piano/scoring/shortcuts, legacy history display, and zero Submit/Next vertical shift after incorrect feedback. Inspect computed foreground/background colors and confirm the Notes pair remains at least 4.5:1.

**Step 3: Check Octaves at the same sizes**

Confirm purple toggle, configured picker options, exactly one emphasized pitch class, no candidate playback, number shortcuts, full-note feedback, correct/wrong markers, and stationary action button. Inspect computed foreground/background colors in both themes and confirm each Octaves pair remains at least 4.5:1.

**Step 4: Check independent octave state and sessions**

Select 5 in Reference, open Identify Octaves, and confirm no octave answer is preselected. Select 3 in Identify, return to Reference, and confirm Reference still shows 5. Start another octave question and confirm it again starts unanswered. Build independent Notes/Octaves tallies and verify mode switching restores each.

**Step 5: Check global Scramble**

Confirm no exercise header toggle. Enable/disable it in Settings and verify the next question in Notes, Octaves, Sing, and Test follows it. Confirm legacy data with any old true value migrates enabled.

**Step 6: Final gate**

Run: `git diff --check && npm run verify`.

Expected: no whitespace errors; zero Svelte/TypeScript errors or warnings; all Vitest tests pass; production build succeeds.

Do not add unrelated refactors, persisted mode preference, octave analytics, or pre-answer candidate playback.

---

## Main risks and tradeoffs

- **Title ownership:** App owns the title while ExercisePage owns questions. Shared state plus keyed instances keeps their interfaces small and lifecycle behavior explicit.
- **Numeric ambiguity:** Pitch classes and octaves are both numbers. Separate exercise/result/history discriminators prevent reinterpretation.
- **Answer leakage:** Playing a candidate note before submission destroys the exercise, so the piano is visual only until reveal.
- **Component reuse versus state reuse:** `OctavePicker` is shared UI only. Reference owns its remembered octave, while each octave question owns a fresh nullable answer. Tests must guard against accidental state coupling.
- **Color-only meaning:** Text, focus, accessible labels, and pressed state remain authoritative.
- **Scramble migration:** Combining three old booleans loses per-exercise detail; `any(true)` best preserves an existing opt-in.

## Explicitly out of scope

- Persisting Identify mode across reloads.
- A separate Octaves route/tab.
- A By octave history chart.
- Candidate-note playback before submission.
- Any change to existing Note generation, scoring, or stored-history meaning.
