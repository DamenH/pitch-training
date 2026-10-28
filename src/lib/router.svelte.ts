// Hash-based routing: works on GitHub Pages without server-side rewrites.

import { flushSync } from 'svelte';
import { anchorModes } from './anchorMode.svelte';
import { identifyModes } from './identifyMode.svelte';
import type { PageModes } from './pageModes.svelte';

export type Route = 'reference' | 'identify' | 'anchor' | 'sing-practice' | 'sing-test' | 'import' | 'settings' | 'history';

export const ROUTES: readonly Route[] = [
  'reference',
  'identify',
  'anchor',
  'sing-practice',
  'sing-test',
  'import',
  'settings',
  'history',
];
export const DEFAULT_ROUTE: Route = 'identify';

/** Top-level destinations; the others are screens pushed on top of them. */
export const TABS: readonly Route[] = ['reference', 'identify', 'anchor', 'sing-practice', 'sing-test'];

/** Tabs whose modes are part of the route, e.g. `#/identify/chroma`. */
const MODES: Partial<Record<Route, PageModes<string>>> = { identify: identifyModes, anchor: anchorModes };

export function modesFor(route: Route): PageModes<string> | undefined {
  return MODES[route];
}

export function isTab(route: Route): boolean {
  return TABS.includes(route);
}

function parse(hash: string): Route {
  const name = hash.replace(/^#\/?/, '').split(/[/?]/)[0] ?? '';
  return (ROUTES as readonly string[]).includes(name) ? (name as Route) : DEFAULT_ROUTE;
}

function syncMode(hash: string) {
  MODES[parse(hash)]?.sync(hash);
}

interface ViewTransition {
  ready: Promise<void>;
  finished: Promise<void>;
}
type ViewTransitionDocument = Document & { startViewTransition?: (update: () => void) => ViewTransition };

class Router {
  current = $state<Route>(parse(location.hash));
  /** The tab a pushed screen returns to. */
  lastTab = $state<Route>(isTab(parse(location.hash)) ? parse(location.hash) : DEFAULT_ROUTE);
  /** True when the current pushed screen was opened from inside the app, so Back can pop it. */
  canGoBack = $state(false);
  private scroll = new Map<Route, number>();

  constructor() {
    syncMode(location.hash);
    window.addEventListener('hashchange', () => {
      syncMode(location.hash);
      this.go(parse(location.hash));
    });
  }

  /** Where this route was last scrolled to, so tabs reopen where they were left. */
  savedScroll(route: Route): number {
    return this.scroll.get(route) ?? 0;
  }

  private go(next: Route) {
    const previous = this.current;
    if (next === previous) return;
    this.scroll.set(previous, window.scrollY);
    const apply = () => {
      this.canGoBack = !isTab(next) && (isTab(previous) || this.canGoBack);
      this.current = next;
      if (isTab(next)) this.lastTab = next;
    };
    const doc = document as ViewTransitionDocument;
    if (!doc.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      apply();
      return;
    }
    document.documentElement.dataset.nav = isTab(previous) && !isTab(next) ? 'push' : !isTab(previous) && isTab(next) ? 'pop' : 'tab';
    const transition = doc.startViewTransition(() => flushSync(apply));
    // A quick second navigation skips the running animation; that's expected, not an error.
    transition.ready.catch(() => {});
    transition.finished.catch(() => {});
  }
}

export const router = new Router();

export function href(route: Route): string {
  return MODES[route]?.href() ?? `#/${route}`;
}
