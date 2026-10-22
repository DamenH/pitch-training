<script lang="ts">
  import { href, router, type Route } from './lib/router.svelte';
  import ImportPage from './pages/ImportPage.svelte';
  import ReferencePage from './pages/ReferencePage.svelte';
  import ExercisePage from './pages/ExercisePage.svelte';
  import SettingsPage from './pages/SettingsPage.svelte';
  import HistoryPage from './pages/HistoryPage.svelte';
  import Icon, { type IconName } from './components/Icon.svelte';

  interface NavItem {
    route: Route;
    label: string;
    short: string;
    icon: IconName;
  }

  const NAV: NavItem[] = [
    { route: 'reference', label: 'Reference Library', short: 'Reference', icon: 'piano' },
    { route: 'identify', label: 'Identify Notes', short: 'Identify', icon: 'ear' },
    { route: 'sing-practice', label: 'Sing — Practice', short: 'Sing', icon: 'mic' },
    { route: 'sing-test', label: 'Sing — Test', short: 'Sing test', icon: 'check' },
    { route: 'import', label: 'Import pieces', short: 'Import', icon: 'plus' },
  ];

  const TITLES: Record<Route, string> = {
    reference: 'Reference Library',
    identify: 'Identify Notes',
    'sing-practice': 'Sing Notes — Practice',
    'sing-test': 'Sing Notes — Test',
    import: 'Import pieces',
    settings: 'Settings',
    history: 'History',
  };

  let main: HTMLElement | undefined = $state();

  const isExercise = $derived(['identify', 'sing-practice', 'sing-test'].includes(router.current));

  $effect(() => {
    document.title = `${TITLES[router.current]} · Pitch Training`;
  });

  // Move focus to the page on navigation so keyboard and screen-reader users land in the new content.
  let first = true;
  $effect(() => {
    void router.current;
    if (first) {
      first = false;
      return;
    }
    main?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  });
</script>

<a class="skip" href="#main" onclick={(e) => { e.preventDefault(); main?.focus(); }}>Skip to content</a>

<header class="top">
  <div class="top-inner">
    <a class="brand" href={href('identify')} aria-label="Pitch Training home">
      <Icon name="note" />
      <span>Pitch Training</span>
    </a>
    <nav class="desktop-nav" aria-label="Exercises">
      {#each NAV as item (item.route)}
        <a href={href(item.route)} aria-current={router.current === item.route ? 'page' : undefined}>
          <span class="full">{item.label}</span><span class="short">{item.short}</span>
        </a>
      {/each}
    </nav>
    <div class="tools">
      <a
        class="tool"
        href={href('history')}
        aria-current={router.current === 'history' ? 'page' : undefined}
        aria-label="History"
        title="History"
      >
        <Icon name="chart" />
      </a>
      <a
        class="tool"
        href={href('settings')}
        aria-current={router.current === 'settings' ? 'page' : undefined}
        aria-label="Settings"
        title="Settings"
      >
        <Icon name="gear" />
      </a>
    </div>
  </div>
</header>

<main id="main" bind:this={main} tabindex="-1">
  <h1 class="page-title" class:narrow={router.current !== 'reference'} class:exercise={isExercise}>{TITLES[router.current]}</h1>
  {#if router.current === 'reference'}
    <ReferencePage />
  {:else if router.current === 'identify'}
    <ExercisePage kind="identify" />
  {:else if router.current === 'sing-practice'}
    <ExercisePage kind="sing-practice" />
  {:else if router.current === 'sing-test'}
    <ExercisePage kind="sing-test" />
  {:else if router.current === 'import'}
    <ImportPage />
  {:else if router.current === 'settings'}
    <SettingsPage />
  {:else}
    <HistoryPage />
  {/if}
</main>

<!-- Bottom tab bar on phones; a side rail on short landscape screens, where it also takes over the header's links. -->
<nav class="tabbar" aria-label="Main">
  {#each NAV as item (item.route)}
    <a href={href(item.route)} aria-current={router.current === item.route ? 'page' : undefined}>
      <Icon name={item.icon} />
      <span>{item.short}</span>
    </a>
  {/each}
  <div class="rail-only">
    <a href={href('history')} aria-current={router.current === 'history' ? 'page' : undefined}>
      <Icon name="chart" />
      <span>History</span>
    </a>
    <a href={href('settings')} aria-current={router.current === 'settings' ? 'page' : undefined}>
      <Icon name="gear" />
      <span>Settings</span>
    </a>
  </div>
</nav>

<style>
  .skip {
    position: absolute;
    left: 8px;
    top: -100px;
    z-index: 100;
    background: var(--surface);
    padding: 8px 12px;
    border-radius: var(--radius-sm);
  }
  .skip:focus {
    top: calc(8px + var(--safe-top));
  }

  .top {
    position: sticky;
    top: 0;
    z-index: 10;
    background: color-mix(in srgb, var(--bg) 92%, transparent);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border-bottom: 1px solid var(--border);
    padding-top: var(--safe-top);
  }

  .top-inner {
    display: flex;
    align-items: center;
    gap: 12px;
    max-width: 1100px;
    margin: 0 auto;
    min-height: var(--header-height);
    padding: 0 calc(16px + var(--safe-right)) 0 calc(16px + var(--safe-left));
  }

  .brand {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-weight: 700;
    color: var(--text);
    text-decoration: none;
    white-space: nowrap;
  }

  .desktop-nav {
    display: none;
  }

  .tools {
    margin-left: auto;
    display: flex;
    gap: 4px;
  }

  .tool {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border-radius: var(--radius-sm);
    color: var(--text-muted);
  }
  .tool[aria-current='page'] {
    color: var(--accent);
    background: var(--surface-2);
  }
  @media (hover: hover) {
    .tool:hover {
      color: var(--accent);
      background: var(--surface-2);
    }
  }

  main {
    max-width: var(--content-max);
    margin: 0 auto;
    padding: 16px calc(16px + var(--safe-right)) calc(var(--nav-height) + var(--safe-bottom) + 24px)
      calc(16px + var(--safe-left));
    outline: none;
  }

  .page-title {
    font-size: 1.25rem;
    margin-bottom: 12px;
  }

  .page-title.narrow {
    max-width: 640px;
    margin-inline: auto;
  }

  .tabbar {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 10;
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    background: var(--surface);
    border-top: 1px solid var(--border);
    padding: 0 var(--safe-right) var(--safe-bottom) var(--safe-left);
  }

  .tabbar a {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    min-height: var(--nav-height);
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--text-muted);
    text-decoration: none;
    text-align: center;
    line-height: 1.1;
  }

  .tabbar a[aria-current='page'] {
    color: var(--accent);
  }

  .tabbar a:active {
    background: var(--surface-2);
  }

  .rail-only {
    display: none;
  }

  .tabbar a[aria-current='page'] :global(svg) {
    background: var(--accent-soft);
    border-radius: 999px;
    padding: 2px 10px;
    box-sizing: content-box;
  }

  /* Short landscape (phones on their side): every pixel of height counts, so the header and
     tab bar fold into a rail down the left edge. */
  @media (orientation: landscape) and (max-height: 500px) {
    .top {
      display: none;
    }
    .skip:focus {
      left: calc(var(--rail-width) + var(--safe-left) + 8px);
      top: 8px;
    }
    .tabbar {
      top: 0;
      right: auto;
      width: calc(var(--rail-width) + var(--safe-left));
      grid-template-columns: 1fr;
      grid-auto-rows: minmax(44px, 1fr);
      border-top: 0;
      border-right: 1px solid var(--border);
      padding: var(--safe-top) 0 var(--safe-bottom) var(--safe-left);
      overflow-y: auto;
    }
    .tabbar a {
      min-height: 44px;
      font-size: 0.66rem;
    }
    .rail-only {
      display: contents;
    }
    .rail-only a:first-child {
      border-top: 1px solid var(--border);
    }
    main {
      padding: calc(12px + var(--safe-top)) calc(16px + var(--safe-right)) calc(16px + var(--safe-bottom))
        calc(var(--rail-width) + var(--safe-left) + 16px);
    }
    .page-title {
      font-size: 1.1rem;
      margin-bottom: 8px;
    }
    .page-title.exercise {
      max-width: none;
    }
  }

  @media (min-width: 900px) and (min-height: 501px) {
    .desktop-nav {
      display: flex;
      gap: 4px;
      margin-left: 16px;
    }
    .desktop-nav a {
      padding: 8px 12px;
      border-radius: var(--radius-sm);
      color: var(--text-muted);
      text-decoration: none;
      font-weight: 600;
      font-size: 0.95rem;
      white-space: nowrap;
    }
    .desktop-nav a:hover {
      background: var(--surface-2);
      color: var(--text);
    }
    .desktop-nav .full {
      display: none;
    }
    .desktop-nav a[aria-current='page'] {
      background: var(--accent-soft);
      color: var(--accent);
    }
    .tabbar {
      display: none;
    }
    main {
      padding-bottom: 48px;
      padding-top: 24px;
    }
  }

  /* Full exercise names need ~1060px alongside the brand and tools; below that, short ones. */
  @media (min-width: 1080px) and (min-height: 501px) {
    .desktop-nav .full {
      display: inline;
    }
    .desktop-nav .short {
      display: none;
    }
  }
</style>
