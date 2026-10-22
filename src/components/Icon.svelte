<script lang="ts" module>
  export type IconName =
    | 'piano'
    | 'ear'
    | 'mic'
    | 'check'
    | 'shuffle'
    | 'chart'
    | 'gear'
    | 'note'
    | 'play'
    | 'stop'
    | 'plus'
    | 'x'
    | 'arrow-right'
    | 'up'
    | 'down'
    | 'dot';
</script>

<script lang="ts">
  let { name, size = 22 }: { name: IconName; size?: number } = $props();
</script>

<!-- Decorative: every icon is paired with visible text or an aria-label on its control. -->
<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
  focusable="false"
>
  {#if name === 'piano'}
    <rect x="3" y="4" width="18" height="16" rx="2" /><path d="M8 4v10M12 4v10M16 4v10M8 14v6M16 14v6M12 14v6" />
  {:else if name === 'ear'}
    <path d="M6 9a6 6 0 1 1 12 0c0 4-4 5-4 8a3 3 0 0 1-6 0" /><path d="M9.5 9a2.5 2.5 0 1 1 5 0c0 1.5-1.5 2-1.5 3" />
  {:else if name === 'mic'}
    <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  {:else if name === 'check'}
    <circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" />
  {:else if name === 'shuffle'}
    <path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
  {:else if name === 'chart'}
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  {:else if name === 'gear'}
    <circle cx="12" cy="12" r="3" /><path
      d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"
    />
  {:else if name === 'note'}
    <path d="M9 17.5V5.5l11-2v12" /><ellipse cx="6.6" cy="17.6" rx="2.6" ry="2" fill="currentColor" stroke="none" /><ellipse
      cx="17.6"
      cy="15.6"
      rx="2.6"
      ry="2"
      fill="currentColor"
      stroke="none"
    />
  {:else if name === 'play'}
    <path d="M7 4.5v15l13-7.5z" fill="currentColor" stroke="none" />
  {:else if name === 'stop'}
    <rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" stroke="none" />
  {:else if name === 'plus'}
    <path d="M12 5v14M5 12h14" />
  {:else if name === 'x'}
    <path d="M6 6l12 12M18 6 6 18" />
  {:else if name === 'arrow-right'}
    <path d="M5 12h14M13 6l6 6-6 6" />
  {:else if name === 'up'}
    <path d="M12 19V5M6 11l6-6 6 6" />
  {:else if name === 'down'}
    <path d="M12 5v14M6 13l6 6 6-6" />
  {:else if name === 'dot'}
    <circle cx="12" cy="12" r="5" fill="currentColor" stroke="none" />
  {/if}
</svg>
