<script lang="ts">
  import { tick } from 'svelte';
  import { href, isTab, router, type Route } from './lib/router.svelte';
  import { toast } from './lib/toast.svelte';
  import ImportPage from './pages/ImportPage.svelte';
  import ReferencePage from './pages/ReferencePage.svelte';
  import ExercisePage from './pages/ExercisePage.svelte';
  import SettingsPage from './pages/SettingsPage.svelte';
  import HistoryPage from './pages/HistoryPage.svelte';
  import Icon, { type IconName } from './components/Icon.svelte';

  interface NavItem {
    route: Route;
    label: string;
    icon: IconName;
  }

  const TABS: NavItem[] = [
    { route: 'reference', label: 'Reference', icon: 'piano' },
    { route: 'identify', label: 'Identify', icon: 'ear' },
    { route: 'sing-practice', label: 'Sing', icon: 'mic' },
    { route: 'sing-test', label: 'Test', icon: 'check' },
  ];
  const IMPORT: NavItem = { route: 'import', label: 'Import', icon: 'plus' };
  const TOOLS: NavItem[] = [
    { route: 'history', label: 'History', icon: 'chart' },
    { route: 'settings', label: 'Settings', icon: 'gear' },
  ];

  const TITLES: Record<Route, string> = {
    reference: 'Reference',
    identify: 'Identify',
    'sing-practice': 'Sing',
    'sing-test': 'Sing test',
    import: 'Import',
    settings: 'Settings',
    history: 'History',
  };

  /** Content width per screen: focused exercises stay narrow, the reference spreads out. */
  const WIDTHS: Record<Route, string> = {
    reference: '1120px',
    identify: '640px',
    'sing-practice': '640px',
    'sing-test': '640px',
    import: '640px',
    settings: '920px',
    history: '760px',
  };

  let main: HTMLElement | undefined = $state();
  let scrolled = $state(false);
  const pushed = $derived(!isTab(router.current));

  $effect(() => {
    document.title = `${TITLES[router.current]} · Pitch Training`;
  });

  // On navigation, move focus to the new screen and reopen tabs where they were left.
  let first = true;
  $effect(() => {
    const route = router.current;
    if (first) {
      first = false;
      return;
    }
    main?.focus({ preventScroll: true });
    const y = isTab(route) ? router.savedScroll(route) : 0;
    window.scrollTo(0, y);
    if (y) void tick().then(() => window.scrollTo(0, y));
  });

  function back(e: MouseEvent) {
    if (!router.canGoBack) return;
    e.preventDefault();
    history.back();
  }

  const current = (route: Route) => (router.current === route ? 'page' : undefined);
</script>

<svelte:window onscroll={() => { scrolled = window.scrollY > 4; }} />

<a class="skip" href="#main" onclick={(e) => { e.preventDefault(); main?.focus(); }}>Skip to content</a>

<!-- Installed desktop app with window controls overlay: a drag strip where the title bar was. -->
<div class="titlebar" aria-hidden="true"></div>

<nav class="sidebar" aria-label="Main">
  <a class="brand" href={href('identify')} aria-label="Pitch Training home">
    <span class="logo"><Icon name="note" size={18} /></span>
    <span class="brand-name">Pitch Training</span>
  </a>
  <ul>
    {#each TABS as item (item.route)}
      <li>
        <a href={href(item.route)} aria-current={current(item.route)}>
          <Icon name={item.icon} /><span>{item.route === 'sing-test' ? 'Sing test' : item.label}</span>
        </a>
      </li>
    {/each}
    <li class="divided">
      <a href={href(IMPORT.route)} aria-current={current(IMPORT.route)}>
        <Icon name={IMPORT.icon} /><span>{IMPORT.label}</span>
      </a>
    </li>
  </ul>
  <ul class="tools">
    {#each TOOLS as item (item.route)}
      <li>
        <a href={href(item.route)} aria-current={current(item.route)}>
          <Icon name={item.icon} /><span>{item.label}</span>
        </a>
      </li>
    {/each}
  </ul>
</nav>

<main
  id="main"
  bind:this={main}
  tabindex="-1"
  class:identify-page={router.current === 'identify'}
  style:--page-max={WIDTHS[router.current]}
>
  <header class="pagebar" class:scrolled class:pushed>
    <div class="pagebar-inner">
      {#if pushed}
        <a class="icon-btn back" href={href(router.lastTab)} onclick={back} aria-label="Back"><Icon name="back" /></a>
      {/if}
      <h1>{TITLES[router.current]}</h1>
      <div class="bar-tools">
        {#each TOOLS as item (item.route)}
          <a class="icon-btn" href={href(item.route)} aria-current={current(item.route)} aria-label={item.label} title={item.label}>
            <Icon name={item.icon} />
          </a>
        {/each}
      </div>
    </div>
  </header>

  <div class="page">
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
  </div>
</main>

<nav class="tabbar" aria-label="Tabs">
  {#each TABS as item (item.route)}
    <a href={href(item.route)} aria-current={current(item.route)}>
      <span class="tab-icon"><Icon name={item.icon} /></span>
      <span>{item.label}</span>
    </a>
  {/each}
</nav>

<div class="toast-region" role="status" aria-live="polite">
  {#key toast.id}
    {#if toast.message}<p class="toast">{toast.message}</p>{/if}
  {/key}
</div>

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

  .titlebar {
    display: none;
  }

  /* ---------- Phone portrait: sticky title bar + bottom tab bar ---------- */

  main {
    outline: none;
    padding: 0 calc(var(--gutter) + var(--safe-right)) calc(var(--nav-height) + var(--safe-bottom) + var(--space-5))
      calc(var(--gutter) + var(--safe-left));
  }

  .pagebar {
    position: sticky;
    top: 0;
    z-index: 10;
    margin-inline: calc(-1 * (var(--gutter) + var(--safe-left))) calc(-1 * (var(--gutter) + var(--safe-right)));
    padding: var(--safe-top) calc(var(--gutter) + var(--safe-right)) 0 calc(var(--gutter) + var(--safe-left));
    background: color-mix(in srgb, var(--bg) 88%, transparent);
    backdrop-filter: saturate(1.4) blur(14px);
    -webkit-backdrop-filter: saturate(1.4) blur(14px);
    border-bottom: 1px solid transparent;
    transition: border-color 160ms;
    view-transition-name: pagebar;
  }

  .pagebar.scrolled {
    border-bottom-color: var(--hairline);
  }

  .pagebar-inner {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    min-height: var(--bar-height);
    max-width: var(--page-max);
    margin-inline: auto;
  }

  .pagebar h1 {
    flex: 1;
    font-size: var(--text-lg);
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .back {
    margin-left: -10px;
    color: var(--accent);
  }

  .bar-tools {
    display: flex;
    gap: 2px;
    margin-right: -8px;
  }

  .bar-tools a[aria-current='page'] {
    color: var(--accent);
  }

  .pushed .bar-tools {
    display: none;
  }

  /* Pages lay themselves out by their own width (container queries), not the window's. */
  .page {
    container-type: inline-size;
    max-width: var(--page-max);
    margin-inline: auto;
    padding-top: var(--space-2);
  }

  @media (orientation: portrait) and (max-width: 899px) {
    main.identify-page {
      display: flex;
      flex-direction: column;
      min-height: 100dvh;
      box-sizing: border-box;
    }
    .identify-page .page {
      display: flex;
      flex: 1;
      flex-direction: column;
      width: 100%;
    }
  }

  .sidebar {
    display: none;
  }

  .tabbar {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 10;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    padding: 0 var(--safe-right) var(--safe-bottom) var(--safe-left);
    background: color-mix(in srgb, var(--surface) 90%, transparent);
    backdrop-filter: saturate(1.4) blur(14px);
    -webkit-backdrop-filter: saturate(1.4) blur(14px);
    border-top: 1px solid var(--hairline);
    view-transition-name: tabbar;
    -webkit-user-select: none;
    user-select: none;
  }

  .tabbar a {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    min-height: var(--nav-height);
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--text-muted);
    text-decoration: none;
    -webkit-touch-callout: none;
  }

  .tab-icon {
    display: grid;
    place-items: center;
    width: 52px;
    height: 28px;
    border-radius: 999px;
    transition:
      background-color 160ms,
      transform 90ms var(--ease);
  }

  .tabbar a:active .tab-icon {
    transform: scale(0.9);
  }

  .tabbar a[aria-current='page'] {
    color: var(--accent);
  }

  .tabbar a[aria-current='page'] .tab-icon {
    background: var(--accent-soft);
  }

  .toast-region {
    position: fixed;
    left: 50%;
    bottom: calc(var(--nav-height) + var(--safe-bottom) + var(--space-3));
    z-index: 20;
    transform: translateX(-50%);
    pointer-events: none;
    width: max-content;
    max-width: calc(100vw - 32px);
  }

  .toast {
    padding: 10px 16px;
    border-radius: 999px;
    background: var(--text);
    color: var(--bg);
    font-size: var(--text-sm);
    font-weight: 600;
    box-shadow: 0 6px 24px rgb(0 0 0 / 0.18);
    animation:
      rise 220ms var(--ease),
      fade-out 300ms 2300ms forwards;
  }

  @keyframes fade-out {
    to {
      opacity: 0;
    }
  }

  /* ---------- Sidebar (desktop) and rail (phones on their side) ---------- */

  @media (orientation: landscape) and (max-height: 500px), (min-width: 900px) {
    .tabbar {
      display: none;
    }

    .sidebar {
      position: fixed;
      top: 0;
      bottom: 0;
      left: 0;
      z-index: 10;
      display: flex;
      flex-direction: column;
      width: calc(var(--sidebar-width) + var(--safe-left));
      padding: calc(var(--space-4) + var(--safe-top)) var(--space-3) calc(var(--space-4) + var(--safe-bottom))
        calc(var(--space-3) + var(--safe-left));
      border-right: 1px solid var(--hairline);
      background: var(--bg);
      overflow-y: auto;
      view-transition-name: sidebar;
      -webkit-user-select: none;
      user-select: none;
    }

    .sidebar ul {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .sidebar .tools {
      margin-top: auto;
    }

    .divided {
      margin-top: var(--space-3);
      padding-top: var(--space-3);
      border-top: 1px solid var(--hairline);
    }

    .sidebar a {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      min-height: 40px;
      padding: 0 var(--space-3);
      border-radius: var(--radius-sm);
      color: var(--text-muted);
      font-weight: 600;
      font-size: 0.95rem;
      text-decoration: none;
      transition: background-color 120ms;
    }

    .sidebar a[aria-current='page'] {
      background: var(--accent-soft);
      color: var(--accent);
    }

    .sidebar .brand {
      gap: 10px;
      margin-bottom: var(--space-5);
      color: var(--text);
      font-weight: 700;
      font-size: var(--text-base);
    }

    .logo {
      display: grid;
      place-items: center;
      width: 28px;
      height: 28px;
      border-radius: 8px;
      background: var(--accent);
      color: var(--accent-text);
    }

    main {
      padding: 0 calc(var(--space-6) + var(--safe-right)) var(--space-6)
        calc(var(--sidebar-width) + var(--safe-left) + var(--space-6));
    }

    .pagebar {
      position: static;
      margin: 0;
      padding: var(--space-6) 0 var(--space-2);
      background: none;
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
      border: 0;
    }

    .pagebar h1 {
      font-size: var(--text-xl);
    }

    .back,
    .bar-tools {
      display: none;
    }

    .page {
      padding-top: var(--space-3);
    }

    .toast-region {
      bottom: calc(var(--space-5) + var(--safe-bottom));
      left: calc(50% + var(--sidebar-width) / 2);
    }
  }

  @media (min-width: 900px) and (hover: hover) {
    .sidebar a:not([aria-current='page']):hover {
      background: var(--surface-2);
      color: var(--text);
    }
  }

  /* Short landscape: every pixel of height counts, so the sidebar folds into an icon rail. */
  @media (orientation: landscape) and (max-height: 500px) {
    .sidebar {
      width: calc(var(--rail-width) + var(--safe-left));
      padding: calc(var(--space-2) + var(--safe-top)) 6px calc(var(--space-2) + var(--safe-bottom))
        calc(6px + var(--safe-left));
    }
    .sidebar .brand {
      display: none;
    }
    .sidebar a {
      flex-direction: column;
      justify-content: center;
      gap: 0;
      min-height: 44px;
      padding: 2px 0;
      font-size: 0.66rem;
      text-align: center;
    }
    .divided {
      margin-top: 4px;
      padding-top: 4px;
    }
    main {
      padding: 0 calc(var(--gutter) + var(--safe-right)) calc(var(--space-4) + var(--safe-bottom))
        calc(var(--rail-width) + var(--safe-left) + var(--gutter));
    }
    .pagebar {
      padding: calc(var(--space-2) + var(--safe-top)) 0 0;
    }
    .pagebar h1 {
      font-size: var(--text-base);
    }
    .page {
      padding-top: var(--space-2);
    }
    .toast-region {
      left: calc(50% + var(--rail-width) / 2);
    }
    .skip:focus {
      left: calc(var(--rail-width) + var(--safe-left) + 8px);
    }
  }

  /* Installed desktop app drawing into the title bar area. */
  @media (display-mode: window-controls-overlay) {
    .titlebar {
      display: block;
      position: fixed;
      z-index: 30;
      left: env(titlebar-area-x, 0);
      top: env(titlebar-area-y, 0);
      width: env(titlebar-area-width, 100%);
      height: env(titlebar-area-height, 0);
      -webkit-app-region: drag;
    }
    .sidebar {
      padding-top: calc(env(titlebar-area-height, 0px) + var(--space-3));
    }
    main {
      padding-top: env(titlebar-area-height, 0px);
    }
  }
</style>
