import type { Product } from '../data/contracts';
import { brandsFor, changeBrand, changeQuantity } from './shop-actions';
export type Draft = {
  brands: readonly string[];
  cat: string;
  budget: number;
  onlyAvailable: boolean;
  offers: boolean;
};
export type FilterState = Draft & {
  sort: string;
  view: string;
  search: string;
  mode: string;
  sheet: boolean;
};
export type FlowState = {
  draft: Draft | null;
  currentProduct: Product | null;
  galleryView: number;
  qty: number;
  detailOrigin: string;
  savedPhoneScroll: number;
  viewerZoomed: boolean;
  commerceActive: boolean;
  commerceStep: string;
  dialog: { kind: string; pid?: string } | null;
  toast: string;
};
export type CatalogFlow = { state: FilterState; flow: FlowState };
export type CatalogFlowAction =
  | { type: 'filter-patch'; patch: Partial<FilterState> }
  | { type: 'flow-patch'; patch: Partial<FlowState> }
  | { type: 'draft-patch'; patch: Partial<Draft> }
  | { type: 'brand'; brand: string; selected: boolean; draft: boolean }
  | { type: 'category'; category: string; draft: boolean }
  | { type: 'filter-reset' }
  | { type: 'filter-remove'; key: string }
  | { type: 'sheet-open' }
  | { type: 'sheet-close' }
  | { type: 'sheet-apply' }
  | { type: 'sheet-reset' }
  | { type: 'detail-open'; product: Product; origin: string; scroll: number }
  | { type: 'detail-close' }
  | { type: 'gallery'; index: number }
  | { type: 'quantity'; delta: number }
  | { type: 'commerce-open'; step: string }
  | { type: 'commerce-close' }
  | { type: 'commerce-step'; step: string };
const defaults = (): Draft => ({
  brands: [],
  cat: 'Todos',
  budget: 80000,
  onlyAvailable: false,
  offers: false,
});
export const initialCatalogFlow = (): CatalogFlow => ({
  state: { ...defaults(), sort: 'featured', view: 'grid', search: '', mode: 'both', sheet: false },
  flow: {
    draft: null,
    currentProduct: null,
    galleryView: 0,
    qty: 1,
    detailOrigin: 'desktop',
    savedPhoneScroll: 0,
    viewerZoomed: false,
    commerceActive: false,
    commerceStep: 'cart',
    dialog: null,
    toast: '',
  },
});
function draftOf(s: FilterState): Draft {
  return {
    brands: [...s.brands],
    cat: s.cat,
    budget: s.budget,
    onlyAvailable: s.onlyAvailable,
    offers: s.offers,
  };
}
export function reduceCatalogFlow(
  s: CatalogFlow,
  a: CatalogFlowAction,
  products: readonly Product[],
): CatalogFlow {
  const f = s.state,
    v = s.flow;
  const filter = (patch: Partial<FilterState>): CatalogFlow => ({
    ...s,
    state: { ...f, ...patch },
  });
  const flow = (patch: Partial<FlowState>): CatalogFlow => ({ ...s, flow: { ...v, ...patch } });
  const draft = (patch: Partial<Draft>): CatalogFlow =>
    v.draft ? flow({ draft: { ...v.draft, ...patch } }) : s;
  switch (a.type) {
    case 'filter-patch':
      return filter(a.patch);
    case 'flow-patch':
      return flow(a.patch);
    case 'draft-patch':
      return draft(a.patch);
    case 'brand': {
      const target = a.draft ? v.draft : f;
      if (!target) return s;
      const brands = changeBrand(target.brands, a.brand, a.selected);
      return a.draft ? draft({ brands }) : filter({ brands });
    }
    case 'category': {
      const target = a.draft ? v.draft : f;
      if (!target) return s;
      const patch = {
        cat: a.category,
        brands: target.brands.filter((b) => brandsFor(products, a.category).includes(b)),
      };
      return a.draft ? draft(patch) : filter(patch);
    }
    case 'filter-reset':
      return filter({ ...defaults(), search: '' });
    case 'filter-remove': {
      const k = a.key;
      if (k.startsWith('brand:'))
        return filter({ brands: f.brands.filter((b) => b !== k.slice(6)) });
      switch (k) {
        case 'cat':
          return filter({ cat: 'Todos' });
        case 'budget':
          return filter({ budget: 80000 });
        case 'available':
          return filter({ onlyAvailable: false });
        case 'offers':
          return filter({ offers: false });
        case 'search':
          return filter({ search: '' });
        default:
          return s;
      }
    }
    case 'sheet-open':
      return { state: { ...f, sheet: true }, flow: { ...v, draft: draftOf(f) } };
    case 'sheet-close':
      return { state: { ...f, sheet: false }, flow: { ...v, draft: null } };
    case 'sheet-apply':
      return { state: { ...f, ...v.draft, sheet: false }, flow: { ...v, draft: null } };
    case 'sheet-reset':
      return draft(defaults());
    case 'detail-open':
      return flow({
        currentProduct: a.product,
        galleryView: 0,
        qty: 1,
        detailOrigin: a.origin || 'desktop',
        savedPhoneScroll: v.currentProduct ? v.savedPhoneScroll : a.scroll,
      });
    case 'detail-close':
      return flow({ currentProduct: null });
    case 'gallery':
      return flow({ galleryView: a.index });
    case 'quantity':
      return flow({
        qty: Math.max(
          1,
          Math.min(v.currentProduct?.maxQuantity ?? 9, changeQuantity(v.qty, a.delta)),
        ),
      });
    case 'commerce-open':
      return flow({ commerceActive: true, commerceStep: a.step });
    case 'commerce-close':
      return flow({ commerceActive: false });
    case 'commerce-step':
      return flow({ commerceStep: a.step });
  }
}
export function createCatalogFlowStore(
  products: readonly Product[],
  publish: (state: CatalogFlow) => void = () => {},
) {
  let current = initialCatalogFlow();
  const listeners = new Set<() => void>();
  publish(current);
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispatch: (action: CatalogFlowAction) => {
      const next = reduceCatalogFlow(current, action, products);
      if (next !== current) {
        current = next;
        publish(current);
        listeners.forEach((fn) => fn());
      }
      return current;
    },
  };
}
export type CatalogFlowStore = ReturnType<typeof createCatalogFlowStore>;
