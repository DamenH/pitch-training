<script lang="ts">
  import {
    isNatural,
    noteToMidi,
    pitchClassName,
    spokenNoteName,
    spokenPitchClassName,
    type PitchClass,
    type Spelling,
  } from '../domain/music';

  let {
    octave = null,
    selected = null,
    spelling,
    onpress,
    enabled = null,
    disabled = false,
    correct = null,
    label,
    onrelease,
    active = [],
  }: {
    /** Octave for labels; null for pitch classes only (no octave). */
    octave?: number | null;
    selected?: PitchClass | null;
    spelling: Spelling;
    onpress: (pc: PitchClass) => void;
    /** Enable held keys / multiple pointer contacts for the playable keyboard. */
    onrelease?: (pc: PitchClass) => void;
    active?: readonly PitchClass[];
    /** Keys outside this set are shown but can't be pressed. Null = all enabled. */
    enabled?: readonly PitchClass[] | null;
    disabled?: boolean;
    /** After an answer: marks the correct key, and the selected key if it differs. */
    correct?: PitchClass | null;
    label?: string;
  } = $props();

  // Keys respond on touch-down, like an instrument; click only covers keyboard and assistive activation.
  function pointerDown(e: PointerEvent, pc: PitchClass) {
    const key = e.currentTarget as HTMLButtonElement;
    if (e.button !== 0 || key.disabled) return;
    if (onrelease) key.setPointerCapture(e.pointerId);
    onpress(pc);
  }

  function keyDown(e: KeyboardEvent, pc: PitchClass) {
    if (!onrelease || (e.key !== ' ' && e.key !== 'Enter')) return;
    e.preventDefault();
    e.stopPropagation();
    if (!e.repeat) onpress(pc);
  }

  function keyUp(e: KeyboardEvent, pc: PitchClass) {
    if (!onrelease || (e.key !== ' ' && e.key !== 'Enter')) return;
    e.preventDefault();
    e.stopPropagation();
    onrelease(pc);
  }

  function keyLabel(pc: PitchClass): string {
    const name = octave === null ? spokenPitchClassName(pc, spelling) : spokenNoteName(noteToMidi(pc, octave), spelling);
    if (correct === null) return name;
    if (pc === correct) return `${name}, correct answer`;
    if (pc === selected) return `${name}, your answer, incorrect`;
    return name;
  }

  // Keys are rendered in chromatic order so Tab moves C → C♯ → D …; CSS places them.
  const KEYS: { pc: PitchClass; column: number }[] = [
    { pc: 0, column: 1 },
    { pc: 1, column: 1 },
    { pc: 2, column: 2 },
    { pc: 3, column: 2 },
    { pc: 4, column: 3 },
    { pc: 5, column: 4 },
    { pc: 6, column: 4 },
    { pc: 7, column: 5 },
    { pc: 8, column: 5 },
    { pc: 9, column: 6 },
    { pc: 10, column: 6 },
    { pc: 11, column: 7 },
  ];
</script>

<div
  class="piano"
  role="group"
  aria-label={label ?? (octave === null ? 'Piano keyboard' : `Piano keyboard, octave ${octave}`)}
>
  {#each KEYS as { pc, column } (pc)}
    {@const white = isNatural(pc)}
    <button
      type="button"
      class="key"
      class:white
      class:black={!white}
      class:selected={selected === pc}
      class:playing={active.includes(pc)}
      class:correct={correct !== null && pc === correct}
      class:wrong={correct !== null && pc === selected && pc !== correct}
      class:off={enabled !== null && !enabled.includes(pc)}
      disabled={disabled || (enabled !== null && !enabled.includes(pc))}
      style:grid-column={white ? String(column) : undefined}
      style:left={white ? undefined : `calc(${(column / 7) * 100}% - var(--black-w) / 2)`}
      aria-pressed={onrelease ? active.includes(pc) : selected === pc}
      aria-label={keyLabel(pc)}
      onpointerdown={(e) => pointerDown(e, pc)}
      onpointerup={() => onrelease?.(pc)}
      onpointercancel={() => onrelease?.(pc)}
      onlostpointercapture={() => onrelease?.(pc)}
      onkeydown={(e) => keyDown(e, pc)}
      onkeyup={(e) => keyUp(e, pc)}
      onclick={(e) => {
        if (e.detail !== 0) return;
        onpress(pc);
        // Assistive-technology activation of a held key: release it shortly after.
        if (onrelease) setTimeout(() => onrelease?.(pc), 150);
      }}
    >
      <span class="label">
        {#if correct !== null && pc === correct}<span aria-hidden="true">✓ </span>{/if}
        {#if correct !== null && pc === selected && pc !== correct}<span aria-hidden="true">✗ </span>{/if}
        {pitchClassName(pc, spelling)}
      </span>
    </button>
  {/each}
</div>

<style>
  .piano {
    --black-w: calc(100% / 7 * 0.62);
    position: relative;
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    width: 100%;
    max-width: 720px;
    margin-inline: auto;
    height: clamp(180px, 50vw, 240px);
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
    touch-action: none;
  }

  .key {
    border: 1px solid var(--border);
    padding: 0 0 10px;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    font-weight: 700;
  }

  .white {
    grid-row: 1;
    background: var(--key-white);
    color: #222;
    border-radius: 0 0 var(--radius-sm) var(--radius-sm);
    margin-right: -1px;
    font-size: 1rem;
  }

  .black {
    position: absolute;
    top: 0;
    width: var(--black-w);
    height: 60%;
    background: var(--key-black);
    color: var(--key-black-text);
    border-color: var(--key-black);
    border-radius: 0 0 6px 6px;
    z-index: 1;
    font-size: 0.72rem;
    padding-bottom: 8px;
  }

  .white:active:not(:disabled),
  .white.playing,
  .white.selected {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accent-text);
  }

  .black:active:not(:disabled),
  .black.playing,
  .black.selected {
    background: var(--key-black-selected);
    border-color: var(--key-black-selected);
    color: var(--key-black-selected-text);
    /* Ring keeps a selected black key distinct from neighbouring white keys. */
    box-shadow: 0 0 0 2px var(--key-white);
  }

  .key:disabled {
    cursor: default;
  }

  .white.off {
    background: var(--surface-2);
    color: var(--text-muted);
  }

  .black.off {
    background: color-mix(in srgb, var(--key-black) 55%, var(--surface-2));
    color: color-mix(in srgb, var(--key-black-text) 60%, transparent);
  }

  .key.correct {
    background: var(--good);
    border-color: var(--good);
    color: var(--surface);
  }

  .key.wrong {
    background: var(--bad);
    border-color: var(--bad);
    color: var(--surface);
  }

  .black.correct,
  .black.wrong {
    box-shadow: 0 0 0 2px var(--key-white);
  }

  .key:focus-visible {
    z-index: 2;
  }

  .label {
    pointer-events: none;
  }

  /* Phones on their side: leave room for the controls around the keyboard. */
  @media (orientation: landscape) and (max-height: 500px) {
    .piano {
      height: 160px;
    }
  }
</style>
