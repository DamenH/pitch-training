<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    open = $bindable(false),
    label,
    children,
  }: {
    open?: boolean;
    label: string;
    children: Snippet;
  } = $props();

  let dialog: HTMLDialogElement | undefined = $state();

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  });
</script>

<!--
  A modal choice: slides up from the bottom edge on phones, a small centred dialog elsewhere.
  Tapping outside or pressing Escape dismisses it.
-->
<dialog
  bind:this={dialog}
  aria-label={label}
  onclose={() => { open = false; }}
  onclick={(e) => { if (e.target === dialog) open = false; }}
>
  <div class="sheet">
    <span class="grabber" aria-hidden="true"></span>
    {@render children()}
  </div>
</dialog>

<style>
  dialog {
    width: min(100%, 400px);
    max-width: none;
    margin: auto;
    padding: 0;
    border: 0;
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--text);
    box-shadow: 0 16px 48px rgb(0 0 0 / 0.24);
  }

  dialog::backdrop {
    background: var(--scrim);
  }

  dialog[open] {
    animation: pop 200ms var(--ease);
  }

  dialog[open]::backdrop {
    animation: fade 200ms;
  }

  .sheet {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-4);
  }

  .grabber {
    display: none;
  }

  @keyframes pop {
    from {
      opacity: 0;
      transform: scale(0.96);
    }
  }

  @keyframes fade {
    from {
      opacity: 0;
    }
  }

  @keyframes slide-up {
    from {
      transform: translateY(100%);
    }
  }

  @media (max-width: 600px) and (pointer: coarse) {
    dialog {
      width: 100%;
      margin: auto 0 0;
      border-radius: var(--radius) var(--radius) 0 0;
    }
    dialog[open] {
      animation: slide-up 260ms var(--ease);
    }
    .sheet {
      padding-bottom: calc(var(--space-4) + var(--safe-bottom));
    }
    .grabber {
      display: block;
      align-self: center;
      width: 36px;
      height: 5px;
      margin: -6px 0 var(--space-2);
      border-radius: 999px;
      background: var(--surface-3);
    }
  }
</style>
