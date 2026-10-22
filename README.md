# Pitch Training

A local-first web app for practising **absolute pitch**: identifying notes by ear and singing notes
without a reference. It runs entirely in the browser — no backend, no accounts, no network access
needed for exercises. Microphone audio is analysed in memory on your device and never leaves it.

**[Open Pitch Training](https://damenh.github.io/pitch-training/)** ·
[Sharing protocol and agent guide](https://damenh.github.io/pitch-training/agents.txt)

## Features

| Destination | What it does |
| --- | --- |
| **Reference Library** | Polyphonic piano (octaves 1–7): hold multiple computer keys or touch several piano keys at once. Shows note name, octave and frequency. Build a short reference sequence or import, save, play and share piano pieces from MIDI files, JSON text or encoded links. Computer keys `A W S E D F T G Y H U J` play C–B, `Z`/`X` change octave. |
| **Identify Notes** | Tap *Play note* to hear a random note, choose its pitch class on a labeled piano (silent until you submit), submit. After submitting, play any piano key to compare notes in the target's octave. No timer. Shows the correct note, your answer and the octave played. Optional single-play mode. Keys: `R`/`Space` play, `C`–`B` choose or play comparison notes after submitting (`Shift` = sharp), `Enter` submit / next. |
| **Sing — Practice** | Shows a target note; live tuner-style feedback (detected note, cents, above/below/on target). Never auto-advances. A *Detector details* panel shows raw frequency, clarity, level and the reference note, so octave errors are visible. |
| **Sing — Test** | Shows a target; no pitch feedback while you sing (only "listening / steady note" status). *Check Answer* evaluates the latest stable pitch. Unlimited checks per question. |
| **Mixed Practice** | Randomly alternates Identify and Sing — Test, reusing the same components and scoring. |
| **Settings** (gear) | Enabled notes (all / naturals / custom, never empty), playback octave range, vocal range with presets, scoring policy, tolerance, replay policy, volume, duration, sound (sampled grand piano, sine, triangle, warm), sharps/flats, history on/off, reset. |
| **History** (chart) | Totals, accuracy per exercise and per pitch class, average response time, recent answers, *Clear history*. |

There are no streaks, goals, timers, or question limits: practise as long as you like.

## Piano pieces and links

### Compact sharing links

Custom **Copy piece link** URLs use `#/reference?p=...`: a versioned binary
score, optionally raw-DEFLATE compressed, then base64url encoded. Common duration
and velocity are stored once, notes share onset groups, and times use deltas.
Unedited built-ins use their existing short `?example=ID` links. Legacy `?score=`
JSON and `?midi=` links still open. Storage, text input and JSON exports keep their
original format and precision.

Sharing tradeoff: times/durations are rounded to milliseconds (minimum duration
1 ms; endpoints clamped to one hour) and velocities to 7 bits. Ordinary timing
error is at most 0.5 ms; endpoint/minimum-duration adjustments stay below 1 ms.
Decoded links must still pass all existing note/voice limits. The
[fflate](https://github.com/101arrowz/fflate) dependency is bundled locally.

Measured URL **fragment** sizes, excluding the common host/path:

| Piece | Previous JSON | MIDI | Compact | Reduction vs JSON |
| --- | ---: | ---: | ---: | ---: |
| C major chord | 277 | 143 | 48 | 83% |
| C major scale | 1,160 | 289 | 89 | 92% |
| Chromatic scale | 1,889 | 412 | 122 | 94% |
| Twinkle, Twinkle | 3,796 | 635 | 162 | 96% |
| Frère Jacques round | 4,740 | 912 | 214 | 95% |

Run `npm run benchmark:links` to reproduce the measurements, `npm run check &&
npm test` for checks, or `npm run test:pwa` for browser/offline checks. These
measurements use self-contained data; unchanged built-in references are shorter.

In **Reference Library → Piano pieces**, choose/drop a `.mid` / `.midi` file,
choose/drop a JSON score file, or paste JSON under **Paste a text score**. Load the
included chord example to try it. **Save to library** keeps any imported piece on
this device; **Copy piece link** embeds it in a URL fragment. **Export score**
downloads a JSON backup. Links load a preview without automatically playing or saving.
Playback highlights sounding notes in the selected octave of the reference piano.

**Built-in MIDI examples** includes C major, A natural minor, chromatic scales,
octave leaps, and simple transcriptions of three public-domain melodies: Beethoven's
[Ode to Joy](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=528), the traditional
[Twinkle, Twinkle, Little Star](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=2236)
tune, and a two-voice [Frère Jacques](https://noctavepiano.com/en/sheet-music/trad-frere-jacques/)
round. They are generated locally and work offline without a library save or network
fetch. The reference links identify the works; third-party MIDI performances or
modern arrangements are not bundled. Save a copy to edit; removing a saved copy
does not remove the built-in example. **Download MIDI** exports the current piece
as a standard piano-only `.mid` file (including imported or edited pieces).
Stable links such as `#/reference?example=c-major-scale` load examples directly;
all supported IDs are listed in `agents.txt`.

All imported tracks use the existing sampled piano, regardless of program number;
percussion is skipped. Type 0/1 PPQ MIDI timing (including tempo changes), velocity,
and CC64 sustain are supported. Type 2/SMPTE MIDI, other instrument sounds, bends,
and physical MIDI input are not supported yet. Long notes decay after approximately
four seconds because the bundled recordings are finite.

The versioned JSON format and raw-MIDI base64url encoding are documented in
[public/agents.txt](public/agents.txt). That file is shipped as a **real static file**
beside the built HTML, available at `APP_BASE/agents.txt` to browsers and `curl`
without JavaScript or a service worker. It is not the sharing host's root `/agents.txt`.
Legacy links use `#/reference?score=BASE64URL_UTF8_JSON` or
`#/reference?midi=BASE64URL_ORIGINAL_MIDI_BYTES`. These payloads are unpadded, not compressed,
and limited to 64,000 characters; use file export/import for larger pieces.

The library uses a path-namespaced IndexedDB database with localStorage fallback.
Settings/history/reference-sequence keys are also path-namespaced; legacy values
are copied once without deleting origin-wide data. This prevents accidental
collisions between apps/paths, not access by other code on the same origin.
Quota and browser origin-clearing still apply to all apps at that origin.
[Storage Buckets](https://developer.chrome.com/docs/web-platform/storage-buckets)
can separate eviction management on supported browsers; they are not security
isolation. Separate origins are required for that. Export backups of saved pieces.

## Development

Requires Node.js 20.19+ (22 recommended).

```sh
npm install
npm run dev        # http://localhost:5173 (microphone works on localhost)
npm run check      # svelte-check + TypeScript (strict)
npm test           # Vitest unit tests for the music/scoring/detection logic
npm run build      # production build into dist/
npm run preview    # serve dist/ locally
npm run verify     # check + test + build
```

To test on a phone on your LAN, run `npm run dev -- --host`. Note that browsers only allow the
microphone on **https** or `localhost`, so for singing on a phone use the GitHub Pages deployment
(or an https tunnel).

## Deployment to GitHub Pages

For a portable single-file version, run `npm run build:single`. It creates
`dist-single/index.html` with JavaScript, CSS, the icon and all 28 piano samples
embedded (including sample attribution). Serve that file over HTTPS for microphone
access on phones. The HTML still works by itself; publish the entire `dist-single/`
directory to also provide installation and offline support. Both builds include a
manifest, app icons, and a service worker scoped to the app's directory.
The `dist-single/` directory can be published as a static site on the share service.
Rebuild it to update the published app; editing source files alone does not rebuild it.

Open **Settings → Install & offline use** and wait for **Ready offline** before
disconnecting. The first online visit saves every exercise and all piano sounds;
singing detects pitch locally after microphone permission is granted. Use **Install
Pitch Training** when offered, the browser's install menu, or Safari's **Share →
Add to Home Screen** on iPhone/iPad. Installation requires HTTPS or localhost
([browser requirements](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable)).
Offline caching is disabled in the Vite development server. Settings and history
stay in local storage. Browser storage cleanup can remove offline files.
Updates download in the background and activate after all app windows close.

To verify offline behavior in Chromium: `npx playwright install chromium`, then
`npm run test:pwa` (builds both variants and tests them under separate URL subpaths).
Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to use a system Chrome/Chromium instead.

The public repository is [DamenH/pitch-training](https://github.com/DamenH/pitch-training).
Pushes to `main` (or a manual workflow run) use `.github/workflows/deploy.yml` to
type-check, test, build and deploy `dist/` to GitHub Pages.

For your own fork, enable **Settings → Pages → Source → GitHub Actions** and
run the workflow on `main`. The included workflow requests the Pages permissions
needed to publish the build.

The build uses a relative base (`./`) and hash routing (`#/identify`, `#/settings`, …), so it works
at a domain root or under any repository subpath such as `https://user.github.io/pitch-training/`
without server-side rewrites. To force an absolute base instead, build with
`BASE_PATH=/pitch-training/ npm run build`.

## Architecture

```
src/
  domain/          Pure, framework-free TypeScript (fully unit-tested)
    music.ts         MIDI ↔ frequency, pitch classes, naming, cents, octave equivalence
    pitch.ts         Observation reliability + StablePitchTracker (stable-note detection)
    exercise.ts      Question generation, pitch comparison, answer evaluation
    settings.ts      Settings model, defaults, validation
    history.ts       History entries and summaries
    score.ts         MIDI/JSON import/export and score validation
    compactScore.ts  Compact binary sharing codec
    examples.ts      Generated practice patterns and public-domain melodies
  audio/           Browser APIs
    context.ts       Single shared AudioContext, resumed from user gestures
    synth.ts         Polyphonic sampled piano/oscillators, envelopes and score scheduling
    microphone.ts    getUserMedia + AnalyserNode + Pitchy (McLeod Pitch Method)
  lib/             Svelte 5 reactive stores (settings, history, mic, router) and helpers
  components/      Piano, NoteChooser, PitchMeter, MicPanel, IdentifyQuestion, SingQuestion
  pages/           ExercisePage (shared by all four exercise modes), Reference, Settings, History
tests/             Vitest specs, including synthetic pitch-observation sequences
```

The exercise model keeps five things distinct:

1. **Question** — generated target (`createQuestion`), with the scoring policy captured at creation.
2. **Observation** — one raw detector frame `{time, frequency, clarity, rms}`.
3. **Stable pitch** — produced by `StablePitchTracker` only after a consistent run of reliable frames.
4. **Submission** — the latest stable pitch at the moment of *Check Answer* (or the chosen pitch class in Identify).
5. **Result** — `evaluateIdentify` / `evaluateSing` output.

All four exercise destinations render `ExercisePage` with a list of exercise kinds
(`['identify']`, `['sing-practice']`, `['sing-test']`, or `['identify', 'sing-test']` for Mixed).

## Piano sound

The default sound is a sampled grand piano: the
[Salamander Grand Piano V3](https://archive.org/details/SalamanderGrandPianoV3) by Alexander Holm,
licensed [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) (credited in Settings and in
`public/samples/piano/LICENSE.txt`). The samples ship with the app (`public/samples/piano/`, ~0.8 MB),
so playback needs no third-party network access.

- 28 recordings, C1–A7, one every minor third, so any note is played from a recording at most one
  semitone away (B7 is two semitones).
- Each file is the 128 kbps MP3 distributed with Tone.js, shortened losslessly to 4.6 s by
  `scripts/trim-mp3.py` (cut at an MP3 frame boundary, no re-encoding). Notes are never held longer
  than the 4 s maximum duration, and the shorter files keep phone memory use low (~1.6 MB per decoded sample).
- **Tuning:** real pianos are stretch-tuned (the top of this one is up to 40¢ sharp). Each sample's
  measured deviation is stored in `src/audio/pianoSamples.ts` and compensated through `playbackRate`.
  When every note C1–B7 was rendered and measured, all were within ±5¢ of 12-TET A440 (mean ≈1.5¢).
  The lowest octave is the least certain, because the fundamental is weak there.
- Levels are peak-normalized per sample so registers play at similar loudness.
- Samples load on demand: the visible octave in the Reference Library, and the configured octave range
  in Identify. If a sample can't load, that note falls back to a synthesized tone.

## Pitch detection and scoring details

- **Capture:** mono, with echo cancellation, noise suppression and auto-gain disabled where the browser
  honours it; falls back to default constraints if rejected. Analysis uses 2048-sample windows
  (~43 ms) once per animation frame.
- **Reliability filter:** a frame becomes a note candidate only if RMS ≥ 0.006, MPM clarity ≥ 0.85 and
  frequency is within 55–1600 Hz. Quiet frames are *silent*, low-clarity frames are *unclear*
  (background noise is never labelled as a note).
- **Stability:** a pitch is stable once voiced sound has lasted ≥ **250 ms** (dropouts < 90 ms
  tolerated), with ≥ 5 frames in that window and ≥ 80 % of them within ±35 cents of the window median.
  The stable value is the median of the consistent frames, so a stray octave jump is outvoted.
  Glides while exploring your range don't qualify.
- **Retention:** after you stop singing, the last stable pitch can still be submitted for **2 s**.
  Older than that, the app reports "no recent steady note" instead of scoring stale data.
- **Scoring:** *Any octave* (default) measures cents against the nearest octave of the target pitch
  class (so A3/A4/A5 all count for A); *Exact note* measures against the exact target. Tolerance
  (default ±50 ¢, configurable 5–100 ¢) is inclusive.
- **Octave errors:** MPM can report an octave too high or low, especially for low or breathy voices.
  Practice mode exposes the detected octave and raw data; in any-octave scoring this does not affect
  the result.
- **History rules for singing:** the first check with a stable pitch is the scored answer for that
  question (later checks are feedback). A question where only "no detection" checks happened is
  stored once as a *failed detection*, which is not counted as incorrect. Practice mode is never scored.

## Tradeoffs and limitations

- **Offline storage:** a service worker caches the app and all piano sounds. Updates activate
  after all app windows close. Browser storage cleanup can remove offline files and saved data.
- **iOS:** the hardware silent switch mutes Web Audio playback on some iOS versions — turn it off if
  you hear nothing. While the microphone is active, iOS may route playback differently or lower its
  volume; the mic is released when you leave a singing page, press *Stop*, or the tab is hidden.
- **Mixed Practice** keeps the microphone running across Identify questions so you aren't asked for
  permission repeatedly; a "Mic on · stop" badge is shown. Pitch tracking resets on every new
  question, so a note played or sung earlier is never scored.
- Pitch-class selection is uniform across enabled notes, then the octave is uniform within range.
  Immediate repeats of the same pitch class are avoided when more than one note is enabled.
- Settings, history (capped at 5000 entries) and the reference sequence live in path-namespaced
  `localStorage`; piano pieces use IndexedDB with a localStorage fallback. Clearing site data
  removes them. Music data and microphone recordings are never uploaded by the app.
