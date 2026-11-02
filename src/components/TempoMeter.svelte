<script lang="ts">
  /** Where an answer landed against its target, in %: slow on the left, fast on the right. */
  let { errorPct, tolerancePct = 0 }: { errorPct: number; tolerancePct?: number } = $props();

  const RANGE = 20;
  const at = $derived(Math.max(-1, Math.min(1, errorPct / RANGE)));
  const band = $derived(Math.min(1, tolerancePct / RANGE));
</script>

<div class="meter" aria-hidden="true">
  {#if band > 0}<span class="band" style:--w={band}></span>{/if}
  <span class="zero"></span>
  <span class="marker" class:off={Math.abs(errorPct) > RANGE} style:--at={at}></span>
  <span class="tick slow">−{RANGE}% slow</span>
  <span class="tick fast">fast +{RANGE}%</span>
</div>

<style>
  .meter {
    position: relative;
    width: 100%;
    height: 44px;
  }
  .meter::before {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    top: 15px;
    height: 2px;
    background: var(--border);
  }
  .band,
  .zero,
  .marker {
    position: absolute;
    top: 6px;
    height: 20px;
  }
  .band {
    left: calc(50% - var(--w) * 50%);
    width: calc(var(--w) * 100%);
    border-radius: 6px;
    background: var(--good-soft);
  }
  .zero {
    left: calc(50% - 1px);
    width: 2px;
    background: var(--text-muted);
  }
  .marker {
    left: calc(50% + var(--at) * 50% - 7px);
    width: 14px;
    border-radius: 7px;
    background: var(--tempo);
  }
  .marker.off {
    opacity: 0.5;
  }
  .tick {
    position: absolute;
    bottom: 0;
    font-size: var(--text-xs);
    color: var(--text-muted);
  }
  .slow {
    left: 0;
  }
  .fast {
    right: 0;
  }
</style>
