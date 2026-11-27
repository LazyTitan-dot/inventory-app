import type { Mode, Route } from './controller';
export type Session = {
  mode: Mode;
  route: Exclude<Route, 'favorite'>;
  value?: string;
  revision: number;
  cart: ReadonlyMap<string, number>;
  favorites: ReadonlySet<string>;
};
export type Action =
  | { type: 'mode'; mode: Mode }
  | { type: 'route'; route: Session['route']; value?: string }
  | { type: 'cart-set'; id: string; quantity: number }
  | { type: 'cart-delete'; id: string }
  | { type: 'cart-clear' }
  | { type: 'favorite'; id: string; selected: boolean };
export const initialSession = (): Session => ({
  mode: 'desktop',
  route: 'home',
  revision: 0,
  cart: new Map(),
  favorites: new Set(),
});
export function reduceSession(s: Session, a: Action): Session {
  switch (a.type) {
    case 'mode':
      return s.mode === a.mode ? s : { ...s, mode: a.mode };
    case 'route':
      return { ...s, route: a.route, value: a.value, revision: s.revision + 1 };
    case 'cart-set': {
      if (!a.id || !Number.isSafeInteger(a.quantity) || a.quantity < 1)
        throw Error('Cantidad inválida');
      if (s.cart.get(a.id) === a.quantity) return s;
      const cart = new Map(s.cart);
      cart.set(a.id, a.quantity);
      return { ...s, cart };
    }
    case 'cart-delete': {
      if (!s.cart.has(a.id)) return s;
      const cart = new Map(s.cart);
      cart.delete(a.id);
      return { ...s, cart };
    }
    case 'cart-clear':
      return s.cart.size ? { ...s, cart: new Map() } : s;
    case 'favorite': {
      if (!a.id || s.favorites.has(a.id) === a.selected) return s;
      const favorites = new Set(s.favorites);
      a.selected ? favorites.add(a.id) : favorites.delete(a.id);
      return { ...s, favorites };
    }
  }
}
export function snapshot(s: Session) {
  return {
    count: [...s.cart.values()].reduce((a, b) => a + b, 0),
    favorites: [...s.favorites],
    items: [...s.cart.entries()],
  };
}
/** Read and dispatch port; no mutable Map/Set facade is instantiated by V1.8. */
export function makeSessionPort(read: () => Session, dispatch: (a: Action) => void) {
  return { read, dispatch, snapshot: () => snapshot(read()) };
}
export type SessionPort = ReturnType<typeof makeSessionPort>;
