// Hash-based routing: works on GitHub Pages without server-side rewrites.

export type Route = 'reference' | 'identify' | 'sing-practice' | 'sing-test' | 'mixed' | 'settings' | 'history';

export const ROUTES: readonly Route[] = ['reference', 'identify', 'sing-practice', 'sing-test', 'mixed', 'settings', 'history'];
export const DEFAULT_ROUTE: Route = 'identify';

function parse(hash: string): Route {
  const name = hash.replace(/^#\/?/, '').split(/[/?]/)[0] ?? '';
  return (ROUTES as readonly string[]).includes(name) ? (name as Route) : DEFAULT_ROUTE;
}

class Router {
  current = $state<Route>(parse(location.hash));

  constructor() {
    window.addEventListener('hashchange', () => {
      this.current = parse(location.hash);
    });
  }
}

export const router = new Router();

export function href(route: Route): string {
  return `#/${route}`;
}
