<script lang="ts">
  import type { TempoTarget } from '../domain/tempo';
  import TempoMark from './TempoMark.svelte';

  /** A target tempo as the settings say to write it: 96 BPM, ♩ = 96, or Andante. */
  let { target }: { target: TempoTarget } = $props();
</script>

{#if target.term !== null}<em class="term">{target.term}</em>{:else if target.style === 'mark'}<TempoMark
    bpm={target.bpm}
  />{:else}<span class="number">{target.bpm} BPM</span>{/if}

<style>
  .number {
    font-variant-numeric: tabular-nums;
  }
</style>
