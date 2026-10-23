<script lang="ts">
  let {
    octaves,
    value,
    onselect,
    answer = null,
    correct = null,
    disabled = false,
  }: {
    octaves: readonly number[];
    value: number | null;
    onselect: (octave: number) => void;
    answer?: number | null;
    correct?: number | null;
    disabled?: boolean;
  } = $props();

  function label(octave: number): string {
    if (correct === octave) return `Octave ${octave}, correct answer`;
    if (answer === octave && answer !== correct) return `Octave ${octave}, your answer, incorrect`;
    return `Octave ${octave}`;
  }
</script>

<fieldset class="octaves" {disabled}>
  <legend class="visually-hidden">Octave</legend>
  <div class="board">
    {#each octaves as octave (octave)}
      <button
        type="button"
        class:selected={value === octave}
        class:correct={correct === octave}
        class:wrong={answer === octave && answer !== correct}
        aria-pressed={value === octave}
        aria-label={label(octave)}
        onclick={() => onselect(octave)}
      >
        {#if correct === octave}<span aria-hidden="true">✓ </span>{/if}
        {#if answer === octave && answer !== correct}<span aria-hidden="true">✗ </span>{/if}
        {octave}
      </button>
    {/each}
  </div>
</fieldset>

<style>
  .octaves {
    width: 100%;
    max-width: 720px;
    margin-inline: auto;
    border: 0;
    padding: 0;
    min-width: 0;
  }
  .board {
    display: grid;
    grid-auto-columns: 1fr;
    grid-auto-flow: column;
    gap: 2px;
    padding: 4px 4px 5px;
    border-radius: var(--radius-sm) var(--radius-sm) 0 0;
    background: var(--key-black);
  }
  button {
    min-width: 0;
    min-height: 40px;
    padding: 0 var(--space-2);
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: color-mix(in srgb, var(--key-black-text) 60%, transparent);
    font-size: var(--text-sm);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  button.selected {
    background: var(--key-black-selected);
    color: var(--key-black-selected-text);
  }
  button.correct {
    background: var(--good);
    color: var(--surface);
  }
  button.wrong {
    background: var(--bad);
    color: var(--surface);
  }
  @media (pointer: fine) {
    button {
      min-height: 32px;
    }
  }
</style>
