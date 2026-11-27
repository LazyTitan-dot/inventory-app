import type { CommercialSnapshot } from './contract';
import type { Session } from '../../integration/session-model';
import { initialSession } from '../../integration/session-model';
export const REVALIDATE_MS = 30_000;
// Compare only the already-validated public projection. No secrets or transport metadata.
export const sameCatalog = (a: CommercialSnapshot, b: CommercialSnapshot) =>
  JSON.stringify(a) === JSON.stringify(b);
export function reconcileSession(previous: Session | undefined, next: CommercialSnapshot): Session {
  const initial = initialSession();
  if (!previous) return initial;
  const byId = new Map(next.products.map((p) => [p.id, p]));
  const cart = new Map<string, number>();
  for (const [id, qty] of previous.cart) {
    const p = byId.get(id);
    if (p?.available && Number.isSafeInteger(qty) && qty > 0)
      cart.set(id, Math.min(qty, p.maxQuantity));
  }
  const favorites = new Set([...previous.favorites].filter((id) => byId.has(id)));
  // Do not carry forward checkout/contact/AI or a now-unpublished detail. Require review of new totals.
  return {
    ...initial,
    mode: previous.mode,
    cart,
    favorites,
    route: cart.size ? 'carrito' : 'home',
  };
}
