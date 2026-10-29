<script lang="ts" module>
  export type IconName =
    | 'piano'
    | 'ear'
    | 'mic'
    | 'check'
    | 'chart'
    | 'gear'
    | 'note'
    | 'play'
    | 'stop'
    | 'plus'
    | 'arrow-right'
    | 'back'
    | 'share'
    | 'download'
    | 'upload'
    | 'trash'
    | 'anchor'
    | 'sliders'
    | 'volume'
    | 'volume-off';
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
  {:else if name === 'arrow-right'}
    <path d="M5 12h14M13 6l6 6-6 6" />
  {:else if name === 'back'}
    <path d="m15 5-7 7 7 7" />
  {:else if name === 'share'}
    <path d="M12 3v12M7 8l5-5 5 5" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
  {:else if name === 'download'}
    <path d="M12 3v12M7 10l5 5 5-5" /><path d="M5 21h14" />
  {:else if name === 'upload'}
    <path d="M12 15V3M7 8l5-5 5 5" /><path d="M5 21h14" />
  {:else if name === 'trash'}
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
  {:else if name === 'anchor'}
    <circle cx="12" cy="5" r="2" /><path d="M12 7v14M8 11h8M5 14a7 7 0 0 0 14 0" />
  {:else if name === 'volume'}
    <path d="M4 9v6h4l5 4V5L8 9H4z" /><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />
  {:else if name === 'volume-off'}
    <path d="M4 9v6h4l5 4V5L8 9H4z" /><path d="M17 9l5 6M22 9l-5 6" />
  {:else if name === 'sliders'}
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" />
  {/if}
</svg>
