<script lang="ts">
  /** A metronome mark, ♩ = 96, with the note drawn: most fonts' ♩ is small and badly spaced. */
  let { bpm }: { bpm: number } = $props();
</script>

<span class="tempo-mark"
  ><svg viewBox="0 0 10 20" aria-hidden="true" focusable="false"
    ><ellipse cx="4.2" cy="16" rx="3.7" ry="2.7" transform="rotate(-22 4.2 16)" fill="currentColor" /><path
      d="M7.55 15.2V1.2"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
    /></svg
  ><span class="visually-hidden">quarter note</span> = {Math.round(bpm)}</span
>

<style>
  .tempo-mark {
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  svg {
    width: 0.55em;
    height: 1.1em;
    margin-right: 0.1em;
    vertical-align: -0.2em;
  }
</style>
