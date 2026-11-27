import * as React from 'react';
import { flushSync } from 'react-dom';
import type { Product } from '../data/contracts';
import type { CatalogFlowStore, CatalogFlowAction } from './catalog-flow-model';
import type { SessionBridge } from './session';
import { changeQuantity, type NativeDispatch, type CheckoutAction } from './shop-actions';
import type { Mode, Route } from './controller';
import { galleryImages } from './gallery-model';
export type ShopApi = {
  mode(m: Mode): void;
  snapshot(): { count: number; favorites: string[] };
  go(kind: Route, value?: string): void;
};
export type ShopActionOptions = {
  root: ShadowRoot;
  viewport: HTMLElement;
  store: CatalogFlowStore;
  products: Product[];
  session: SessionBridge;
  route: (kind: Route, value?: string) => void;
  onApi: (api: ShopApi) => void;
};
/** Business actions dispatch to the domain stores. Browser effects are limited to focus/scroll and cancellable timers. */
export function useShopActions(o: ShopActionOptions) {
  const { root, viewport, store, products, session, route, onApi } = o;
  const [submenu, setSubmenu] = React.useState<string | null>(null),
    [viewer, setViewer] = React.useState(false);
  const viewerOrigin = React.useRef<HTMLElement | null>(null),
    toastTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const q = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector<T>(sel);
  const flow = () => store.getSnapshot().flow;
  const state = () => store.getSnapshot().state;
  const send = (a: CatalogFlowAction) => store.dispatch(a);
  const patch = (p: Partial<ReturnType<typeof flow>>) => send({ type: 'flow-patch', patch: p });
  const commit = (fn: () => void) => flushSync(fn);
  const focus = (sel: string) => q(sel)?.focus({ preventScroll: true });
  const scrollTop = () => {
    const phone = q('#phoneContent');
    if (phone) phone.scrollTop = 0;
    viewport.scrollTo(0, 0);
  };
  const toast = (message: string) => {
    patch({ toast: message });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => patch({ toast: '' }), 2300);
  };
  React.useEffect(
    () => () => {
      clearTimeout(toastTimer.current);
    },
    [],
  );
  const filters = () => setSubmenu(null);
  const back = (restore = true) => {
    const before = flow();
    if (!before.currentProduct) return;
    commit(() => send({ type: 'detail-close' }));
    if (restore) {
      const phone = q('#phoneContent');
      if (phone) phone.scrollTop = before.savedPhoneScroll;
      const target = q(`[data-product="${before.currentProduct.id}"]`);
      const scope = q(
        before.detailOrigin === 'mobile' ? '#mobileCatalogPage' : '#desktopCatalogPage',
      );
      const b =
        scope?.querySelector<HTMLElement>(`[data-product="${before.currentProduct.id}"]`) ?? target;
      if (b?.offsetParent) b.focus({ preventScroll: true });
    }
  };
  const exitCommerce = () => {
    commit(() => send({ type: 'commerce-close' }));
    scrollTop();
  };
  const openDetail = (id: string, origin: string) => {
    const product = products.find((p) => p.id === id);
    if (!product) return;
    if (flow().commerceActive) exitCommerce();
    commit(() =>
      send({ type: 'detail-open', product, origin, scroll: q('#phoneContent')?.scrollTop ?? 0 }),
    );
    scrollTop();
  };
  const openCommerce = (step = 'cart') => {
    back(false);
    commit(() => send({ type: 'commerce-open', step }));
    scrollTop();
  };
  const toggle = (id: string) =>
    session.dispatch({ type: 'favorite', id, selected: !session.read().favorites.has(id) });
  const cartSet = (id: string, quantity: number) => {
    const p = products.find((p) => p.id === id);
    if (!p?.available) return;
    const cap = p.maxQuantity ?? 9;
    session.dispatch({ type: 'cart-set', id, quantity: Math.min(cap, quantity) });
  };
  const openDialog = (kind: string) => {
    if (kind === 'carrito') {
      openCommerce();
      return;
    }
    commit(() => patch({ dialog: { kind } }));
    focus('#closeConcept');
  };
  const closeDialog = () => patch({ dialog: null });
  const closeSheet = () => {
    commit(() => send({ type: 'sheet-close' }));
    focus('#openMobileFilters');
  };
  const checkout = (a: CheckoutAction) => {
    if (a === 'catalog') exitCommerce();
    else if (a === 'cart') openCommerce();
  };
  const openViewer = (source: HTMLElement | null) => {
    if (!flow().currentProduct) return;
    viewerOrigin.current = source;
    commit(() => {
      patch({ viewerZoomed: false });
      setViewer(true);
    });
  };
  const closeViewer = () => {
    commit(() => {
      setViewer(false);
      patch({ viewerZoomed: false });
    });
    if (viewerOrigin.current?.isConnected) viewerOrigin.current.focus({ preventScroll: true });
    viewerOrigin.current = null;
  };
  const stepViewer = (delta: number) => {
    const p = flow().currentProduct;
    if (!p) return;
    const next = flow().galleryView + delta;
    if (next < 0 || next >= galleryImages(p).length) return;
    commit(() => {
      send({ type: 'gallery', index: next });
      patch({ viewerZoomed: false });
    });
    const active = root.activeElement as HTMLButtonElement | null;
    if (!q('#imageViewer')?.contains(active) || active?.disabled) focus('#viewerClose');
  };
  const showCatalog = () => {
    if (flow().commerceActive) exitCommerce();
    back(false);
  };
  const mode = (m: Mode) => {
    send({ type: 'filter-patch', patch: { mode: m } });
  };
  const go = (kind: Route, value?: string) => {
    if (kind === 'favorite') {
      if (value) toggle(value);
      return;
    }
    if (kind === 'carrito') {
      openCommerce();
      return;
    }
    showCatalog();
    if (kind === 'detail') {
      if (value) openDetail(value, state().mode === 'iphone' ? 'mobile' : 'desktop');
      return;
    }
    if (kind === 'favoritos') {
      openDialog('favoritos');
      return;
    }
    send({ type: 'filter-reset' });
    if (kind === 'category') send({ type: 'category', category: value || 'Todos', draft: false });
    if (kind === 'search') send({ type: 'filter-patch', patch: { search: value || '' } });
    if (kind === 'ofertas') send({ type: 'filter-patch', patch: { offers: true } });
    filters();
  };
  const apiRef = React.useRef<ShopApi>({ mode, go, snapshot: session.snapshot });
  apiRef.current = { mode, go, snapshot: session.snapshot };
  React.useLayoutEffect(() => {
    onApi({
      mode: (m) => apiRef.current.mode(m),
      go: (k, v) => apiRef.current.go(k, v),
      snapshot: () => apiRef.current.snapshot(),
    });
  }, []);
  const dispatch: NativeDispatch = (action, source) => {
    const f = flow();
    switch (action.type) {
      case 'shop-dialog':
        openDialog(action.kind);
        return;
      case 'shop-dialog-close':
        closeDialog();
        return;
      case 'shop-sheet':
        if (action.action === 'open') {
          commit(() => send({ type: 'sheet-open' }));
          focus('#closeMobileFilters');
        } else if (action.action === 'apply') {
          send({ type: 'sheet-apply' });
          closeSheet();
          filters();
        } else if (action.action === 'close') closeSheet();
        else send({ type: 'sheet-reset' });
        return;
      case 'detail-gallery':
        send({ type: 'gallery', index: action.index });
        return;
      case 'detail-quantity':
        send({ type: 'quantity', delta: action.delta });
        return;
      case 'catalog-search':
        if (f.commerceActive) exitCommerce();
        back(false);
        send({ type: 'filter-patch', patch: { search: action.value } });
        filters();
        return;
      case 'catalog-budget':
      case 'catalog-stock':
      case 'catalog-offer': {
        const p =
          action.type === 'catalog-budget'
            ? { budget: action.value }
            : action.type === 'catalog-stock'
              ? { onlyAvailable: action.value }
              : { offers: action.value };
        send({
          type: f.draft && source.closest('#mobileFilterSheet') ? 'draft-patch' : 'filter-patch',
          patch: p,
        });
        return;
      }
      case 'catalog-sort':
        send({ type: 'filter-patch', patch: { sort: action.value } });
        filters();
        return;
      case 'catalog-view':
        send({ type: 'filter-patch', patch: { view: action.value } });
        return;
      case 'catalog-clear-search':
        back(false);
        send({ type: 'filter-patch', patch: { search: '' } });
        source.closest('.search')?.querySelector('input')?.focus();
        return;
      case 'brand':
        send({
          type: 'brand',
          brand: action.brand,
          selected: action.selected,
          draft: !!(f.draft && source.closest('#mobileFilterSheet')),
        });
        return;
      case 'category':
        if (f.commerceActive) exitCommerce();
        send({
          type: 'category',
          category: action.category,
          draft: !!(f.draft && source.closest('#mobileFilterSheet')),
        });
        filters();
        return;
      case 'filter-remove':
        send({ type: 'filter-remove', key: action.key });
        filters();
        return;
      case 'filter-reset':
        send({ type: 'filter-reset' });
        filters();
        return;
      case 'favorite':
        toggle(action.id);
        toast(
          session.read().favorites.has(action.id)
            ? 'Guardado en favoritos'
            : 'Eliminado de favoritos',
        );
        return;
      case 'product':
        openDetail(action.id, source.closest('.phone') ? 'mobile' : 'desktop');
        return;
      case 'detail-back':
        back();
        return;
      case 'detail-zoom':
        openViewer(source);
        return;
      case 'detail-save':
        if (f.currentProduct) toggle(f.currentProduct.id);
        return;
      case 'detail-add':
        if (f.currentProduct?.available) {
          const p = f.currentProduct;
          const before = session.read().cart.get(p.id) || 0;
          const added = Math.max(0, Math.min(f.qty, (p.maxQuantity ?? 9) - before));
          if (p.source === 'commercial' && !added) {
            toast('Límite de unidades disponibles.');
            return;
          }
          cartSet(p.id, before + added);
          const n = p.source === 'commercial' ? added : f.qty;
          toast(`${n} ${n === 1 ? 'unidad añadida' : 'unidades añadidas'} al carrito`);
          openCommerce();
        }
        return;
      case 'checkout':
        checkout(action.action);
        return;
      case 'cart-quantity':
        cartSet(action.id, changeQuantity(session.read().cart.get(action.id) || 1, action.delta));
        return;
      case 'cart-remove':
        session.dispatch({ type: 'cart-delete', id: action.id });
        return;
    }
  };
  const shell = {
    home: () => {
      route('home');
    },
    mode: (m: string) => {
      send({ type: 'filter-patch', patch: { mode: m } });
    },
    category: (c: string) => {
      if (flow().commerceActive) exitCommerce();
      back(false);
      send({ type: 'category', category: c, draft: false });
      filters();
    },
    tab: (t: string) => {
      if (t === 'inicio') {
        route('home');
        return;
      }
      if (t === 'carrito') {
        openCommerce();
        return;
      }
      if (flow().commerceActive) exitCommerce();
      back(false);
      if (t === 'ofertas') send({ type: 'filter-patch', patch: { offers: true } });
      filters();
      q('#phoneContent')?.scrollTo({ top: t === 'ofertas' ? 190 : 0, behavior: 'smooth' });
    },
    toggleMenu: (id: string) => setSubmenu((x) => (x === id ? null : id)),
    escape: () => {
      if (state().sheet) closeSheet();
      closeDialog();
      setSubmenu(null);
    },
    closeViewer,
    stepViewer,
    zoom: () => patch({ viewerZoomed: !flow().viewerZoomed }),
  };
  return { dispatch, submenu, viewer, shell };
}
