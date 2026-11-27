import * as React from 'react';
import type { ShellNode } from './ApprovedShell';
import { selectProducts, brandsFor, type NativeAction } from '../integration/shop-actions';
import { NativeEvents } from './NativeEvents';
import { CatalogCards, Categories, BrandFilters, FilterChips, Detail, Icon } from './NativeCatalog';
import { Commerce } from './NativeCommerce';
import { galleryImages } from '../integration/gallery-model';
import { commercialSubtotal, commercialMoney, isCommercial } from '../data/commercial/contract';
import type { Product } from '../data/contracts';
const money = (n: number) => 'RD$ ' + new Intl.NumberFormat('en-US').format(n);
const sorts: Record<string, string> = {
  featured: 'Recomendados',
  priceAsc: 'Menor precio',
  priceDesc: 'Mayor precio',
  name: 'Nombre A–Z',
};
/** Declarative shop view backed by domain stores and typed React actions. */
import { useShopActions, type ShopActionOptions } from '../integration/use-shop-actions';
import { useShopBrowserEffects } from './useShopBrowserEffects';
export function ShopControlsShell(options: ShopActionOptions & { tree: ShellNode[] }) {
  const { tree, store, products, session, root } = options;
  const actions = useShopActions(options);
  const { dispatch, shell } = actions;
  const { state, flow } = React.useSyncExternalStore(store.subscribe, store.getSnapshot);
  const browser = useShopBrowserEffects({
    root,
    viewer: actions.viewer,
    zoomed: flow.viewerZoomed,
    mode: state.mode,
    step: shell.stepViewer,
    close: shell.closeViewer,
  });
  React.useLayoutEffect(() => {
    root.querySelector('.shop-body')?.classList.toggle('viewer-open', actions.viewer);
  }, [actions.viewer, root]);
  const sessionState = React.useSyncExternalStore(session.subscribe, session.read);
  const list = selectProducts(products, state),
    count =
      Number(state.cat !== 'Todos') +
      state.brands.length +
      Number(state.budget < 80000) +
      Number(state.onlyAvailable) +
      Number(state.offers);
  const lines = [...sessionState.cart.entries()].flatMap(([id, n]) => {
    const p = products.find((x) => x.id === id);
    return p && n > 0 ? [{ p, n }] : [];
  });
  const cartCount = lines.reduce((a, l) => a + l.n, 0),
    subtotal = commercialSubtotal(lines);
  const favorites = [...sessionState.favorites];
  const cards = [...new Set(products.map((p) => p.cat))].map((name) => ({
    name,
    label: name,
    image: products.find((p) => p.cat === name)?.img || '',
  }));
  const active: [string, string][] = [];
  if (state.cat !== 'Todos') active.push([state.cat, 'cat']);
  state.brands.forEach((b) => active.push([b, 'brand:' + b]));
  if (state.budget < 80000) active.push([`Hasta ${money(state.budget)}`, 'budget']);
  if (state.onlyAvailable) active.push(['Disponibles', 'available']);
  if (state.offers) active.push(['Ofertas', 'offers']);
  if (state.search.trim()) active.push([`«${state.search.trim()}»`, 'search']);
  const emit = (a: NativeAction, e: React.SyntheticEvent<HTMLElement>) => {
    e.stopPropagation();
    dispatch(a, e.currentTarget);
  };
  function render(
    n: ShellNode,
    i: number,
    draft = false,
    mobile = false,
    inPhone = false,
  ): React.ReactNode {
    if (typeof n === 'string') return n;
    const p = n.props;
    draft = draft || p.id === 'mobileFilterSheet';
    mobile = mobile || p.className === 'phone-screen';
    const f = draft && flow.draft ? flow.draft : state;
    const props: Record<string, unknown> = { ...p, key: i };
    let children: React.ReactNode[] = n.children.map((c, j) =>
      render(c, j, draft, mobile, p.className === 'phone-screen'),
    );
    const id = String(p.id || '');
    if (id === 'stage' || id === 'conceptDialog' || id === 'conceptBackdrop')
      props.onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape' && !actions.viewer) shell.escape();
      };
    if (id === 'stage')
      props.className = `stage${state.mode === 'desktop' ? ' only-desktop' : state.mode === 'iphone' ? ' only-phone' : ''}`;
    if ('data-mode' in p) return null;
    if (id === 'submenu')
      props.className = String(p.className) + (actions.submenu ? ' visible' : '');
    if (id === 'submenu')
      children = ['Todos', ...cards.map((c) => c.name)].map((c) => (
        <button key={c} onClick={() => shell.category(c)}>
          {c}
        </button>
      ));
    if (id === 'categoryToggle' || 'data-disclose' in p) {
      const key = id || String(p['data-disclose']);
      props['aria-expanded'] = actions.submenu === key;
      props.onClick = () => shell.toggleMenu(key);
    }
    if ('data-select-cat' in p) props.onClick = () => shell.category(String(p['data-select-cat']));
    if ('data-cat' in p)
      props.onClick = (e: React.MouseEvent<HTMLElement>) =>
        emit({ type: 'category', category: String(p['data-cat']) }, e);
    if ('data-reset' in p)
      props.onClick = (e: React.MouseEvent<HTMLElement>) => emit({ type: 'filter-reset' }, e);
    if ('data-pdp-add' in p)
      props.onClick = (e: React.MouseEvent<HTMLElement>) => emit({ type: 'detail-add' }, e);
    if ('data-mobiletab' in p) {
      const tab = String(p['data-mobiletab']);
      props.className = (flow.commerceActive ? tab === 'carrito' : tab === 'categorias')
        ? 'active'
        : undefined;
      props.onClick = () => shell.tab(tab);
    }
    if (p.className === 'brand') {
      props.onClick = (e: React.MouseEvent) => {
        e.preventDefault();
        shell.home();
      };
    }
    if (
      (p.className === 'crumb' || p.className === 'mobile-crumb') &&
      typeof n.children[0] !== 'string'
    ) {
      children[0] = React.createElement(
        'span',
        {
          ...(n.children[0] as Exclude<ShellNode, string>).props,
          key: 0,
          role: 'link',
          tabIndex: 0,
          'data-integration-home': '',
          onClick: shell.home,
          onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key === 'Enter') shell.home();
          },
        },
        ...(n.children[0] as Exclude<ShellNode, string>).children.map((c, j) =>
          render(c, j, draft, mobile),
        ),
      );
    }
    if (id === 'desktopCategories' || id === 'mobileCatalogCategories')
      props.onScroll = browser.updateRails;
    if (id === 'desktopCategoryNext' || id === 'mobileCategoryNext') {
      const m = id === 'mobileCategoryNext';
      props.hidden = m ? browser.rails.mobileHidden : browser.rails.desktopHidden;
      props.disabled = m ? browser.rails.mobileDisabled : browser.rails.desktopDisabled;
      props.onClick = () => browser.scrollRail(m);
    }
    if (id === 'mobileCategoryCarousel')
      props.className = String(p.className) + (browser.rails.mobileHidden ? ' no-overflow' : '');
    if (id === 'imageViewer') Object.assign(props, browser.dialogEvents);
    if (id === 'viewerCanvas') {
      Object.assign(props, browser.viewerEvents);
      props.className =
        String(p.className) +
        (flow.viewerZoomed ? ' zoomed' : '') +
        (browser.dragging ? ' is-mouse-dragging' : '');
    }
    if (id === 'viewerClose') props.onClick = shell.closeViewer;
    if (id === 'viewerZoom') {
      props.onClick = shell.zoom;
      props['aria-pressed'] = flow.viewerZoomed;
      props['aria-label'] = flow.viewerZoomed ? 'Reducir ampliación' : 'Ampliar imagen';
    }
    if (id === 'viewerPrev' || id === 'viewerNext') {
      const images = flow.currentProduct ? galleryImages(flow.currentProduct) : [];
      props.disabled =
        id === 'viewerPrev' ? flow.galleryView === 0 : flow.galleryView >= images.length - 1;
      props.onClick = () => shell.stepViewer(id === 'viewerPrev' ? -1 : 1);
    }
    if (id === 'viewerImage' && flow.currentProduct) {
      props.src = galleryImages(flow.currentProduct)[flow.galleryView];
      props.alt = flow.currentProduct.name + ' — imagen ' + (flow.galleryView + 1);
    }
    if (id === 'viewerCount' && flow.currentProduct) {
      const images = galleryImages(flow.currentProduct);
      children = [
        flow.galleryView + 1 + ' / ' + images.length + (images.length === 1 ? ' · Foto' : ''),
      ];
    }
    if (id === 'viewerDragHint')
      props.hidden =
        !flow.viewerZoomed ||
        state.mode === 'iphone' ||
        !window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (id === 'conceptDialog' || id === 'conceptBackdrop') props.hidden = !flow.dialog;
    if (id === 'conceptToast') {
      props.className = String(p.className) + (flow.toast ? ' visible' : '');
      children = [flow.toast];
    }
    if (id === 'conceptDialogContents')
      children = flow.dialog
        ? [
            <div key="favorites">
              <h3 id="conceptTitle">Favoritos</h3>
              {favorites.length ? (
                products
                  .filter((p) => favorites.includes(p.id))
                  .map((p) => (
                    <button
                      key={p.id}
                      onClick={(e) => {
                        dispatch({ type: 'shop-dialog-close' }, e.currentTarget);
                        dispatch({ type: 'product', id: p.id }, e.currentTarget);
                      }}
                    >
                      {p.name}
                    </button>
                  ))
              ) : (
                <p>Aún no has guardado productos.</p>
              )}
            </div>,
          ]
        : [];
    if (id === 'mobileFilterSheet' || id === 'mobileSheetBackdrop') props.hidden = !state.sheet;
    if (
      id === 'mobileSheetBackdrop' ||
      id === 'openMobileFilters' ||
      id === 'closeMobileFilters' ||
      id === 'applyMobileFilters' ||
      'data-sheet-reset' in p
    ) {
      const action =
        id === 'openMobileFilters'
          ? 'open'
          : id === 'applyMobileFilters'
            ? 'apply'
            : 'data-sheet-reset' in p
              ? 'reset'
              : 'close';
      props.onClick = (e: React.MouseEvent<HTMLElement>) => emit({ type: 'shop-sheet', action }, e);
    }
    if (id === 'conceptBackdrop' || id === 'closeConcept')
      props.onClick = (e: React.MouseEvent<HTMLElement>) => emit({ type: 'shop-dialog-close' }, e);
    if ('data-dialog' in p)
      props.onClick = (e: React.MouseEvent<HTMLElement>) =>
        emit({ type: 'shop-dialog', kind: String(p['data-dialog']) }, e);
    if (id === 'desktopDetail' || id === 'mobileDetail') {
      const current = flow.currentProduct;
      props.hidden = !current || flow.commerceActive;
      children = current
        ? [
            <Detail
              key={current.id}
              p={current}
              variants={
                isCommercial(current)
                  ? products.filter((x) => x.productId === current.productId)
                  : []
              }
              related={products
                .filter((x) => x.cat === current.cat && x.id !== current.id)
                .slice(0, 2)}
              images={galleryImages(current)}
              view={flow.galleryView}
              qty={flow.qty}
              favorites={favorites}
              onGallery={(index, source) => dispatch({ type: 'detail-gallery', index }, source)}
              onQuantity={(delta, source) => dispatch({ type: 'detail-quantity', delta }, source)}
            />,
          ]
        : [];
    }
    if (id === 'desktopCommerce' || id === 'mobileCommerce') {
      props.hidden = !flow.commerceActive;
      children = flow.commerceActive
        ? [<Commerce key="commerce" lines={lines} subtotal={subtotal} />]
        : [];
    }
    if (id === 'desktopCatalogPage' || id === 'mobileCatalogPage')
      props.hidden = !!flow.currentProduct || flow.commerceActive;
    if (id === 'mobileDetailBar') props.hidden = !flow.currentProduct || flow.commerceActive;
    if (id === 'mobileDetailPrice')
      children = flow.currentProduct
        ? [
            isCommercial(flow.currentProduct)
              ? commercialMoney(flow.currentProduct.priceMinor)
              : money(flow.currentProduct.price),
          ]
        : [];
    if (id === 'mobileDetailAdd') props.disabled = !flow.currentProduct?.available;
    if ('data-count' in p) children = [String(cartCount)];
    if (id === 'desktopCatalogGrid' || id === 'mobileCatalogGrid') {
      children = [<CatalogCards key="catalog" items={list} favorites={favorites} />];
      if (id === 'desktopCatalogGrid')
        props.className = String(p.className) + (state.view === 'list' ? ' list' : '');
    }
    if (id === 'desktopBrands' || id === 'mobileBrands')
      children = [
        <BrandFilters key="brands" brands={brandsFor(products, f.cat)} selected={f.brands} />,
      ];
    if (id === 'activeFilters' || id === 'mobileActiveFilters')
      children = [<FilterChips key="chips" active={active} />];
    const kind = (
      {
        desktopCategories: 'desktop',
        desktopFilterCategories: 'filter',
        mobileCatalogCategories: 'mobile',
        mobileSheetCats: 'sheet',
      } as const
    )[
      id as
        | 'desktopCategories'
        | 'desktopFilterCategories'
        | 'mobileCatalogCategories'
        | 'mobileSheetCats'
    ];
    if (kind)
      children = [
        <Categories
          key="categories"
          cards={cards}
          items={
            kind === 'filter' ? selectProducts(products, { ...state, cat: 'Todos' }) : products
          }
          kind={kind}
          selected={f.cat}
        />,
      ];
    if (id === 'desktopEmpty' || id === 'mobileEmpty') props.hidden = list.length > 0;
    if (id === 'desktopEmpty')
      children = n.children.map((c, j) =>
        typeof c !== 'string' && c.tag === 'p'
          ? React.createElement(
              'p',
              { ...c.props, key: j },
              state.search.trim()
                ? 'Prueba otra búsqueda o elimina algún filtro.'
                : 'Consulta el catálogo más adelante o ajusta los filtros.',
            )
          : render(c, j, draft, mobile, p.className === 'phone-screen'),
      );
    if (id === 'mobileFilterCount') {
      props.hidden = count === 0;
      children = [String(count)];
    }
    if ('data-search' in p) {
      props.value = state.search;
      props.onChange = (e: React.ChangeEvent<HTMLInputElement>) =>
        emit({ type: 'catalog-search', value: e.currentTarget.value }, e);
    }
    if ('data-budget' in p) {
      delete props.defaultValue;
      props.value = f.budget;
      props.onChange = (e: React.ChangeEvent<HTMLInputElement>) =>
        emit({ type: 'catalog-budget', value: Number(e.currentTarget.value) }, e);
    }
    if ('data-in-stock' in p || 'data-offer' in p) {
      const stock = 'data-in-stock' in p;
      props.checked = stock ? f.onlyAvailable : f.offers;
      props.onChange = (e: React.ChangeEvent<HTMLInputElement>) =>
        emit(
          { type: stock ? 'catalog-stock' : 'catalog-offer', value: e.currentTarget.checked },
          e,
        );
    }
    if ('data-sort' in p) {
      props.value = state.sort;
      props.onChange = (e: React.ChangeEvent<HTMLSelectElement>) =>
        emit({ type: 'catalog-sort', value: e.currentTarget.value }, e);
    }
    if ('data-view' in p) {
      const active = p['data-view'] === state.view;
      props.className = active ? 'selected' : undefined;
      props['aria-pressed'] = active;
      props.onClick = (e: React.MouseEvent<HTMLElement>) =>
        emit({ type: 'catalog-view', value: p['data-view'] as 'grid' | 'list' }, e);
    }
    if ('data-clear-search' in p) {
      props.hidden = !state.search;
      props.onClick = (e: React.MouseEvent<HTMLElement>) =>
        emit({ type: 'catalog-clear-search' }, e);
    }
    if ('data-budget-label' in p)
      children = [f.budget >= 80000 ? 'Sin límite' : `Hasta ${money(f.budget)}`];
    if ('data-result-count' in p)
      children = [`${list.length} ${list.length === 1 ? 'producto' : 'productos'}`];
    if ('data-result-desc' in p)
      children = [state.cat === 'Todos' ? ' · Todas las categorías' : ` · ${state.cat}`];
    if ('data-mobile-count' in p)
      children = [`${list.length} ${list.length === 1 ? 'artículo' : 'artículos'}`];
    if ('data-filter-summary' in p)
      children = [
        count
          ? `${count} ${count === 1 ? 'filtro activo' : 'filtros activos'}`
          : 'Todas las categorías',
      ];
    if ('data-mobile-sort-label' in p) children = [sorts[state.sort]];
    if ('data-sheet-count' in p) {
      const n = selectProducts(products, { ...state, ...f }).length;
      children = [`Ver ${n} ${n === 1 ? 'producto' : 'productos'}`];
    }
    return React.createElement(n.tag, props, ...children);
  }
  return (
    <NativeEvents.Provider value={dispatch}>
      <React.Fragment>{tree.map((n, i) => render(n, i))}</React.Fragment>
    </NativeEvents.Provider>
  );
}
