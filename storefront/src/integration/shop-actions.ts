import type { Product } from '../data/contracts';
export interface Filters {
  cat: string;
  brands: readonly string[];
  budget: number;
  onlyAvailable: boolean;
  offers: boolean;
  sort: string;
  search: string;
}
export type CheckoutAction = 'cart' | 'catalog';
export type NativeAction =
  | { type: 'catalog-search'; value: string }
  | { type: 'catalog-budget'; value: number }
  | { type: 'catalog-stock' | 'catalog-offer'; value: boolean }
  | { type: 'catalog-sort'; value: string }
  | { type: 'shop-dialog'; kind: string }
  | { type: 'shop-dialog-close' }
  | { type: 'shop-sheet'; action: 'open' | 'close' | 'apply' | 'reset' }
  | { type: 'detail-gallery'; index: number }
  | { type: 'detail-quantity'; delta: number }
  | { type: 'catalog-view'; value: 'grid' | 'list' }
  | { type: 'catalog-clear-search' }
  | { type: 'brand'; brand: string; selected: boolean }
  | { type: 'category'; category: string }
  | { type: 'filter-remove'; key: string }
  | { type: 'filter-reset' }
  | { type: 'favorite'; id: string }
  | { type: 'product'; id: string; assistant?: boolean }
  | { type: 'detail-back' }
  | { type: 'detail-zoom' }
  | { type: 'detail-save' }
  | { type: 'detail-add' }
  | { type: 'checkout'; action: CheckoutAction }
  | { type: 'cart-quantity'; id: string; delta: -1 | 1 }
  | { type: 'cart-remove'; id: string };
export type NativeDispatch = (action: NativeAction, source: HTMLElement) => void;
export const normalize = (v: unknown) =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
export function selectProducts(products: readonly Product[], f: Filters) {
  const tokens = normalize(f.search).split(' ').filter(Boolean);
  const result = products.filter((p) => {
    const hay = normalize([p.name, p.spec, p.cat, p.brand].join(' '));
    return (
      (f.cat === 'Todos' || p.cat === f.cat) &&
      (!f.brands?.length || f.brands.includes(p.brand)) &&
      (f.budget >= 80000 || p.price <= f.budget) &&
      (!f.onlyAvailable || p.available) &&
      (!f.offers || p.offer) &&
      tokens.every((t) => hay.includes(t))
    );
  });
  if (f.sort === 'priceAsc') result.sort((a, b) => a.price - b.price);
  else if (f.sort === 'priceDesc') result.sort((a, b) => b.price - a.price);
  else if (f.sort === 'name') result.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  return result;
}
export function brandsFor(products: readonly Product[], category: string) {
  return [
    ...new Set(
      products.filter((p) => category === 'Todos' || p.cat === category).map((p) => p.brand),
    ),
  ].sort((a, b) => a.localeCompare(b, 'es'));
}
export function changeBrand(brands: readonly string[], brand: string, selected: boolean) {
  return selected ? [...new Set([...brands, brand])] : brands.filter((x) => x !== brand);
}
export const changeQuantity = (quantity: number, delta: number) =>
  Math.min(9, Math.max(1, quantity + delta));
