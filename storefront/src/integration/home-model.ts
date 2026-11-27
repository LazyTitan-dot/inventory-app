import type { Route } from './controller';
export function homeRoute(
  p: Record<string, unknown>,
): { route: Route; value?: string } | undefined {
  if (typeof p['data-filter'] === 'string') return { route: 'category', value: p['data-filter'] };
  if (p['data-scroll'] === 'products') return { route: 'category', value: 'Todos' };
  const d = p['data-dialog'];
  if (d === 'carrito' || d === 'favoritos' || d === 'ofertas') return { route: d };
  const t = p['data-mobiletab'];
  if (t === 'categorias') return { route: 'category', value: 'Todos' };
  if (t === 'carrito' || t === 'ofertas') return { route: t, value: 'Todos' };
  return undefined;
}
export function homeItems<T extends { name: string; cat: string }>(
  products: readonly T[],
  term: string,
): T[] {
  return products.filter(
    (p) => !term || (p.name + ' ' + p.cat).toLowerCase().includes(term.toLowerCase()),
  );
}
