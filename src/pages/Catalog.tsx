import { useMemo, useState, type FormEvent } from 'react';
import {
  Archive,
  ArrowDownToLine,
  ArrowUpRight,
  Plus,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useRetail } from '../state/useRetail';
import { useOperation } from '../state/useOperation';
import type { Product, Variant } from '../lib/contracts';
import {
  categoryLabels,
  categoryName,
  dateTime,
  downloadCsv,
  integer,
  matches,
  money,
} from '../lib/format';
import {
  EmptyState,
  ErrorNotice,
  Field,
  Modal,
  PageHeader,
  SearchInput,
  StatCard,
} from '../components/ui';
import { ProductImage } from '../components/ProductImage';
import { ProductImagesEditor } from '../components/ProductImagesEditor';

interface VariantDraft {
  id?: string;
  name: string;
  sku: string;
  barcode: string;
  cost: number;
  price: number;
  min_stock: number;
  reorder_target: number;
  opening_quantity?: number;
  active: boolean;
}
const newVariant = (): VariantDraft => ({
  name: 'Estándar',
  sku: '',
  barcode: '',
  cost: 0,
  price: 0,
  min_stock: 3,
  reorder_target: 10,
  opening_quantity: 0,
  active: true,
});

function ProductEditor({ product, onClose }: { product?: Product; onClose: () => void }) {
  const { data, notify } = useRetail();
  const { run, busy, error } = useOperation();
  const [brand, setBrand] = useState(product?.brand ?? '');
  const [model, setModel] = useState(product?.model ?? '');
  const [category, setCategory] = useState(product?.category ?? 'tv');
  const [description, setDescription] = useState(product?.description ?? '');
  const [warranty, setWarranty] = useState(product?.warranty_months ?? 12);
  const [images, setImages] = useState<string[]>(() => product?.images ?? []);
  const [uploading, setUploading] = useState(false);
  const [openedVersion] = useState(product?.updated_at);
  const [expectedVariants] = useState(() =>
    product
      ? data.variants
          .filter((variant) => variant.product_id === product.id)
          .map((variant) => ({ id: variant.id, expected_updated_at: variant.updated_at }))
      : [],
  );
  const [variants, setVariants] = useState<VariantDraft[]>(() =>
    product
      ? data.variants
          .filter((v) => v.product_id === product.id)
          .map((v) => ({ ...v, cost: v.cost ?? 0, barcode: v.barcode ?? '' }))
      : [newVariant()],
  );
  const [validation, setValidation] = useState('');
  const setVariant = (index: number, patch: Partial<VariantDraft>) =>
    setVariants((rows) => rows.map((v, i) => (i === index ? { ...v, ...patch } : v)));
  async function save(event: FormEvent) {
    event.preventDefault();
    setValidation('');
    if (uploading) return;
    const urls = images;
    if (variants.some((v) => v.reorder_target < v.min_stock)) {
      setValidation('El objetivo de reposición debe ser igual o mayor al mínimo.');
      return;
    }
    try {
      await run('save_product', {
        id: product?.id,
        ...(product
          ? { expected_updated_at: openedVersion, expected_variants: expectedVariants }
          : {}),
        category,
        brand: brand.trim(),
        model: model.trim(),
        description: description.trim(),
        warranty_months: warranty,
        images: urls,
        variants: variants.map((v) => ({
          ...v,
          name: v.name.trim(),
          sku: v.sku.trim().toUpperCase(),
          barcode: v.barcode.trim(),
        })),
      });
      notify(
        product ? 'Producto actualizado.' : 'Producto creado e inventario inicial registrado.',
      );
      onClose();
    } catch {
      /* El formulario conserva los datos. */
    }
  }
  return (
    <Modal
      title={product ? 'Editar producto' : 'Agregar producto'}
      onClose={() => {
        if (!busy && !uploading) onClose();
      }}
      wide
    >
      <form onSubmit={save} className="stack">
        <div className="form-grid">
          <Field label="Marca">
            <input
              required
              maxLength={100}
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
            />
          </Field>
          <Field label="Modelo">
            <input
              required
              maxLength={160}
              value={model}
              onChange={(e) => setModel(e.target.value)}
            />
          </Field>
          <Field label="Categoría">
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {Object.entries(categoryLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Garantía (meses)" hint="0 significa que no incluye garantía comercial.">
            <input
              type="number"
              required
              min={0}
              max={120}
              step={1}
              value={Number.isFinite(warranty) ? warranty : ''}
              onChange={(e) => setWarranty(e.target.valueAsNumber)}
            />
          </Field>
        </div>
        <Field label="Descripción">
          <textarea
            maxLength={2000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <div className="section-heading">
          <div>
            <h3>Variantes y precios</h3>
            <p>Un SKU por combinación de tamaño, capacidad o color.</p>
          </div>
          <button
            type="button"
            className="button secondary"
            onClick={() => setVariants([...variants, { ...newVariant(), name: '' }])}
          >
            <Plus size={16} /> Añadir variante
          </button>
        </div>
        {variants.map((variant, index) => (
          <fieldset className="variant-editor" key={variant.id ?? `new-${index}`}>
            <legend>Variante {index + 1}</legend>
            <div className="form-grid cols-3">
              <Field label="Nombre">
                <input
                  required
                  maxLength={100}
                  value={variant.name}
                  onChange={(e) => setVariant(index, { name: e.target.value })}
                />
              </Field>
              <Field label="SKU">
                <input
                  required
                  maxLength={80}
                  value={variant.sku}
                  onChange={(e) => setVariant(index, { sku: e.target.value })}
                />
              </Field>
              <Field label="Código de barras">
                <input
                  maxLength={80}
                  value={variant.barcode}
                  onChange={(e) => setVariant(index, { barcode: e.target.value })}
                />
              </Field>
              <Field label="Costo (RD$)">
                <input
                  required
                  type="number"
                  min={0}
                  max={99999999}
                  step="0.01"
                  value={Number.isFinite(variant.cost) ? variant.cost : ''}
                  onChange={(e) => setVariant(index, { cost: e.target.valueAsNumber })}
                />
              </Field>
              <Field label="Precio de venta (RD$)">
                <input
                  required
                  type="number"
                  min={0}
                  max={99999999}
                  step="0.01"
                  value={Number.isFinite(variant.price) ? variant.price : ''}
                  onChange={(e) => setVariant(index, { price: e.target.valueAsNumber })}
                />
              </Field>
              <Field label="Stock mínimo">
                <input
                  required
                  type="number"
                  min={0}
                  max={1000000}
                  step={1}
                  value={Number.isFinite(variant.min_stock) ? variant.min_stock : ''}
                  onChange={(e) => setVariant(index, { min_stock: e.target.valueAsNumber })}
                />
              </Field>
              <Field label="Objetivo de reposición">
                <input
                  required
                  type="number"
                  min={0}
                  max={1000000}
                  step={1}
                  value={Number.isFinite(variant.reorder_target) ? variant.reorder_target : ''}
                  onChange={(e) => setVariant(index, { reorder_target: e.target.valueAsNumber })}
                />
              </Field>
              {!variant.id && (
                <Field label="Existencias iniciales">
                  <input
                    required
                    type="number"
                    min={0}
                    max={1000000}
                    step={1}
                    value={
                      Number.isFinite(variant.opening_quantity) ? variant.opening_quantity : ''
                    }
                    onChange={(e) =>
                      setVariant(index, { opening_quantity: e.target.valueAsNumber })
                    }
                  />
                </Field>
              )}
            </div>
            {variants.length > 1 && (
              <button
                className="button ghost danger-text"
                type="button"
                onClick={() => setVariants(variants.filter((_, i) => index !== i))}
              >
                <Trash2 size={15} /> Quitar variante
              </button>
            )}
          </fieldset>
        ))}
        <ProductImagesEditor
          productId={product?.id}
          images={images}
          onChange={setImages}
          disabled={busy}
          onBusyChange={setUploading}
        />
        <ErrorNotice message={validation || error} />
        <div className="modal-footer">
          <button
            className="button secondary"
            type="button"
            disabled={busy || uploading}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button className="button primary" disabled={busy || uploading}>
            {busy ? 'Guardando…' : 'Guardar producto'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function StockEditor({ variant, onClose }: { variant: Variant; onClose: () => void }) {
  const { data, notify } = useRetail();
  const { run, busy, error } = useOperation();
  const [bucket, setBucket] = useState<'available' | 'quarantine'>('available');
  const stock = data.stocks.find((s) => s.variant_id === variant.id);
  const [openingStock] = useState(() => ({
    available: stock?.available ?? 0,
    quarantine: stock?.quarantine ?? 0,
  }));
  const current = openingStock[bucket];
  const [counted, setCounted] = useState(current);
  const [reason, setReason] = useState('');
  async function save(event: FormEvent) {
    event.preventDefault();
    if (counted === current) return;
    try {
      await run('adjust_stock', {
        variant_id: variant.id,
        quantity: counted - current,
        expected_quantity: current,
        bucket,
        reason: reason.trim(),
      });
      notify('Ajuste registrado en el historial de movimientos.');
      onClose();
    } catch {
      /* Mantener intención para reintento. */
    }
  }
  return (
    <Modal
      title={`Ajustar existencias · ${variant.sku}`}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form onSubmit={save} className="stack">
        <p>
          Registra el conteo físico de <strong>{variant.name}</strong>. El ajuste quedará asociado a
          tu usuario.
        </p>
        <Field label="Tipo de existencias">
          <select
            value={bucket}
            onChange={(e) => {
              const b = e.target.value as 'available' | 'quarantine';
              setBucket(b);
              setCounted(openingStock[b]);
            }}
          >
            <option value="available">Disponibles para venta</option>
            <option value="quarantine">En revisión / no vendibles</option>
          </select>
        </Field>
        <div className="adjustment-preview">
          <span>
            Registradas<strong>{current}</strong>
          </span>
          <ArrowUpRight />
          <span>
            Contadas<strong>{Number.isFinite(counted) ? counted : '—'}</strong>
          </span>
        </div>
        <Field label="Cantidad contada">
          <input
            type="number"
            required
            min={0}
            max={1000000}
            step={1}
            value={Number.isFinite(counted) ? counted : ''}
            onChange={(e) => setCounted(e.target.valueAsNumber)}
          />
        </Field>
        <Field label="Motivo del ajuste">
          <textarea
            required
            minLength={5}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ej. Conteo físico de cierre; se encontró una unidad adicional."
          />
        </Field>
        <ErrorNotice message={error} />
        <div className="modal-footer">
          <button type="button" className="button secondary" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <button className="button primary" disabled={busy || current === counted}>
            {busy ? 'Registrando…' : 'Confirmar ajuste'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function CatalogPage() {
  const { data, notify } = useRetail();
  const { run, busy, error } = useOperation();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const status = params.get('estado') ?? 'active';
  const [editor, setEditor] = useState<Product | 'new' | null>(null);
  const [adjustment, setAdjustment] = useState<Variant | null>(null);
  const [detail, setDetail] = useState<Variant | null>(null);
  const [archiving, setArchiving] = useState<Product | null>(null);
  const rows = useMemo(
    () =>
      data.variants
        .map((variant) => ({
          variant,
          product: data.products.find((p) => p.id === variant.product_id),
          stock: data.stocks.find((s) => s.variant_id === variant.id),
        }))
        .filter((row): row is typeof row & { product: Product } => Boolean(row.product)),
    [data],
  );
  const activeRows = rows.filter((r) => r.product.active && r.variant.active);
  const lowRows = activeRows.filter((r) => (r.stock?.available ?? 0) <= r.variant.min_stock);
  const visible = rows.filter(
    ({ product, variant, stock }) =>
      (status === 'archived'
        ? !product.active || !variant.active
        : product.active && variant.active) &&
      (status !== 'low' || (stock?.available ?? 0) <= variant.min_stock) &&
      (status !== 'unpriced' || variant.price === 0) &&
      (!category || product.category === category) &&
      matches(query, product.brand, product.model, variant.sku, variant.name, variant.barcode),
  );
  function exportRows() {
    downloadCsv('inventario-smartliving.csv', [
      [
        'SKU',
        'Producto',
        'Variante',
        'Categoría',
        'Disponibles',
        'En revisión',
        'Mínimo',
        'Precio RD$',
        ...(data.permissions.view_costs ? ['Costo RD$'] : []),
      ],
      ...visible.map(({ product, variant, stock }) => [
        variant.sku,
        `${product.brand} ${product.model}`,
        variant.name,
        categoryName(product.category),
        stock?.available ?? 0,
        stock?.quarantine ?? 0,
        variant.min_stock,
        variant.price,
        ...(data.permissions.view_costs ? [variant.cost ?? 0] : []),
      ]),
    ]);
  }
  async function archive() {
    if (!archiving) return;
    try {
      await run('archive_product', {
        id: archiving.id,
        active: !archiving.active,
        expected_updated_at: archiving.updated_at,
      });
      notify(
        archiving.active ? 'Producto archivado. Su historial se conserva.' : 'Producto reactivado.',
      );
      setArchiving(null);
    } catch {
      /* Mostrar error. */
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="CATÁLOGO Y EXISTENCIAS"
        title="Inventario"
        description="Cada producto, cada variante y cada movimiento. Todo en su lugar."
        actions={
          <>
            <button className="button secondary" onClick={exportRows}>
              <ArrowDownToLine size={17} /> Exportar
            </button>
            {data.permissions.manage_catalog && (
              <button className="button primary" onClick={() => setEditor('new')}>
                <Plus size={18} /> Agregar producto
              </button>
            )}
          </>
        }
      />
      <div className="stats-grid">
        <StatCard
          label="Productos activos"
          value={integer(data.products.filter((p) => p.active).length)}
          hint={`${activeRows.length} ${activeRows.length === 1 ? 'variante' : 'variantes'} en el catálogo`}
        />
        <StatCard
          label="Unidades disponibles"
          value={integer(activeRows.reduce((sum, r) => sum + (r.stock?.available ?? 0), 0))}
          hint="Listas para vender"
        />
        <StatCard
          label="Necesitan reposición"
          value={integer(lowRows.length)}
          hint="En el mínimo o por debajo"
          tone="warning"
        />
        {data.permissions.view_costs && (
          <StatCard
            label="Valor del inventario"
            value={money(
              activeRows.reduce(
                (sum, r) => sum + (r.stock?.available ?? 0) * (r.variant.cost ?? 0),
                0,
              ),
            )}
            hint="Existencias disponibles a costo"
          />
        )}
      </div>
      <section className="panel">
        <div className="toolbar table-toolbar">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Buscar por marca, modelo, SKU o código…"
          />
          <select
            aria-label="Filtrar por categoría"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">Todas las categorías</option>
            {Array.from(new Set(rows.map((r) => r.product.category))).map((c) => (
              <option key={c} value={c}>
                {categoryName(c)}
              </option>
            ))}
          </select>
          <select
            aria-label="Filtrar por estado del catálogo"
            value={status}
            onChange={(e) =>
              setParams(e.target.value === 'active' ? {} : { estado: e.target.value })
            }
          >
            <option value="active">Productos activos</option>
            <option value="low">Necesitan reposición</option>
            <option value="unpriced">Precio pendiente</option>
            <option value="archived">Archivados</option>
          </select>
        </div>
        <div className="table-meta">
          <span>
            {visible.length} {visible.length === 1 ? 'variante' : 'variantes'}
          </span>
          <span>Precios en pesos dominicanos</span>
        </div>
        {visible.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Producto / variante</th>
                  <th>SKU</th>
                  <th>Disponibles</th>
                  <th>Precio</th>
                  {data.permissions.view_costs && <th>Margen</th>}
                  <th>
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map(({ product, variant, stock }) => (
                  <tr key={variant.id}>
                    <td>
                      <button className="product-cell" onClick={() => setDetail(variant)}>
                        <ProductImage
                          productId={product.id}
                          source={product.images[0]}
                          alt=""
                          className="product-thumbnail"
                        />
                        <span>
                          <strong>
                            {product.brand} {product.model}
                          </strong>
                          <small>
                            {variant.name} · {categoryName(product.category)}
                          </small>
                        </span>
                      </button>
                    </td>
                    <td>
                      <code>{variant.sku}</code>
                    </td>
                    <td>
                      <div className="stock-cell">
                        <strong>{stock?.available ?? 0}</strong>
                        <span
                          className={`badge ${(stock?.available ?? 0) === 0 ? 'danger' : (stock?.available ?? 0) <= variant.min_stock ? 'warning' : 'success'}`}
                        >
                          {(stock?.available ?? 0) === 0
                            ? 'Agotado'
                            : (stock?.available ?? 0) <= variant.min_stock
                              ? 'Stock bajo'
                              : 'Disponible'}
                        </span>
                      </div>
                    </td>
                    <td className="numeric">
                      {variant.price > 0 ? (
                        money(variant.price)
                      ) : (
                        <span className="badge warning">Precio pendiente</span>
                      )}
                    </td>
                    {data.permissions.view_costs && (
                      <td>
                        {variant.price > 0
                          ? `${(((variant.price - (variant.cost ?? 0)) / variant.price) * 100).toFixed(1)} %`
                          : '—'}
                      </td>
                    )}
                    <td>
                      {data.permissions.manage_catalog && (
                        <div className="row-actions">
                          <button
                            className="icon-button"
                            aria-label={`Ajustar ${variant.sku}`}
                            onClick={() => setAdjustment(variant)}
                          >
                            <SlidersHorizontal size={17} />
                          </button>
                          <button className="button ghost" onClick={() => setEditor(product)}>
                            Editar
                          </button>
                          <button
                            className="icon-button"
                            aria-label={`${product.active ? 'Archivar' : 'Reactivar'} ${product.model}`}
                            onClick={() => setArchiving(product)}
                          >
                            <Archive size={16} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title={
              query || category || status !== 'active'
                ? 'No encontramos productos'
                : 'Tu inventario empieza aquí'
            }
            description={
              query || category || status !== 'active'
                ? 'Prueba otra búsqueda o cambia los filtros.'
                : 'Agrega tu primer producto y registra sus existencias iniciales.'
            }
          />
        )}
      </section>
      {editor && (
        <ProductEditor
          product={editor === 'new' ? undefined : editor}
          onClose={() => setEditor(null)}
        />
      )}
      {adjustment && <StockEditor variant={adjustment} onClose={() => setAdjustment(null)} />}
      {detail && (
        <Modal title={`${detail.sku} · ${detail.name}`} onClose={() => setDetail(null)} wide>
          <div className="stats-grid">
            <StatCard
              label="Precio"
              value={detail.price > 0 ? money(detail.price) : 'Precio pendiente'}
            />
            <StatCard label="Stock mínimo" value={detail.min_stock} />
            <StatCard label="Objetivo" value={detail.reorder_target} />
          </div>
          <h3>Historial de movimientos</h3>
          {data.movements.filter((m) => m.variant_id === detail.id).length ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Motivo</th>
                    <th>Cambio</th>
                    <th>Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {data.movements
                    .filter((m) => m.variant_id === detail.id)
                    .map((m) => (
                      <tr key={m.id}>
                        <td>{dateTime(m.created_at)}</td>
                        <td>
                          {m.reason}
                          <small>{m.bucket === 'quarantine' ? 'En revisión' : 'Disponible'}</small>
                        </td>
                        <td>
                          {m.quantity > 0 ? '+' : ''}
                          {m.quantity}
                        </td>
                        <td>{m.after_quantity}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="Sin movimientos"
              description="Las próximas operaciones aparecerán aquí con su fecha y motivo."
            />
          )}
        </Modal>
      )}
      {archiving && (
        <Modal
          title={archiving.active ? 'Archivar producto' : 'Reactivar producto'}
          onClose={() => {
            if (!busy) setArchiving(null);
          }}
        >
          <p>
            {archiving.active
              ? 'El producto dejará de aparecer en nuevas ventas. Conservaremos todos sus documentos e historial. Debe estar sin existencias ni compras pendientes.'
              : 'El producto volverá a estar disponible en el catálogo.'}
          </p>
          <ErrorNotice message={error} />
          <div className="modal-footer">
            <button className="button secondary" disabled={busy} onClick={() => setArchiving(null)}>
              Volver
            </button>
            <button className="button primary" disabled={busy} onClick={() => void archive()}>
              {busy ? 'Guardando…' : archiving.active ? 'Archivar' : 'Reactivar'}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
