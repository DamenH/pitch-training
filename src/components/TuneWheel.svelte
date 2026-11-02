<script lang="ts">
  /**
   * A knob seen side-on, turned by dragging or scrolling. It reports movement only, in px of drag,
   * so where your finger is says nothing about the value; the parent decides what a pixel is worth.
   */
  let {
    enabled,
    travel,
    position,
    label,
    hint,
    onturn,
    accent = 'var(--anchor)',
  }: {
    enabled: boolean;
    /** The value in px of drag, so the ridges scroll with it like a turning knob. */
    travel: number;
    /** 0–100 within the round's range, for assistive technology. */
    position: number;
    label: string;
    hint: string;
    onturn: (px: number) => void;
    accent?: string;
  } = $props();

  /** Ridge spacing, in px. */
  const RIDGE = 14;

  let dragY: number | null = null;
  function onpointerdown(e: PointerEvent) {
    if (!enabled) return;
    dragY = e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onpointermove(e: PointerEvent) {
    if (dragY === null) return;
    onturn(dragY - e.clientY);
    dragY = e.clientY;
  }
  function onpointerup() {
    dragY = null;
  }

  let wheel: HTMLElement | undefined = $state();
  $effect(() => {
    if (!wheel) return;
    const el = wheel;
    // Not passive, so scrolling the wheel turns it instead of the page.
    const onwheel = (e: WheelEvent) => {
      if (!enabled) return;
      e.preventDefault();
      onturn(-e.deltaY * (e.deltaMode === 1 ? 4 : 0.1));
    };
    el.addEventListener('wheel', onwheel, { passive: false });
    return () => el.removeEventListener('wheel', onwheel);
  });

  const turn = $derived(((-travel % RIDGE) + RIDGE) % RIDGE);
</script>

<div
  class="wheel"
  class:idle={!enabled}
  bind:this={wheel}
  role="slider"
  tabindex="0"
  aria-label={label}
  aria-valuemin={0}
  aria-valuemax={100}
  aria-valuenow={position}
  aria-disabled={!enabled}
  style:--turn={`${turn}px`}
  style:--accent-line={accent}
  {onpointerdown}
  {onpointermove}
  {onpointerup}
  onpointercancel={onpointerup}
>
  <span class="hint">{hint}</span>
</div>

<style>
  /* Ridges scroll past a fixed centre line, darker towards the edges. */
  .wheel {
    position: relative;
    display: grid;
    place-items: center;
    min-height: 240px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background:
      linear-gradient(var(--surface), transparent 30%, transparent 70%, var(--surface)),
      repeating-linear-gradient(180deg, var(--border) 0 3px, transparent 3px 14px) 0 var(--turn) / 100% 14px,
      var(--surface-2);
    cursor: ns-resize;
    touch-action: none;
    -webkit-user-select: none;
    user-select: none;
  }
  .wheel::before {
    content: '';
    position: absolute;
    left: 12%;
    right: 12%;
    top: 50%;
    height: 2px;
    border-radius: 1px;
    background: var(--accent-line);
    opacity: 0.7;
  }
  .wheel.idle {
    cursor: default;
    opacity: 0.6;
  }
  .wheel:focus-visible {
    outline: 3px solid var(--focus);
    outline-offset: 3px;
  }
  .hint {
    position: relative;
    top: 28px;
    padding: 2px 10px;
    border-radius: 999px;
    background: var(--surface);
    color: var(--text-muted);
    font-size: var(--text-sm);
    pointer-events: none;
  }

  @media (orientation: portrait) and (max-width: 899px) {
    .wheel {
      flex: 1;
      max-height: 420px;
    }
  }

  @media (orientation: landscape) and (max-height: 500px) {
    .wheel {
      min-height: 150px;
    }
  }
</style>
