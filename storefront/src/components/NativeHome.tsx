import * as React from 'react';
import { HomeCards, Icon, type HomeProduct } from './NativeCatalog';
import { NativeEvents } from './NativeEvents';
import { BrandCarousel } from './BrandCarousel';
import { ManagedHero, ManagedStrip } from './ManagedCampaign';
import { CampaignContext, type Campaign } from '../data/commercial/campaigns';
import type { Product } from '../data/contracts';
import type { ShellNode } from './ApprovedShell';
import type { Mode, Route, SessionSnapshot } from '../integration/controller';
import { homeItems, homeRoute } from '../integration/home-model';
import type { NativeDispatch } from '../integration/shop-actions';

interface HomeProps {
  tree: ShellNode[];
  products: HomeProduct[];
  catalog: Product[];
  root: ShadowRoot;
  mode: Mode;
  session: SessionSnapshot;
  onRoute: (route: Route, value?: string) => void;
}
export function NativeHome({ tree, products, catalog, root, mode, session, onRoute }: HomeProps) {
  const [term, setTerm] = React.useState('');
  const [expanded, setExpanded] = React.useState(false);
  const campaigns = React.useContext(CampaignContext);
  const categories = [...new Set(catalog.map((p) => p.cat))];
  const brands = [...new Set(catalog.map((p) => p.brand).filter(Boolean))];
  const route = (r: Route, value?: string) => {
    setExpanded(false);
    onRoute(r, value);
  };
  const dispatch: NativeDispatch = (a) => {
    if (a.type === 'favorite' || a.type === 'product')
      route(a.type === 'favorite' ? 'favorite' : 'detail', a.id);
  };
  const live = (item: Campaign) => !item.target || Boolean(campaigns?.variant(item.target));
  const open = (item: Campaign) => {
    const variant = item.target && campaigns?.variant(item.target);
    if (variant) route('detail', variant);
    else route('category', 'Todos');
  };
  function render(n: ShellNode, i: number): React.ReactNode {
    if (typeof n === 'string') return n;
    const p = n.props,
      id = p.id,
      cls = p.className;
    const props: Record<string, unknown> = { ...p, key: i };
    let children: React.ReactNode[] = n.children.map(render);
    if (id === 'stage')
      props.className = 'stage ' + (mode === 'desktop' ? 'only-desktop' : 'only-phone');
    if ('data-search' in p) {
      props.value = term;
      props.onChange = (e: React.ChangeEvent<HTMLInputElement>) => setTerm(e.currentTarget.value);
      props.onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') route('search', term);
      };
    }
    const dest = homeRoute(p);
    if (dest) props.onClick = () => route(dest.route, dest.value);
    if (p['data-scroll'] === 'top' || p['data-mobiletab'] === 'inicio')
      props.onClick = (e: React.MouseEvent) => {
        e.preventDefault();
        root
          .querySelector(mode === 'iphone' ? '#phoneContent' : '.home-viewport')
          ?.scrollTo({ top: 0, behavior: 'smooth' });
      };
    if (id === 'categoryToggle') {
      props['aria-expanded'] = expanded;
      props.onClick = () => setExpanded((v) => !v);
    }
    if (id === 'submenu') {
      props.className = 'submenu' + (expanded ? ' visible' : '');
      children = ['Todos', ...categories].map((c) => (
        <button key={c} onClick={() => route('category', c)}>
          {c}
          <Icon name="chevron-right" />
        </button>
      ));
    }
    if (cls === 'desktop-nav')
      children.push(
        ...categories.map((c) => (
          <button key={c} onClick={() => route('category', c)}>
            {c}
            <Icon name="chevron-right" />
          </button>
        )),
      );
    if ('data-count' in p) children = [String(session.count)];
    if (id === 'desktopHero' || id === 'mobileHero') {
      const main = campaigns?.banners.find((b) => b.slot === 'Principal' && live(b));
      const editorial = {
        id: 'home',
        title: 'Tecnología y hogar, a tu alcance.',
        subtitle: 'Explora el catálogo de S-mart Living.',
        target: null,
      };
      children = [
        <ManagedHero
          key="hero"
          campaign={main ?? editorial}
          mobile={id === 'mobileHero'}
          open={() => (main ? open(main) : route('category', 'Todos'))}
        />,
      ];
    }
    if (id === 'desktopGrid' || id === 'mobileGrid')
      children = [
        <NativeEvents.Provider key="cards" value={dispatch}>
          {products.length ? (
            <HomeCards
              items={homeItems(products, term)}
              favorites={session.favorites}
              mobile={id === 'mobileGrid'}
            />
          ) : (
            <p className="catalog-empty">
              {catalog.length
                ? 'Aún no hay productos destacados.'
                : 'Aún no hay productos publicados.'}
            </p>
          )}
        </NativeEvents.Provider>,
      ];
    if (cls === 'home-extra') {
      const strips = [
        ...(campaigns?.banners.filter((b) => b.slot === 'Franja superior') ?? []),
        ...(campaigns?.promos ?? []),
      ].filter(live);
      children = strips.map((item) => (
        <ManagedStrip key={item.id} campaign={item} open={() => open(item)} />
      ));
      if (brands.length)
        children.push(
          <BrandCarousel
            key={brands.join('|')}
            names={brands}
            onBrand={(name) => route('search', name)}
          />,
        );
    }
    if (cls === 'store-footer') children = [<p key="brand">S-mart Living</p>];
    return React.createElement(n.tag, props, ...children);
  }
  return <>{tree.map(render)}</>;
}
