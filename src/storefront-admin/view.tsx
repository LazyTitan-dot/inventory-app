import { Fragment, type ReactNode, type KeyboardEvent } from 'react';
import type { AdminData, Product, Banner, Promotion } from './presentation';
import {
  eligible,
  visible,
  approved,
  gross,
  campaignStatus as statusCampaign,
} from './presentation';
import { ProductImage } from '../components/ProductImage';
export interface ViewState {
  state: AdminData;
  tab: string;
  view: string;
  query: string;
  filter: string;
  category: string;
  ascending: boolean;
  draft: Product | Banner | Promotion | null;
  kind: string;
  error: string;
}
const icons = {
  menu: 'M4 6h16M4 12h16M4 18h16',
  home: 'M3 11l9-8 9 8v9H3zM9 20v-7h6v7',
  box: 'M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10',
  bag: 'M5 7h14l2 14H3zM9 8V6a3 3 0 0 1 6 0v2',
  users:
    'M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M19 8v6M16 11h6',
  file: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7',
  truck:
    'M3 5h12v13H3zM15 10h4l3 4v4h-7M7 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4M18 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4',
  percent: 'M5 19L19 5M7 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4M17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4',
  chart: 'M4 20h16M7 16V9M12 16V4M17 16v-5',
  gear: 'M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1M5.6 18.4l2.1-2.1m8.6-8.6 2.1-2.1M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10',
  store: 'M3 9l2-5h14l2 5v3H3zM5 12v9h14v-9M9 21v-6h6v6',
  star: 'm12 3 3 6 7 .9-5 4.9 1.3 7-6.3-3.3L5.7 22 7 14.8l-5-4.9L9 9z',
  image: 'M3 4h18v16H3zM8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4M3 17l5-5 4 4 3-3 6 6',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
  lock: 'M5 10h14v11H5zM8 10V7a4 4 0 0 1 8 0v3M12 14v3',
  check: 'm5 12 4 4L19 6',
  warn: 'M12 3 2 21h20zM12 9v5M12 17v.1',
  search: 'M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14m5-2 6 6',
  right: 'm9 6 6 6-6 6',
  left: 'm15 6-6 6 6 6',
  up: 'm6 15 6-6 6 6',
  down: 'm6 9 6 6 6-6',
  moon: 'M20 15a8 8 0 0 1-11-11 9 9 0 1 0 11 11z',
  sun: 'M12 3v2M12 19v2M3 12h2M19 12h2M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10',
  plus: 'M12 5v14M5 12h14',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 11v6M12 7v.1',
  reset: 'M3 10a9 9 0 1 1 2 8M3 4v6h6',
  sort: 'M8 4v16M5 7l3-3 3 3M16 20V4m-3 13 3 3 3-3',
};
export const tabs = [
  ['products', 'Publicaciones', 'box'],
  ['featured', 'Destacados', 'star'],
  ['banners', 'Banners', 'image'],
  ['promos', 'Promociones', 'percent'],
  ['preview', 'Vista previa', 'eye'],
];
type Handlers = {
  action: (act: string, key: string, id: string) => void;
  field: (id: string, field: string, value: string) => void;
  keydown: (e: KeyboardEvent) => void;
};
export function AdminView({
  ctx,
  handlers,
  taxBasisPoints,
  day,
}: {
  ctx: ViewState;
  handlers: Handlers;
  taxBasisPoints: number;
  day: string;
}) {
  const { state, tab, view, query, filter, category, ascending, kind, error } = ctx;
  const { action, field: change, keydown } = handlers;
  const draft = ctx.draft as Product & Banner & Promotion;
  const campaignStatus = (item: Banner | Promotion, banner: boolean) =>
    statusCampaign(item, banner, state, day);
  const money = (n: number) =>
    'RD$ ' +
    (n / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const webVariants = (p: Product) =>
    p.published && p.active
      ? p.variants.filter((v) => v.active && v.base > 0 && v.visible && (p.showOut || v.stock > 0))
      : [];
  const cover = (p: Product) => approved(p)[0]?.asset || '';
  const status = (p: Product): [string, string] =>
    visible(p) ? ['Publicado', 'good'] : p.published ? ['Bloqueado', 'warn'] : ['Privado', ''];
  const I = (n: string) => (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={icons[n as keyof typeof icons] || icons.box} />
    </svg>
  );
  const image = (a: string | undefined, cls = 'thumb', alt = '') => {
    const ref = a?.startsWith('storage:') ? a : state.bannerAssets?.find((m) => m.id === a)?.asset;
    return ref ? (
      <ProductImage
        productId={ref.slice(8).split('/')[0] ?? ''}
        source={ref}
        alt={alt}
        className={cls}
      />
    ) : (
      <span
        className={cls}
        style={{ display: 'inline-grid', placeItems: 'center', color: '#8796a7' }}
      >
        {I('image')}
      </span>
    );
  };
  const badge = (s: string, c = '') => (
    <span className={'badge ' + c}>
      <span className="dot" />
      {s}
    </span>
  );
  const btn = (label: string, act: string, icon = '', cls = '') => (
    <button className={cls} data-action={act} onClick={() => action(act, '', '')}>
      {icon && I(icon)}
      {label}
    </button>
  );
  const iconbtn = (
    label: string,
    act: string,
    icon: string,
    extra: { id?: string; disabled?: boolean } = {},
  ) => (
    <button
      className="icon"
      data-action={act}
      aria-label={label}
      data-id={extra.id}
      disabled={extra.disabled}
      onClick={() => action(act, '', extra.id || '')}
    >
      {I(icon)}
    </button>
  );
  const sw = (key: string, on: boolean, label: string, disabled = false) => (
    <button
      className="switch"
      role="switch"
      aria-label={label}
      aria-checked={on}
      data-action="toggle"
      data-key={key}
      disabled={disabled}
      onClick={() => action('toggle', key, '')}
    />
  );
  const toggleline = (title: string, help: string, key: string, on: boolean, disabled = false) => (
    <div className="toggleline">
      <div>
        <b>{title}</b>
        <small>{help}</small>
      </div>
      {sw(key, on, title, disabled)}
    </div>
  );
  const note = (s: ReactNode, w = false) => (
    <div className={'note ' + (w ? 'warn' : '')}>
      {I(w ? 'warn' : 'info')}
      <div>{s}</div>
    </div>
  );
  const section = (title: string, desc = '', actions: ReactNode = '') => (
    <div className="section">
      <div>
        <h2>{title}</h2>
        {desc && <p className="muted small">{desc}</p>}
      </div>
      {actions}
    </div>
  );
  const field = (key: string, label: string, value: unknown, type = 'text', maxLength?: number) => (
    <div className="field">
      <label htmlFor={'f-' + key}>{label}</label>
      <input
        id={'f-' + key}
        type={type}
        data-field={key}
        value={String(value)}
        maxLength={maxLength}
        onChange={(e) => change('f-' + key, key, e.target.value)}
      />
    </div>
  );
  const select = (key: string, label: string, value: unknown, opts: string[][]) => (
    <div className="field">
      <label htmlFor={'f-' + key}>{label}</label>
      <select
        id={'f-' + key}
        data-field={key}
        value={String(value)}
        onChange={(e) => change('f-' + key, key, e.target.value)}
      >
        {opts.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
  function render() {
    if (view === 'detail') return renderDetail();
    const n = state.products.filter(visible).length,
      f = state.products.filter((p) => visible(p) && p.featured).length,
      b = state.products.filter((p) => p.published && !visible(p)).length;
    const stats = [
      ['Publicado', n, 'Productos visibles', 'eye', 'published'],
      [
        'Privado',
        state.products.filter((p) => !p.published).length,
        'Sin autorización web',
        'lock',
        'private',
      ],
      ['Destacado', f, 'En Homepage', 'star', 'featured'],
      ['Requiere atención', b, 'Bloqueados por reglas', 'warn', 'blocked'],
    ];
    return (
      <>
        <div className="hero">
          <div>
            <div className="eyebrow">Comercial · Tienda online</div>
            <h1>Gestión del Storefront</h1>
            <p>Controla qué productos, imágenes y campañas aparecen en la tienda online.</p>
          </div>
          <div className="hero-actions">
            {btn('Vista previa', 'preview', 'eye', 'primary')}
            {iconbtn('Actualizar catálogo', 'refresh', 'reset')}
          </div>
        </div>
        <div className="stats">
          {stats.map(([t, v, d, i, k]) => (
            <Fragment key={String(k)}>
              <button
                key={String(k)}
                onClick={() => action('stat', String(k), '')}
                className="stat"
                data-action="stat"
                data-key={k}
              >
                <div className="line">
                  <span>{t}</span>
                  <span className="symbol">{I(String(i))}</span>
                </div>
                <strong>{v}</strong>
                <p>{d}</p>
              </button>
            </Fragment>
          ))}
        </div>
        <div className="tabs" role="tablist" aria-label="Secciones de tienda online">
          {tabs.map(([v, l, i]) => (
            <Fragment key={v}>
              <button
                key={v}
                onKeyDown={keydown}
                onClick={() => action('tab', v!, '')}
                tabIndex={tab === v ? 0 : -1}
                role="tab"
                aria-selected={tab === v}
                data-action="tab"
                data-key={v}
              >
                {I(i!)}
                {l}
              </button>
            </Fragment>
          ))}
        </div>
        <div id="content">{renderContent()}</div>
        {note(
          <>
            <b>Producción.</b> Los cambios de publicación afectan la tienda online. Los precios y
            existencias se gestionan en Inventario.
          </>,
        )}
        <div className="footer">S-mart Living · Gestión Administrativa del Storefront V1.2</div>
      </>
    );
  }
  function renderContent() {
    if (tab === 'products') {
      return (
        <section className="panel">
          {section(
            'Publicaciones',
            'Gestiona la visibilidad comercial sin modificar el inventario.',
          )}
          <div className="toolbar">
            <div className="search">
              {I('search')}
              <input
                onChange={(e) => change('search', '', e.target.value)}
                id="search"
                aria-label="Buscar productos"
                placeholder="Buscar marca, modelo…"
                value={query}
              />
            </div>
            <select
              value={filter}
              onChange={(e) => change('filter', '', e.target.value)}
              id="filter"
              aria-label="Estado de publicación"
            >
              {[
                ['all', 'Todos los estados'],
                ['published', 'Publicados'],
                ['private', 'Privados'],
                ['blocked', 'Bloqueados'],
                ['out', 'Agotados'],
              ].map(([v, l]) => (
                <Fragment key={v}>
                  <option key={v} value={v}>
                    {l}
                  </option>
                </Fragment>
              ))}
            </select>
            <select
              value={category}
              onChange={(e) => change('category', '', e.target.value)}
              id="category"
              aria-label="Categoría"
            >
              {['all', 'Celulares', 'Televisores', 'Aires acondicionados', 'Otros'].map((v) => (
                <Fragment key={v}>
                  <option key={v} value={v}>
                    {v === 'all' ? 'Categorías: todas' : v}
                  </option>
                </Fragment>
              ))}
            </select>
          </div>
          <div id="rows">{renderRows()}</div>
        </section>
      );
    }
    if (tab === 'featured') {
      const featured = state.products
        .filter((p) => p.featured && visible(p))
        .sort((a, b) => a.order - b.order);
      return (
        <section className="panel">
          {section('Productos destacados', 'Orden en Homepage. Solo productos publicables.')}
          <div className="formbody">
            {featured.length ? (
              featured.map((p, i) => (
                <Fragment key={p.id}>
                  <div className="contentrow">
                    <span className="rank">{i + 1}</span>
                    {image(cover(p))}
                    <div>
                      <b>{p.brand + ' ' + p.model}</b>
                      <div className="small muted">{p.category}</div>
                    </div>
                    <div className="actions">
                      {iconbtn('Subir ' + p.model, 'feature-up', 'up', {
                        id: p.id,
                        disabled: i === 0,
                      })}
                      {iconbtn('Bajar ' + p.model, 'feature-down', 'down', {
                        id: p.id,
                        disabled: i === featured.length - 1,
                      })}
                      {iconbtn('Editar ' + p.model, 'edit', 'right', { id: p.id })}
                    </div>
                  </div>
                </Fragment>
              ))
            ) : (
              <div className="empty">No hay productos destacados.</div>
            )}
            {note('Para añadir o retirar destacados, abre una publicación y modifica su estado.')}
          </div>
        </section>
      );
    }
    if (tab === 'banners' || tab === 'promos') {
      const isBanner = tab === 'banners',
        arr = (isBanner ? state.banners : state.promos) as (Banner & Promotion)[];
      return (
        <section className="panel">
          {section(
            isBanner ? 'Banners de Homepage' : 'Promociones web',
            isBanner
              ? 'Contenido y vigencia; conserva la composición aprobada.'
              : 'Autoriza la difusión web de promociones existentes (sin aplicar descuentos).',
            isBanner ? btn('Nuevo', 'new', 'plus', 'primary') : '',
          )}
          <div className="formbody">
            {arr.map((x) => (
              <Fragment key={x.id}>
                <div className="contentrow">
                  {isBanner ? (
                    image(x.asset)
                  ) : (
                    <Fragment key={x.id}>
                      <span className="symbol" style={{ color: 'var(--accent)' }}>
                        {I('percent')}
                      </span>
                    </Fragment>
                  )}
                  <div>
                    <b>{x.title}</b>
                    <div className="small muted">
                      {isBanner
                        ? x.slot
                        : x.code +
                          ' · ' +
                          (x.kind === 'percent' ? x.value + '%' : money(x.value * 100))}
                    </div>
                    <div className="small muted">
                      {x.start} — {x.end}
                    </div>
                    <div style={{ marginTop: 6 }}>
                      {badge(
                        campaignStatus(x, isBanner),
                        campaignStatus(x, isBanner) === 'Vigente' ? 'good' : '',
                      )}
                    </div>
                  </div>
                  {iconbtn('Editar ' + x.title, 'edit-content', 'right', { id: x.id })}
                </div>
              </Fragment>
            ))}
            {note(
              isBanner
                ? 'Los banners utilizan recursos comerciales autorizados y destinos internos.'
                : 'El precio del catálogo no se modifica. La aplicación de cupones y el cálculo de descuentos quedan para la etapa de pedidos.',
            )}
          </div>
        </section>
      );
    }
    return renderPreview();
  }
  function renderRows() {
    const rows = state.products
      .filter(
        (p) =>
          (p.brand + ' ' + p.model + ' ' + p.category)
            .toLowerCase()
            .includes(query.toLowerCase()) &&
          (category === 'all' || p.category === category) &&
          (filter === 'all' ||
            (filter === 'published' && visible(p)) ||
            (filter === 'private' && !p.published) ||
            (filter === 'blocked' && p.published && !visible(p)) ||
            (filter === 'out' &&
              p.variants.filter((v) => v.active && v.visible && v.base > 0).length > 0 &&
              p.variants
                .filter((v) => v.active && v.visible && v.base > 0)
                .every((v) => v.stock === 0))),
      )
      .sort(
        (a, b) =>
          (ascending ? 1 : -1) * (a.brand + ' ' + a.model).localeCompare(b.brand + ' ' + b.model),
      );
    const table = rows.length ? (
      <table className="table">
        <thead>
          <tr>
            <th aria-sort={ascending ? 'ascending' : 'descending'}>
              <button onClick={() => action('sort', '', '')} data-action="sort">
                Producto {I('sort')}
              </button>
            </th>
            <th className="hide-mid">Variantes</th>
            <th>Precio final</th>
            <th>Publicación</th>
            <th className="hide-mid">Fotos web</th>
            <th>
              <span className="small">Detalle</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const vs = p.variants.filter((v) => v.active && v.base > 0),
              min = vs.length ? Math.min(...vs.map((v) => gross(v.base, taxBasisPoints))) : 0;
            const [s, c] = status(p);
            return (
              <Fragment key={p.id}>
                <tr>
                  <td className="productcell">
                    <div className="prod">
                      {image(p.media[0]?.asset)}
                      <div>
                        <b>{p.brand + ' ' + p.model}</b>
                        <small>
                          {p.category} · {p.active ? 'Activo' : 'Archivado'}
                        </small>
                      </div>
                    </div>
                  </td>
                  <td className="hide-mid">{vs.length}</td>
                  <td className="pricecell price">
                    {min ? `${vs.length > 1 ? 'Desde ' : ''}${money(min)}` : 'Sin precio'}
                  </td>
                  <td className="statuscell">
                    {badge(s, c)} {p.featured && visible(p) ? badge('Destacado', 'good') : ''}
                  </td>
                  <td className="hide-mid num">
                    {approved(p).length}/{p.media.length}
                  </td>
                  <td className="chevcell">
                    {iconbtn('Gestionar ' + p.brand + ' ' + p.model, 'edit', 'right', { id: p.id })}
                  </td>
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    ) : (
      <div className="empty">No hay productos que coincidan con los filtros.</div>
    );
    return (
      <>
        {table}
        {
          <div className="listfoot">
            <span>
              {rows.length} de {state.products.length} productos
            </span>
            <span>ITBIS incluido</span>
          </div>
        }
      </>
    );
  }
  function renderDetail() {
    const title =
      kind === 'product'
        ? draft.brand + ' ' + draft.model
        : kind === 'banner'
          ? 'Editar banner'
          : 'Promoción web';
    return (
      <>
        <div className="detailhead">
          {iconbtn('Volver', 'back', 'left')}
          <div>
            <div className="eyebrow">
              {kind === 'product'
                ? 'Publicación comercial'
                : kind === 'banner'
                  ? 'Contenido de Homepage'
                  : 'Canal web'}
            </div>
            <h1 id="detail-title" tabIndex={-1}>
              {title}
            </h1>
          </div>
        </div>
        <div id="editor">{renderEditor()}</div>
        <div className="savebar">
          <span id="form-error" role="alert" className={`${error ? 'error' : 'muted'} small`}>
            {error || 'Los cambios se aplicarán al canal comercial.'}
          </span>
          {btn('Cancelar', 'back')}
          {btn('Guardar cambios', 'save', 'check', 'primary')}
        </div>
      </>
    );
  }
  function renderEditor() {
    if (kind === 'product') {
      const [s, c] = status(draft);
      const blocked = !eligible(draft);
      return (
        <div className="detailgrid">
          <div className="stack">
            <section className="panel">
              {section('Publicación web', 'Configuración independiente del estado de inventario.')}
              <div className="formbody">
                {toggleline(
                  'Publicar en tienda online',
                  'Autoriza la consulta comercial de este producto.',
                  'published',
                  draft.published,
                  !draft.active && !draft.published,
                )}
                {toggleline(
                  'Producto destacado',
                  'Aparece en la selección de Homepage.',
                  'featured',
                  draft.featured,
                  !draft.published || !eligible(draft),
                )}
                {toggleline(
                  'Mostrar cuando esté agotado',
                  'Mantiene la ficha sin habilitar compra.',
                  'showOut',
                  draft.showOut,
                )}
                {field('slug', 'Enlace comercial', draft.slug, 'text', 120)}
                <div className="small muted">/producto/{draft.slug}</div>
                {blocked
                  ? note(
                      <>
                        <b>Publicación bloqueada.</b> No existe una variante activa, con precio
                        válido y visibilidad permitida.
                      </>,
                      true,
                    )
                  : ''}
              </div>
            </section>
            <section className="panel">
              {section('Variantes', 'Precio e inventario provienen de Inventory Manager.')}
              <div className="formbody">
                {draft.variants.map((v) => (
                  <Fragment key={v.id}>
                    <div className="variant">
                      <div>
                        <b>{v.name}</b>
                        <div className="small muted">
                          {v.active && v.base > 0
                            ? money(gross(v.base, taxBasisPoints))
                            : 'No comercializable'}{' '}
                          ·{' '}
                          {v.active
                            ? v.stock
                              ? `${v.stock} disponibles`
                              : 'Agotado'
                            : 'Archivada'}
                        </div>
                        <div style={{ marginTop: 5 }}>
                          {badge(
                            !v.active
                              ? 'Archivada'
                              : v.base <= 0
                                ? 'Sin precio'
                                : v.visible
                                  ? 'Incluida'
                                  : 'Excluida',
                            v.active && v.base > 0 && v.visible ? 'good' : '',
                          )}
                        </div>
                      </div>
                      {sw(
                        'variant:' + v.id,
                        v.visible && v.active && v.base > 0,
                        'Incluir variante ' + v.name,
                        !v.active || v.base <= 0,
                      )}
                    </div>
                  </Fragment>
                ))}
                {note('Solo las variantes autorizadas pueden aparecer en la tienda.')}
              </div>
            </section>
            <section className="panel">
              {section(
                'Fotografías autorizadas',
                'La primera fotografía aprobada será la portada web.',
              )}
              <div className="formbody">
                {draft.media.length ? (
                  draft.media.map((m, i) => (
                    <Fragment key={m.id}>
                      <div className="mediaitem">
                        {image(m.asset)}
                        <div>
                          <b>Fotografía {i + 1}</b>
                          <div className="small muted">
                            {m.approved && approved(draft)[0]?.id === m.id
                              ? 'Portada web'
                              : m.approved
                                ? 'Galería web'
                                : 'Privada'}
                          </div>
                          {sw('media:' + m.id, m.approved, 'Autorizar fotografía ' + (i + 1))}
                        </div>
                        <div className="controls">
                          {iconbtn('Mover fotografía ' + (i + 1) + ' arriba', 'media-up', 'up', {
                            id: m.id,
                            disabled: i === 0,
                          })}
                          {iconbtn('Mover fotografía ' + (i + 1) + ' abajo', 'media-down', 'down', {
                            id: m.id,
                            disabled: i === draft.media.length - 1,
                          })}
                        </div>
                      </div>
                    </Fragment>
                  ))
                ) : (
                  <p className="muted">No hay fotografías para autorizar.</p>
                )}
                {note(
                  'La aprobación web no elimina ni altera la galería privada de Inventory Manager.',
                )}
              </div>
            </section>
          </div>
          <div className="stack">
            <section className="panel">
              {section('Vista previa del producto', 'Resultado antes de guardar.')}
              <div className="formbody">
                {cover(draft) ? (
                  image(cover(draft), 'preview-card-img', draft.model)
                ) : (
                  <div className="empty">Sin foto aprobada</div>
                )}
                <h2>{draft.brand + ' ' + draft.model}</h2>
                <div>
                  {badge(s, c)} {draft.featured && visible(draft) ? badge('Destacado', 'good') : ''}
                </div>
                <p className="muted">
                  {draft.category} · {webVariants(draft).length} variantes visibles
                </p>
                {webVariants(draft).map((v) => (
                  <Fragment key={v.id}>
                    <div className="variant">
                      <div>
                        <b>{v.name}</b>
                        <div className="small muted">{v.stock ? 'Disponible' : 'Agotado'}</div>
                      </div>
                      <span className="price">{money(gross(v.base, taxBasisPoints))}</span>
                    </div>
                  </Fragment>
                ))}
              </div>
            </section>
            {note(
              <>
                <b>Sin edición de precio ni stock.</b> Usa los módulos de Inventario existentes para
                cambios administrativos.
              </>,
            )}
          </div>
        </div>
      );
    }
    const banner = kind === 'banner';
    const options = state.products.filter(visible).map((p) => [p.id, p.brand + ' ' + p.model]);
    if (banner && !options.some(([v]) => v === draft.target) && draft.target !== 'catalogo')
      options.push([draft.target, 'Destino no disponible']);
    return (
      <div className="detailgrid">
        <div className="stack">
          <section className="panel">
            {section(
              banner ? 'Configuración del banner' : 'Promoción existente',
              banner
                ? 'Edita el contenido para el canal web.'
                : 'Los parámetros administrativos se conservan sin cambios.',
            )}
            <div className="formbody">
              {banner ? (
                field('title', 'Título', draft.title, 'text', 70)
              ) : (
                <div className="field">
                  <b>{draft.title}</b>
                  <p className="muted">
                    {draft.code} ·{' '}
                    {draft.kind === 'percent' ? draft.value + '%' : money(draft.value * 100)}
                  </p>
                  <p className="small muted">
                    Alcance:{' '}
                    {draft.scope === 'all'
                      ? 'Todos los productos'
                      : draft.scopeLabel ||
                        state.products.find((p) => p.id === draft.scope)?.model ||
                        'No disponible'}
                  </p>
                </div>
              )}
              {banner ? (
                <>
                  {field('subtitle', 'Texto secundario', draft.subtitle, 'text', 120)}
                  {select('slot', 'Ubicación', draft.slot, [
                    ['Franja superior', 'Franja superior'],
                    ['Principal', 'Principal'],
                  ])}
                  {select('target', 'Destino interno', draft.target, [
                    ['catalogo', 'Catálogo'],
                    ...options,
                  ])}
                  {select('asset', 'Recurso autorizado', draft.asset, [
                    ['', 'Solo texto'],
                    ...(state.bannerAssets ?? []).map(
                      (a) => [a.id, a.asset.split('/').pop() || a.id] as [string, string],
                    ),
                  ])}
                </>
              ) : (
                ''
              )}
              {banner ? (
                <div className="fieldrow">
                  {field('start', 'Inicio', draft.start, 'date')}
                  {field('end', 'Fin', draft.end, 'date')}
                </div>
              ) : (
                <div className="field">
                  <b>Vigencia administrativa</b>
                  <p className="muted">
                    {draft.start} — {draft.end} · {draft.active ? 'Activa' : 'Inactiva'}
                  </p>
                </div>
              )}
              {toggleline(
                banner ? 'Mostrar banner' : 'Autorizar promoción web',
                banner
                  ? 'Publicar únicamente durante su vigencia.'
                  : 'Autoriza difusión; no cambia su cálculo ni su estado administrativo.',
                banner ? 'active' : 'web',
                banner ? draft.active : draft.web,
                !banner &&
                  !draft.web &&
                  (!draft.active || (draft.scope === 'multiple' && !draft.scopeAvailable)),
              )}
              {banner
                ? note('Solo destinos internos. No se admiten enlaces o imágenes arbitrarias.')
                : note(
                    'La creación y edición de cupones permanece en Promociones de Inventory Manager. La tienda no aplica descuentos en esta versión.',
                  )}
            </div>
          </section>
        </div>
        <div className="stack">
          <section className="panel">
            {section('Vista previa', 'Fecha comercial: ' + day)}
            <div className="formbody">
              {banner ? (
                <div className="banner">
                  <div>
                    <small>S-MART LIVING</small>
                    <h2>{draft.title || 'Título'}</h2>
                    <p>{draft.subtitle}</p>
                  </div>
                  {draft.asset ? image(draft.asset, '') : ''}
                </div>
              ) : (
                <div className="banner">
                  <div>
                    <small>PROMOCIÓN</small>
                    <h2>{draft.title}</h2>
                    <p>
                      {draft.code} ·{' '}
                      {draft.kind === 'percent' ? draft.value + '%' : money(draft.value * 100)}
                    </p>
                  </div>
                </div>
              )}
              <div>
                {badge(
                  campaignStatus(draft, banner),
                  campaignStatus(draft, banner) === 'Vigente' ? 'good' : '',
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    );
  }
  function renderPreview() {
    const published = state.products.filter(visible).sort((a, b) => a.order - b.order),
      featured = published.filter((p) => p.featured),
      banners = state.banners.filter((b) => campaignStatus(b, true) === 'Vigente'),
      promos = state.promos.filter((o) => campaignStatus(o, false) === 'Vigente');
    const cards = (arr: Product[]) =>
      arr.map((p) => (
        <Fragment key={p.id}>
          <article className="panel preview-card">
            {image(cover(p), '', p.model)}
            <h3>{p.brand + ' ' + p.model}</h3>
            <p className="small muted">{p.category}</p>
            {webVariants(p).map((v) => (
              <Fragment key={v.id}>
                <div className="variant">
                  <div>
                    <b>{v.name}</b>
                    <div className="small muted">{v.stock ? 'Disponible' : 'Agotado'}</div>
                  </div>
                  <span className="price">{money(gross(v.base, taxBasisPoints))}</span>
                </div>
              </Fragment>
            ))}
          </article>
        </Fragment>
      ));
    return (
      <div className="stack">
        {note(
          <>
            <b>Vista comercial de control.</b> Proyección de lo visible al cliente. No sustituye ni
            rediseña Homepage aprobada.
          </>,
        )}
        {banners.map((b) => (
          <Fragment key={b.id}>
            <div className="banner">
              <div>
                <small>{b.slot.toUpperCase()}</small>
                <h2>{b.title}</h2>
                <p>{b.subtitle}</p>
              </div>
              {b.asset ? image(b.asset, '') : ''}
            </div>
          </Fragment>
        ))}
        <h2>Destacados ({featured.length})</h2>
        <div className="preview-grid">
          {featured.length ? cards(featured) : <p className="muted">Sin destacados</p>}
        </div>
        <h2>Catálogo publicado ({published.length})</h2>
        <div className="preview-grid">
          {published.length ? cards(published) : <p className="muted">Catálogo vacío</p>}
        </div>
        <h2>Promociones web vigentes ({promos.length})</h2>
        {promos.length ? (
          promos.map((o) => (
            <Fragment key={o.id}>
              <div className="panel section">
                <div>
                  <b>{o.title}</b>
                  <p className="muted">{o.code} · Difusión solamente</p>
                </div>
                {badge('Vigente', 'good')}
              </div>
            </Fragment>
          ))
        ) : (
          <p className="muted">No hay promociones autorizadas vigentes.</p>
        )}
      </div>
    );
  }
  return render();
}
