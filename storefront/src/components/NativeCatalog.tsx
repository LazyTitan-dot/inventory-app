import * as React from 'react';
import { ActionButton, BrandCheckbox, useCardEvents } from './NativeEvents';
import { selectProducts } from '../integration/shop-actions';
import type { CatalogFlowStore } from '../integration/catalog-flow-model';
import { commercialMoney, isCommercial } from '../data/commercial/contract';
import type { Product } from '../data/contracts';
const noopSubscribe = (_fn: () => void) => () => {};
const noSnapshot = () => undefined;
export interface HomeProduct {
  id: string;
  name: string;
  mobileName?: string;
  img: string;
  price: string;
  cat: string;
  available?: boolean;
  commercial?: boolean;
}
export interface Category {
  name: string;
  image: string;
  label: string;
}
export const money = (n: number) => 'RD$ ' + new Intl.NumberFormat('en-US').format(n);
const priceOf = (p: Product) => (isCommercial(p) ? commercialMoney(p.priceMinor) : money(p.price));
export function Icon({
  name,
  size = 'small',
  hidden = true,
}: {
  name: string;
  size?: string;
  hidden?: boolean;
}) {
  return (
    <svg className={'icon ' + size} aria-hidden={hidden ? true : undefined}>
      <use href={'#' + name} />
    </svg>
  );
}
function HomeCard({
  p,
  favorites,
  mobile,
}: {
  p: HomeProduct;
  favorites: string[];
  mobile: boolean;
}) {
  const events = useCardEvents({ type: 'product', id: p.id });
  const heart = (
    <ActionButton
      action={{ type: 'favorite', id: p.id }}
      className="heart"
      aria-label={'Añadir ' + p.name + ' a favoritos'}
      aria-pressed={favorites.includes(p.id)}
      data-fav={p.id}
    >
      <Icon name="heart" hidden={false} />
    </ActionButton>
  );
  const price = (
    <div className="price">
      {p.price}
      <span className="card-chevron">
        <Icon name="chevron-right" hidden={false} />
      </span>
    </div>
  );
  const cardProps = {
    ...events,
    tabIndex: 0,
    role: 'link' as const,
    'aria-label': 'Ver detalle de ' + p.name,
    'data-card': p.id,
  };
  return mobile ? (
    <article className="mobile-product" {...cardProps}>
      {heart}
      <img src={p.img} alt={'' + p.name} />
      <div className="info">
        <div className="name">{p.mobileName || p.name}</div>
        {price}
      </div>
    </article>
  ) : (
    <article className="product" {...cardProps}>
      <div className="image">
        <img src={p.img} alt={'' + p.name} />
        {heart}
      </div>
      <div className="product-body">
        <h3>{p.name}</h3>
        {price}
        <div className="stock">
          <Icon name="check" hidden={false} />
          Disponible
        </div>
      </div>
    </article>
  );
}
export function HomeCards({
  items,
  favorites,
  mobile,
}: {
  items: HomeProduct[];
  favorites: string[];
  mobile: boolean;
}) {
  return items.length ? (
    items.map((p) => <HomeCard key={p.id} p={p} favorites={favorites} mobile={mobile} />)
  ) : (
    <p style={{ fontSize: mobile ? 11 : 12, color: '#526b82', padding: mobile ? undefined : 10 }}>
      Aún no hay productos destacados.
    </p>
  );
}
export function ProductCard({ p, favorite }: { p: Product; favorite: boolean }) {
  const events = useCardEvents({ type: 'product', id: p.id });
  return (
    <article
      {...events}
      className="catalog-product"
      data-card-product={p.id}
      tabIndex={0}
      role="link"
      aria-label={'Ver detalle de ' + p.name}
    >
      <div className="photo">
        <ActionButton
          action={{ type: 'favorite', id: p.id }}
          type="button"
          data-favorite={p.id}
          aria-label={(favorite ? 'Quitar de' : 'Agregar a') + ' favoritos ' + p.name}
          aria-pressed={favorite}
          className="favorite"
        >
          <Icon name="heart" />
        </ActionButton>
        {p.tag ? <span className="product-status">{p.tag}</span> : null}
        <img src={p.img} alt={'' + p.name} loading="lazy" />
      </div>
      <div className="details">
        <span className="product-type">{p.brand || p.cat}</span>
        <h4>{p.name}</h4>
        <strong className="price">{priceOf(p)}</strong>
        <span className={'availability ' + (p.available ? '' : 'ask')}>
          <span className="dot" />
          {p.available ? 'Disponible' : 'Agotado'}
        </span>
        <span className="card-chevron" aria-hidden="true">
          <Icon name="chevron-right" />
        </span>
      </div>
    </article>
  );
}
export function CatalogCards({
  items,
  favorites,
  store,
  products,
}: {
  items: Product[];
  favorites: string[];
  store?: CatalogFlowStore;
  products?: Product[];
}) {
  const snapshot = React.useSyncExternalStore(
    store?.subscribe ?? noopSubscribe,
    store?.getSnapshot ?? noSnapshot,
  );
  const visible = snapshot && products ? selectProducts(products, snapshot.state) : items;
  return visible.map((p) => <ProductCard key={p.id} p={p} favorite={favorites.includes(p.id)} />);
}
export function BrandFilters({
  brands,
  selected,
  store,
  draft = false,
}: {
  brands: string[];
  selected: readonly string[];
  store?: CatalogFlowStore;
  draft?: boolean;
}) {
  const snapshot = React.useSyncExternalStore(
    store?.subscribe ?? noopSubscribe,
    store?.getSnapshot ?? noSnapshot,
  );
  selected = (draft ? snapshot?.flow.draft?.brands : snapshot?.state.brands) ?? selected;
  return brands.map((b) => (
    <label key={b}>
      <BrandCheckbox brand={b} checked={selected.includes(b)} />
      <span>{b}</span>
    </label>
  ));
}
export function Categories({
  cards,
  items,
  kind,
  selected,
}: {
  cards: Category[];
  items: Product[];
  kind: 'desktop' | 'mobile' | 'filter' | 'sheet';
  selected?: string;
}) {
  return kind === 'desktop' || kind === 'mobile'
    ? cards.map((c) => (
        <ActionButton
          action={{ type: 'category', category: c.name }}
          key={c.name}
          type="button"
          className={
            (kind === 'desktop' ? 'catalog-cat' : 'mobile-cat') +
            (selected === c.name ? ' selected' : '')
          }
          data-cat={c.name}
          aria-pressed={selected === c.name}
        >
          <span className={kind === 'desktop' ? 'thumb' : 'category-photo'}>
            <img
              src={c.image}
              alt={kind === 'desktop' ? 'Imagen representativa de la categoría ' + c.label : ''}
              loading={kind === 'desktop' ? 'lazy' : undefined}
            />
          </span>
          <span className={kind === 'desktop' ? 'label' : undefined}>{c.label}</span>
        </ActionButton>
      ))
    : ['Todos', ...cards.map((c) => c.name)].map((c) =>
        kind === 'filter' ? (
          <ActionButton
            action={{ type: 'category', category: c }}
            key={c}
            type="button"
            className={'filter-cat' + (selected === c ? ' selected' : '')}
            data-cat={c}
            aria-pressed={selected === c}
          >
            <span>{c}</span>
            <span className="filter-cat-meta">
              {c === 'Todos' ? items.length : items.filter((p) => p.cat === c).length}
              <Icon name="chevron-right" />
            </span>
          </ActionButton>
        ) : (
          <ActionButton
            action={{ type: 'category', category: c }}
            key={c}
            type="button"
            className={selected === c ? 'selected' : undefined}
            data-cat={c}
            aria-pressed={selected === c}
          >
            {c}
          </ActionButton>
        ),
      );
}
export function FilterChips({ active }: { active: [string, string][] }) {
  return [
    ...active.map(([label, key]) => (
      <ActionButton
        action={{ type: 'filter-remove', key }}
        key={key}
        data-remove={key}
        aria-label={'Quitar filtro ' + label}
      >
        {label} <Icon name="close" />
      </ActionButton>
    )),
    active.length ? (
      <ActionButton
        action={{ type: 'filter-reset' }}
        key="clear"
        className="clear-all"
        data-reset=""
      >
        Limpiar todo
      </ActionButton>
    ) : null,
  ];
}
export function Detail({
  p,
  related,
  images,
  view,
  qty,
  favorites,
  onGallery,
  onQuantity,
  store,
  variants = [],
}: {
  p: Product;
  related: Product[];
  variants?: Product[];
  images: string[];
  view: number;
  qty: number;
  favorites: string[];
  onGallery?: (index: number, source: HTMLElement) => void;
  onQuantity?: (delta: number, source: HTMLElement) => void;
  store?: CatalogFlowStore;
}) {
  const snapshot = React.useSyncExternalStore(
    store?.subscribe ?? noopSubscribe,
    store?.getSnapshot ?? noSnapshot,
  );
  if (snapshot?.flow.currentProduct?.id === p.id) {
    view = snapshot.flow.galleryView;
    qty = snapshot.flow.qty;
  }
  const fav = favorites.includes(p.id);
  return [
    <ActionButton action={{ type: 'detail-back' }} key="back" className="pdp-back" data-pdp-back="">
      <Icon name="chevron-right" /> Volver al catálogo
    </ActionButton>,
    <div key="path" className="pdp-path">
      Tienda <Icon name="chevron-right" /> {p.cat} <Icon name="chevron-right" /> Detalle
    </div>,
    <div key="grid" className="pdp-grid">
      <div className="pdp-gallery">
        <ActionButton
          action={{ type: 'detail-zoom' }}
          className="pdp-photo"
          data-pdp-zoom=""
          aria-label="Ver imagen a pantalla completa"
        >
          <img src={images[view]} alt={p.name + ' — fotografía'} />
          <span className="pdp-zoom-label">
            <Icon name="search" /> Ampliar
          </span>
        </ActionButton>
        <div className="pdp-gallery-controls" role="group" aria-label="Fotografías del producto">
          {images.map((src, i) => (
            <button
              key={i}
              className="pdp-thumb"
              data-gallery={i}
              onClick={
                onGallery
                  ? (e) => {
                      e.stopPropagation();
                      onGallery(i, e.currentTarget);
                    }
                  : undefined
              }
              aria-pressed={view === i}
              aria-label={'Ver imagen ' + (i + 1)}
            >
              <img src={src} alt="" />
            </button>
          ))}
          <span className="pdp-gallery-note">
            {images.length} {images.length === 1 ? 'foto' : 'fotos'}
          </span>
        </div>
      </div>
      <div className="pdp-info">
        <span className="pdp-brand">{p.brand}</span>
        <h2 className="pdp-title" tabIndex={-1}>
          {p.name}
        </h2>
        <div className="pdp-meta">
          <span className={'pdp-stock ' + (p.available ? '' : 'no')}>
            <i />
            {p.available ? 'Disponible' : 'Agotado'}
          </span>
          <span>·</span>
          <span>{p.variantName}</span>
        </div>
        <div className="pdp-price">{priceOf(p)}</div>
        <p className="pdp-tax">Precio en RD$ · ITBIS incluido</p>
        {variants.length > 1 ? (
          <div className="pdp-quantity" role="group" aria-label="Variantes">
            <span>Variante</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {variants.map((v) => (
                <ActionButton
                  key={v.id}
                  action={{ type: 'product', id: v.id }}
                  data-variant={v.id}
                  aria-pressed={v.id === p.id}
                  className="pdp-secondary"
                  style={{ fontWeight: v.id === p.id ? 700 : 400 }}
                >
                  {v.variantName}
                  {v.available ? '' : ' · Agotado'}
                </ActionButton>
              ))}
            </div>
          </div>
        ) : null}
        <hr className="pdp-divider" />
        <div className="pdp-quantity">
          <span>Cantidad</span>
          <div className="pdp-stepper">
            <button
              data-qty="-1"
              onClick={
                onQuantity
                  ? (e) => {
                      e.stopPropagation();
                      onQuantity(-1, e.currentTarget);
                    }
                  : undefined
              }
              aria-label="Reducir cantidad"
              disabled={qty === 1 || !p.available}
            >
              −
            </button>
            <output aria-live="polite">{qty}</output>
            <button
              data-qty="1"
              onClick={
                onQuantity
                  ? (e) => {
                      e.stopPropagation();
                      onQuantity(1, e.currentTarget);
                    }
                  : undefined
              }
              aria-label="Aumentar cantidad"
              disabled={qty >= (p.maxQuantity ?? 9) || !p.available}
            >
              +
            </button>
          </div>
        </div>
        <div className="pdp-actions">
          <ActionButton
            action={{ type: 'detail-add' }}
            className="pdp-add"
            data-pdp-add=""
            disabled={!p.available}
          >
            <Icon name="cart" /> Añadir al carrito
          </ActionButton>
          <ActionButton
            action={{ type: 'detail-save' }}
            className="pdp-save"
            data-pdp-save=""
            aria-pressed={fav}
            aria-label={fav ? 'Quitar de favoritos' : 'Guardar en favoritos'}
          >
            <Icon name="heart" size="large" />
          </ActionButton>
        </div>
      </div>
    </div>,
    <div key="lower" className="pdp-lower">
      <h3>Conoce el producto</h3>
      <details open>
        <summary>
          Descripción <Icon name="chevron-right" />
        </summary>
        <p>{p.spec}</p>
      </details>
      <details>
        <summary>
          Especificaciones <Icon name="chevron-right" />
        </summary>
        <dl>
          <div>
            <dt>Categoría</dt>
            <dd>{p.cat}</dd>
          </div>
          <div>
            <dt>Características</dt>
            <dd>{p.spec}</dd>
          </div>
          <div>
            <dt>Marca y modelo</dt>
            <dd>
              {p.brand} · {p.model ?? 'modelo por integrar'}
            </dd>
          </div>
        </dl>
      </details>
      <details>
        <summary>
          Garantía <Icon name="chevron-right" />
        </summary>
        <p>
          {p.warrantyMonths
            ? p.warrantyMonths + ' meses'
            : 'Consulta las condiciones de garantía de este producto.'}
        </p>
      </details>
      {related.length ? <h3 style={{ marginTop: 24 }}>También te puede interesar</h3> : null}
      {related.length ? (
        <div className="pdp-related">
          <CatalogCards items={related} favorites={favorites} />
        </div>
      ) : null}
    </div>,
  ];
}
