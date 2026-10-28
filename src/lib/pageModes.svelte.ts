// A tab with several modes (Identify, Anchor): the mode lives in the route, e.g. `#/identify/chroma`,
// so each mode has its own shareable link.

export class PageModes<M extends string> {
  value = $state() as M;
  readonly route: string;
  readonly order: readonly M[];
  readonly labels: Record<M, string>;

  constructor(route: string, order: readonly M[], labels: Record<M, string>) {
    this.route = route;
    this.order = order;
    this.labels = labels;
    this.value = order[0]!;
  }

  is(value: string): value is M {
    return (this.order as readonly string[]).includes(value);
  }

  href(mode: M = this.value): string {
    return `#/${this.route}/${mode}`;
  }

  next(mode: M = this.value): M {
    return this.order[(this.order.indexOf(mode) + 1) % this.order.length]!;
  }

  /** Switching modes replaces the URL rather than piling up history entries. */
  set(mode: M): void {
    this.value = mode;
    if (location.hash !== this.href(mode)) history.replaceState(history.state, '', this.href(mode));
  }

  cycle(): void {
    this.set(this.next());
  }

  /** Pick up the mode from `#/<route>/<mode>`, rewriting a bare or unknown one to the current mode. */
  sync(hash: string): void {
    const mode = hash.replace(/^#\/?/, '').split('?')[0]?.split('/')[1] ?? '';
    this.set(this.is(mode) ? mode : this.value);
  }
}
