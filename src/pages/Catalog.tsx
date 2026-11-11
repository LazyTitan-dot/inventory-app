import { useMemo, useState, type FormEvent } from 'react';
import {
  Archive,
  ArrowDownToLine,
  ArrowUpRight,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Trash2,
  ScanLine,
  Printer,
  Barcode,
  ShoppingBag,
  Truck,
  Package,
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
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
import { generateSku, MAX_SKU_LENGTH, normalizeSku, validateSkus } from '../lib/sku';
import { calculateUnitPrice, isValidCatalogAmount, MAX_CATALOG_PRICE } from '../lib/pricing';
import { BarcodeScanner } from '../components/BarcodeScanner';
import {
  barcodeSvg,
  downloadBarcodeSvg,
  generateInternalBarcode,
  printBarcodeLabel,
  validateBarcodes,
} from '../lib/barcode';
import {
  pendingPurchaseUnits,
  replenishmentQuantity,
  stockHealth,
  stockHealthLabels,
} from '../lib/catalog';
import './catalog.css';

interface VariantDraft {
  id?: string;
  draftId: string;
  autoSku: boolean;
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
function newVariant(brand: string, model: string, occupied: string[]): VariantDraft {
  const draftId = crypto.randomUUID();
  return {
    draftId,
    autoSku: true,
    name: 'Estándar',
    sku: generateSku({ brand, model, variant: 'Estándar', seed: draftId, occupied }),
    barcode: generateInternalBarcode(draftId),
    cost: 0,
    price: 0,
    min_stock: 3,
    reorder_target: 10,
    opening_quantity: 0,
    active: true,
  };
}

const taxRateLabel = (rate: number) =>
  `${new Intl.NumberFormat('es-DO', { maximumFractionDigits: 2 }).format(rate)} %`;

function PriceDetails({ price, taxRate }: { price: number; taxRate: number }) {
  const amounts = calculateUnitPrice(price, taxRate);
  if (!amounts)
    return (
      <p className="catalog-price-notice">
        {price === 0
          ? 'Precio pendiente: define el precio sin ITBIS para habilitar la venta.'
          : 'Ingresa un precio válido con un máximo de dos decimales.'}
      </p>
    );
  return (
    <div className="catalog-price-preview">
      <dl>
        <div>
          <dt>Precio sin ITBIS</dt>
          <dd>{money(amounts.base)}</dd>
        </div>
        <div>
          <dt>ITBIS ({taxRateLabel(taxRate)})</dt>
          <dd>{money(amounts.tax)}</dd>
        </div>
        <div>
          <dt>Precio con ITBIS</dt>
          <dd>{money(amounts.total)}</dd>
        </div>
      </dl>
      <small>
        Por unidad, antes de descuentos. Se aplica la tasa configurada de {taxRateLabel(taxRate)}.
      </small>
    </div>
  );
}

function ProductEditor({
  product,
  onClose,
  onSaved,
}: {
  product?: Product;
  onClose: () => void;
  onSaved?: (barcode: string) => void;
}) {
  const { data, notify } = useRetail();
  const { run, busy, error } = useOperation();
  const [brand, setBrand] = useState(product?.brand ?? '');
  const [model, setModel] = useState(product?.model ?? '');
  const [category, setCategory] = useState(product?.category ?? 'tv');
  const [description, setDescription] = useState(product?.description ?? '');
  const [warranty, setWarranty] = useState(product?.warranty_months ?? 12);
  const [images, setImages] = useState<string[]>(() => product?.images ?? []);
  const [uploading, setUploading] = useState(false);
  const [scannerIndex, setScannerIndex] = useState<number | null>(null);
  const [openLabel, setOpenLabel] = useState(false);
  const [openedVersion] = useState(product?.updated_at);
  const [catalogVariants] = useState(() => data.variants);
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
          .map((v) => ({
            ...v,
            draftId: v.id,
            autoSku: false,
            cost: v.cost ?? 0,
            barcode: v.barcode ?? '',
          }))
      : [
          newVariant(
            brand,
            model,
            catalogVariants.map((v) => v.sku),
          ),
        ],
  );
  const [validation, setValidation] = useState('');
  function suggestedSku(
    row: VariantDraft,
    rows: VariantDraft[],
    nextBrand = brand,
    nextModel = model,
  ) {
    return generateSku({
      brand: nextBrand,
      model: nextModel,
      variant: row.name,
      seed: row.draftId,
      occupied: [
        ...catalogVariants.filter((v) => v.id !== row.id).map((v) => v.sku),
        ...rows.filter((v) => v.draftId !== row.draftId).map((v) => v.sku),
      ],
    });
  }
  const setVariant = (index: number, patch: Partial<VariantDraft>) =>
    setVariants((rows) =>
      rows.map((v, i) => {
        if (i !== index) return v;
        const next = { ...v, ...patch };
        if (patch.name !== undefined && next.autoSku) next.sku = suggestedSku(next, rows);
        return next;
      }),
    );
  function changeIdentity(nextBrand: string, nextModel: string) {
    setBrand(nextBrand);
    setModel(nextModel);
    setVariants((rows) => {
      const next = [...rows];
      for (let index = 0; index < next.length; index++) {
        const row = next[index];
        if (row?.autoSku)
          next[index] = { ...row, sku: suggestedSku(row, next, nextBrand, nextModel) };
      }
      return next;
    });
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setValidation('');
    if (uploading) return;
    const urls = images;
    const prepared = variants.map((row) =>
      !row.id && !row.barcode.trim()
        ? {
            ...row,
            barcode: generateInternalBarcode(row.draftId, [
              ...catalogVariants.map((item) => item.barcode ?? ''),
              ...variants.map((item) => item.barcode),
            ]),
          }
        : row,
    );
    const skuError =
      validateSkus(prepared, catalogVariants) || validateBarcodes(prepared, catalogVariants);
    if (skuError) {
      setValidation(skuError);
      return;
    }
    if (variants.some((v) => !isValidCatalogAmount(v.price) || !isValidCatalogAmount(v.cost))) {
      setValidation(
        `El costo y el precio deben estar entre 0 y ${money(MAX_CATALOG_PRICE)}, con un máximo de dos decimales.`,
      );
      return;
    }
    if (
      !Number.isInteger(warranty) ||
      warranty < 0 ||
      warranty > 120 ||
      variants.some((v) =>
        [v.min_stock, v.reorder_target, ...(!v.id ? [v.opening_quantity] : [])].some(
          (value) => value === undefined || !Number.isInteger(value) || value < 0 || value > 999999,
        ),
      )
    ) {
      setValidation(
        'Las existencias deben ser cantidades enteras entre 0 y 999,999. La garantía debe estar entre 0 y 120 meses.',
      );
      return;
    }
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
        variants: prepared.map((v) => ({
          id: v.id,
          name: v.name.trim(),
          sku: normalizeSku(v.sku),
          barcode: v.barcode.trim(),
          cost: v.cost,
          price: v.price,
          min_stock: v.min_stock,
          reorder_target: v.reorder_target,
          opening_quantity: v.opening_quantity,
          active: v.active,
        })),
      });
      notify(
        product ? 'Producto actualizado.' : 'Producto creado e inventario inicial registrado.',
      );
      onClose();
      if (openLabel && prepared[0]?.barcode) onSaved?.(prepared[0].barcode);
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
              disabled={busy}
              value={brand}
              onChange={(e) => changeIdentity(e.target.value, model)}
            />
          </Field>
          <Field label="Modelo">
            <input
              required
              maxLength={160}
              disabled={busy}
              value={model}
              onChange={(e) => changeIdentity(brand, e.target.value)}
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
            <p>El SKU se genera para las variantes nuevas. Puedes editarlo manualmente.</p>
          </div>
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() => {
              const variant = newVariant(brand, model, [
                ...catalogVariants.map((v) => v.sku),
                ...variants.map((v) => v.sku),
              ]);
              setVariants((rows) => [...rows, variant]);
            }}
          >
            <Plus size={16} /> Añadir variante
          </button>
        </div>
        {variants.map((variant, index) => (
          <fieldset className="variant-editor" key={variant.draftId} disabled={busy}>
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
              <div className="catalog-sku-control">
                <Field
                  label="SKU"
                  hint={
                    variant.autoSku
                      ? 'Automático según marca, modelo y variante.'
                      : 'SKU manual; se conserva al cambiar el producto.'
                  }
                >
                  <input
                    required
                    maxLength={MAX_SKU_LENGTH}
                    value={variant.sku}
                    onChange={(e) => setVariant(index, { sku: e.target.value, autoSku: false })}
                  />
                </Field>
                <button
                  type="button"
                  className="button secondary"
                  aria-label={`Generar SKU para la variante ${index + 1}`}
                  onClick={() =>
                    setVariant(index, {
                      sku: suggestedSku(variant, variants),
                      autoSku: !variant.id,
                    })
                  }
                >
                  <RefreshCw size={14} /> Generar SKU
                </button>
              </div>
              <div className="catalog-barcode-control">
                <Field
                  label="Código de barras"
                  hint="Código del fabricante o identificador interno. Los lectores USB/Bluetooth pueden escribir aquí."
                >
                  <input
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    maxLength={80}
                    value={variant.barcode}
                    onChange={(e) => setVariant(index, { barcode: e.target.value })}
                  />
                </Field>
                <div className="row-actions">
                  <button
                    type="button"
                    className="button secondary"
                    aria-label={`Escanear código para la variante ${index + 1}`}
                    onClick={() => setScannerIndex(index)}
                  >
                    <ScanLine size={14} /> Escanear
                  </button>
                  <button
                    type="button"
                    className="button secondary"
                    aria-label={`Generar código para la variante ${index + 1}`}
                    onClick={() =>
                      setVariant(index, {
                        barcode: generateInternalBarcode(variant.draftId, [
                          ...catalogVariants
                            .filter((row) => row.id !== variant.id)
                            .map((row) => row.barcode ?? ''),
                          ...variants
                            .filter((row) => row.draftId !== variant.draftId)
                            .map((row) => row.barcode),
                        ]),
                      })
                    }
                  >
                    <Barcode size={14} /> Generar
                  </button>
                </div>
                <small>El código interno no sustituye un UPC/EAN oficial.</small>
              </div>
              <Field label="Costo (RD$)">
                <input
                  required
                  type="number"
                  min={0}
                  max={MAX_CATALOG_PRICE}
                  step="0.01"
                  value={Number.isFinite(variant.cost) ? variant.cost : ''}
                  onChange={(e) => setVariant(index, { cost: e.target.valueAsNumber })}
                />
              </Field>
              <Field
                label="Precio sin ITBIS (RD$)"
                hint="0 indica precio pendiente; no habilita ventas gratis."
              >
                <input
                  required
                  type="number"
                  min={0}
                  max={MAX_CATALOG_PRICE}
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
                  max={999999}
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
                  max={999999}
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
                    max={999999}
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
            <PriceDetails price={variant.price} taxRate={data.settings.tax_rate} />
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
        <label className="catalog-label-check">
          <input
            type="checkbox"
            checked={openLabel}
            onChange={(event) => setOpenLabel(event.target.checked)}
          />{' '}
          Abrir la etiqueta de la primera variante al guardar
        </label>
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
      {scannerIndex !== null && (
        <BarcodeScanner
          title="Código de la variante"
          onDetected={(value) => setVariant(scannerIndex, { barcode: value })}
          onClose={() => setScannerIndex(null)}
        />
      )}
    </Modal>
  );
}

function StockEditor({
  variant,
  onClose,
  embedded = false,
}: {
  variant: Variant;
  onClose: () => void;
  embedded?: boolean;
}) {
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
  const form = (
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
  );
  return embedded ? (
    form
  ) : (
    <Modal
      title={`Ajustar existencias · ${variant.sku}`}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      {form}
    </Modal>
  );
}

function InventoryDetails({
  variant,
  onClose,
  onEdit,
}: {
  variant: Variant;
  onClose: () => void;
  onEdit: (product: Product) => void;
}) {
  const { data } = useRetail();
  const [tab, setTab] = useState<'summary' | 'history' | 'adjust'>('summary');
  const [labelError, setLabelError] = useState('');
  const product = data.products.find((row) => row.id === variant.product_id);
  const stock = data.stocks.find((row) => row.variant_id === variant.id);
  if (!product) return null;
  const available = stock?.available ?? 0;
  const health = stockHealth(available, variant.min_stock);
  const incoming = data.permissions.purchase ? pendingPurchaseUnits(data, variant.id) : 0;
  const suggested = replenishmentQuantity(variant.reorder_target, available, incoming);
  const movements = data.movements
    .filter((row) => row.variant_id === variant.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const printable = variant.barcode ? barcodeSvg(variant.barcode) : null;
  const active = product.active && variant.active;
  return (
    <Modal title={`${variant.sku} · ${variant.name}`} onClose={onClose} variant="drawer">
      <div className="catalog-detail">
        <div className="catalog-detail-hero">
          <ProductImage
            productId={product.id}
            source={product.images[0]}
            alt=""
            className="catalog-detail-image"
          />
          <div>
            <span className="eyebrow">FICHA DE INVENTARIO</span>
            <h3>
              {product.brand} {product.model}
            </h3>
            <p>
              {variant.name} · {categoryName(product.category)}
            </p>
            <span
              className={`badge ${health === 'out' ? 'danger' : health === 'low' ? 'warning' : 'success'}`}
            >
              {active ? stockHealthLabels[health] : 'Archivado'}
            </span>
          </div>
        </div>
        <div className="catalog-segments" role="group" aria-label="Secciones del producto">
          <button type="button" aria-pressed={tab === 'summary'} onClick={() => setTab('summary')}>
            Ficha
          </button>
          <button type="button" aria-pressed={tab === 'history'} onClick={() => setTab('history')}>
            Movimientos <span>{movements.length}</span>
          </button>
          {data.permissions.manage_catalog && (
            <button type="button" aria-pressed={tab === 'adjust'} onClick={() => setTab('adjust')}>
              Ajustar stock
            </button>
          )}
        </div>
        {tab === 'summary' && (
          <>
            <section className="catalog-stock-overview">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">EXISTENCIAS DISPONIBLES</span>
                  <strong className="catalog-stock-number">
                    {integer(available)} <small>unidades</small>
                  </strong>
                </div>
                <Package size={30} />
              </div>
              <StockMeter
                available={available}
                target={variant.reorder_target}
                minimum={variant.min_stock}
              />
              <div className="catalog-minmax">
                <span>Mínimo {variant.min_stock}</span>
                <span>Objetivo {variant.reorder_target}</span>
              </div>
              {available <= variant.min_stock && (
                <p className="catalog-stock-alert">
                  {available === 0 ? 'Referencia agotada.' : 'Se alcanzó el nivel mínimo.'}{' '}
                  {suggested > 0
                    ? `Para llegar al objetivo, repón ${integer(suggested)} ${suggested === 1 ? 'unidad' : 'unidades'}.`
                    : data.permissions.purchase
                      ? 'Las compras en camino ya cubren el objetivo de reposición.'
                      : 'Revisa la reposición con el equipo de compras.'}
                </p>
              )}
              {data.permissions.purchase && incoming > 0 && (
                <small>{integer(incoming)} unidades pendientes en compras confirmadas.</small>
              )}
            </section>
            <dl className="catalog-facts">
              <div>
                <dt>SKU</dt>
                <dd>
                  <code>{variant.sku}</code>
                </dd>
              </div>
              <div>
                <dt>Categoría</dt>
                <dd>{categoryName(product.category)}</dd>
              </div>
              <div>
                <dt>Garantía comercial</dt>
                <dd>
                  {product.warranty_months
                    ? `${product.warranty_months} meses`
                    : 'Sin garantía comercial'}
                </dd>
              </div>
              <div>
                <dt>En revisión</dt>
                <dd>{integer(stock?.quarantine ?? 0)} unidades</dd>
              </div>
            </dl>
            {product.description && <p className="catalog-description">{product.description}</p>}
            <h3>Precio por unidad</h3>
            <PriceDetails price={variant.price} taxRate={data.settings.tax_rate} />
            {data.permissions.view_costs && (
              <dl className="catalog-facts">
                <div>
                  <dt>Costo por unidad</dt>
                  <dd>{money(variant.cost ?? 0)}</dd>
                </div>
                <div>
                  <dt>Margen bruto</dt>
                  <dd>
                    {variant.price > 0
                      ? `${(((variant.price - (variant.cost ?? 0)) / variant.price) * 100).toFixed(1)} %`
                      : 'Precio pendiente'}
                  </dd>
                </div>
              </dl>
            )}
            <h3>Identificación y etiqueta</h3>
            {variant.barcode ? (
              <section className="catalog-label-preview">
                <small>
                  {variant.barcode.startsWith('SL')
                    ? 'Código registrado · puede ser interno'
                    : 'Código registrado'}
                </small>
                {printable ? (
                  <div
                    className="catalog-label-bars"
                    dangerouslySetInnerHTML={{ __html: printable }}
                  />
                ) : (
                  <p>
                    El código se conserva, pero contiene caracteres no compatibles con etiquetas
                    Code 128B.
                  </p>
                )}
                <code>{variant.barcode}</code>
                <div className="row-actions">
                  <button
                    type="button"
                    className="button secondary"
                    disabled={!printable}
                    onClick={() =>
                      setLabelError(
                        printBarcodeLabel({
                          barcode: variant.barcode!,
                          sku: variant.sku,
                          title: `${product.brand} ${product.model} · ${variant.name}`,
                        }) ?? '',
                      )
                    }
                  >
                    <Printer size={16} /> Imprimir etiqueta
                  </button>
                  <button
                    type="button"
                    className="button secondary"
                    disabled={!printable}
                    onClick={() =>
                      setLabelError(downloadBarcodeSvg(variant.barcode!, variant.sku) ?? '')
                    }
                  >
                    <ArrowDownToLine size={16} /> Descargar SVG
                  </button>
                </div>
              </section>
            ) : (
              <div className="note-box">
                Esta variante no tiene código.{' '}
                {data.permissions.manage_catalog && (
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => onEdit(product)}
                  >
                    <Barcode size={16} /> Generar código en la ficha
                  </button>
                )}
              </div>
            )}
            <ErrorNotice message={labelError} />
            <div className="catalog-quick-actions">
              {data.permissions.purchase && active && (
                <Link
                  className="button secondary"
                  to={`/compras?nuevo=1&variante=${variant.id}&cantidad=${Math.max(1, suggested)}`}
                >
                  <Truck size={17} /> Reponer variante
                </Link>
              )}
              {data.permissions.sell && active && (
                <Link
                  className={`button primary ${available <= 0 || variant.price <= 0 ? 'catalog-link-disabled' : ''}`}
                  aria-disabled={available <= 0 || variant.price <= 0}
                  tabIndex={available <= 0 || variant.price <= 0 ? -1 : undefined}
                  onClick={(event) => {
                    if (available <= 0 || variant.price <= 0) event.preventDefault();
                  }}
                  to={`/ventas?nuevo=1&variante=${variant.id}`}
                >
                  <ShoppingBag size={17} /> Nueva venta
                </Link>
              )}
            </div>
          </>
        )}
        {tab === 'history' && (
          <>
            {movements.length ? (
              <div className="catalog-movements">
                {movements.map((movement) => (
                  <article key={movement.id}>
                    <span
                      className={`catalog-movement-value ${movement.quantity > 0 ? 'positive' : ''}`}
                    >
                      {movement.quantity > 0 ? '+' : ''}
                      {movement.quantity}
                    </span>
                    <div>
                      <strong>{movement.reason}</strong>
                      <small>
                        {dateTime(movement.created_at)} ·{' '}
                        {movement.bucket === 'quarantine' ? 'En revisión' : 'Disponible'}
                      </small>
                      <small>Saldo posterior: {integer(movement.after_quantity)}</small>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState
                title="Sin movimientos"
                description="Las próximas operaciones aparecerán aquí con su fecha y motivo."
              />
            )}
          </>
        )}
        {tab === 'adjust' && data.permissions.manage_catalog && (
          <StockEditor
            key={variant.id}
            variant={variant}
            embedded
            onClose={() => setTab('summary')}
          />
        )}
        {data.permissions.manage_catalog && (
          <div className="catalog-detail-footer">
            <button type="button" className="button secondary" onClick={() => onEdit(product)}>
              Editar ficha
            </button>
            <button type="button" className="button primary" onClick={() => setTab('adjust')}>
              <SlidersHorizontal size={16} /> Ajustar stock
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

function StockMeter({
  available,
  target,
  minimum,
}: {
  available: number;
  target: number;
  minimum: number;
}) {
  const health = stockHealth(available, minimum);
  const limit = Math.max(1, target, minimum);
  return (
    <div
      className={`catalog-stock-meter ${health}`}
      role="meter"
      aria-label="Existencias respecto al objetivo"
      aria-valuemin={0}
      aria-valuemax={Math.max(limit, available)}
      aria-valuenow={available}
      aria-valuetext={`${available} disponibles; mínimo ${minimum}; objetivo ${target}`}
    >
      <span style={{ width: `${Math.min(100, Math.max(0, (available / limit) * 100))}%` }} />
    </div>
  );
}

export function CatalogPage() {
  const { data, notify } = useRetail();
  const { run, busy, error } = useOperation();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState('name');
  const [scanner, setScanner] = useState(false);
  const status = params.get('estado') ?? 'active';
  const [editor, setEditor] = useState<Product | 'new' | null>(null);
  const [adjustment, setAdjustment] = useState<Variant | null>(null);
  const [archiving, setArchiving] = useState<Product | null>(null);
  const productMap = useMemo(
    () => new Map(data.products.map((product) => [product.id, product])),
    [data.products],
  );
  const stockMap = useMemo(
    () => new Map(data.stocks.map((stock) => [stock.variant_id, stock])),
    [data.stocks],
  );
  const rows = useMemo(
    () =>
      data.variants
        .map((variant) => ({
          variant,
          product: productMap.get(variant.product_id),
          stock: stockMap.get(variant.id),
        }))
        .filter((row): row is typeof row & { product: Product } => Boolean(row.product)),
    [data.variants, productMap, stockMap],
  );
  const activeRows = rows.filter((row) => row.product.active && row.variant.active);
  const lowRows = activeRows.filter((row) => (row.stock?.available ?? 0) <= row.variant.min_stock);
  const outRows = activeRows.filter((row) => (row.stock?.available ?? 0) === 0);
  const positiveLowRows = activeRows.filter(
    (row) => stockHealth(row.stock?.available ?? 0, row.variant.min_stock) === 'low',
  );
  const availableRows = activeRows.filter(
    (row) => stockHealth(row.stock?.available ?? 0, row.variant.min_stock) === 'available',
  );
  const detail = data.variants.find(
    (variant) =>
      variant.id === params.get('variante') ||
      Boolean(params.get('etiqueta') && variant.barcode === params.get('etiqueta')),
  );
  const activeEditor =
    editor || (params.get('nuevo') === '1' && data.permissions.manage_catalog ? 'new' : null);
  function updateParams(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    setParams(next, { replace: true });
  }
  function openDetail(variant: Variant) {
    updateParams({ variante: variant.id, etiqueta: null });
  }
  function closeDetail() {
    updateParams({ variante: null, etiqueta: null });
  }
  function closeEditor() {
    setEditor(null);
    updateParams({ nuevo: null });
  }
  function selectStatus(value: string) {
    updateParams({ estado: value === 'active' ? null : value });
  }
  const visible = rows
    .filter(({ product, variant, stock }) => {
      const available = stock?.available ?? 0;
      return (
        (status === 'archived'
          ? !product.active || !variant.active
          : product.active && variant.active) &&
        (status !== 'low' || available <= variant.min_stock) &&
        (status !== 'low_stock' || stockHealth(available, variant.min_stock) === 'low') &&
        (status !== 'out' || available === 0) &&
        (status !== 'available' || stockHealth(available, variant.min_stock) === 'available') &&
        (status !== 'unpriced' || variant.price === 0) &&
        (!category || product.category === category) &&
        matches(query, product.brand, product.model, variant.sku, variant.name, variant.barcode)
      );
    })
    .sort((a, b) =>
      sort === 'stock'
        ? (a.stock?.available ?? 0) - (b.stock?.available ?? 0) ||
          a.variant.sku.localeCompare(b.variant.sku)
        : sort === 'price'
          ? b.variant.price - a.variant.price || a.variant.sku.localeCompare(b.variant.sku)
          : `${a.product.brand} ${a.product.model} ${a.variant.name}`.localeCompare(
              `${b.product.brand} ${b.product.model} ${b.variant.name}`,
              'es',
            ),
    );
  const units = activeRows.reduce((sum, row) => sum + (row.stock?.available ?? 0), 0);
  const value = activeRows.reduce(
    (sum, row) => sum + (row.stock?.available ?? 0) * (row.variant.cost ?? 0),
    0,
  );
  const revenue = activeRows.reduce(
    (sum, row) => sum + (row.stock?.available ?? 0) * row.variant.price,
    0,
  );
  function exportRows() {
    downloadCsv('inventario-smartliving.csv', [
      [
        'SKU',
        'Código de barras',
        'Producto',
        'Variante',
        'Categoría',
        'Disponibles',
        'En revisión',
        'Mínimo',
        'Objetivo',
        'Precio sin ITBIS RD$',
        'ITBIS configurado %',
        'ITBIS por unidad RD$',
        'Precio con ITBIS RD$',
        'Estado de precio',
        ...(data.permissions.view_costs ? ['Costo RD$'] : []),
      ],
      ...visible.map(({ product, variant, stock }) => {
        const amounts = calculateUnitPrice(variant.price, data.settings.tax_rate);
        return [
          variant.sku,
          variant.barcode ?? '',
          `${product.brand} ${product.model}`,
          variant.name,
          categoryName(product.category),
          stock?.available ?? 0,
          stock?.quarantine ?? 0,
          variant.min_stock,
          variant.reorder_target,
          amounts?.base ?? '',
          data.settings.tax_rate,
          amounts?.tax ?? '',
          amounts?.total ?? '',
          amounts ? 'Definido' : 'Precio pendiente',
          ...(data.permissions.view_costs ? [variant.cost ?? 0] : []),
        ];
      }),
    ]);
  }
  function lookupBarcode(code: string) {
    const matches = data.variants.filter((variant) =>
      [variant.barcode, variant.sku].some(
        (value) =>
          value?.trim().toLocaleUpperCase('en-US') === code.trim().toLocaleUpperCase('en-US'),
      ),
    );
    if (matches.length === 1) openDetail(matches[0]!);
    else
      notify(
        matches.length
          ? 'Ese código coincide con varias referencias. Busca el SKU exacto y revisa sus códigos.'
          : 'No encontramos ese código. Revisa el valor o agrega la referencia al catálogo.',
      );
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
      /* El error se presenta en el diálogo. */
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="CATÁLOGO Y EXISTENCIAS"
        title="Inventario"
        description="Todo tu catálogo, existencias y precios. Trabaja con cada referencia sin perder el contexto."
        actions={
          <div className="catalog-header-actions">
            <button className="button secondary" onClick={() => setScanner(true)}>
              <ScanLine size={17} /> Escanear código
            </button>
            <button className="button secondary" onClick={exportRows}>
              <ArrowDownToLine size={17} /> Exportar
            </button>
            {data.permissions.manage_catalog && (
              <button className="button primary" onClick={() => setEditor('new')}>
                <Plus size={18} /> Agregar producto
              </button>
            )}
          </div>
        }
      />
      <div className="stats-grid">
        <StatCard
          label="Productos activos"
          value={integer(data.products.filter((product) => product.active).length)}
          hint={`${activeRows.length} ${activeRows.length === 1 ? 'variante' : 'variantes'} en el catálogo`}
        />
        <StatCard label="Unidades disponibles" value={integer(units)} hint="Listas para vender" />
        <StatCard
          label="Necesitan reposición"
          value={integer(lowRows.length)}
          hint="En el mínimo o por debajo"
          tone="warning"
        />
        {data.permissions.view_costs && (
          <StatCard
            label="Valor del inventario"
            value={money(value)}
            hint="Existencias disponibles a costo"
          />
        )}
      </div>
      {data.permissions.view_costs && (
        <div className="catalog-financials">
          <StatCard
            label="Ingreso potencial"
            value={money(revenue)}
            hint={`Con ITBIS: ${money(revenue * (1 + data.settings.tax_rate / 100))}`}
          />
          <StatCard
            label="Ganancia potencial"
            value={money(revenue - value)}
            hint={`Margen bruto estimado: ${revenue > 0 ? (((revenue - value) / revenue) * 100).toFixed(1) : '0.0'} %`}
          />
          <div className="catalog-financial-note">
            <strong>{integer(units)} unidades</strong>
            <span>
              Estimaciones sobre existencias y precios actuales; no representan ventas realizadas.
            </span>
          </div>
        </div>
      )}
      <section className="panel catalog-panel" aria-label="Catálogo de productos">
        <div className="toolbar table-toolbar catalog-toolbar">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Buscar por marca, modelo, SKU o código…"
          />
          <select
            aria-label="Filtrar por categoría"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="">Todas las categorías</option>
            {Array.from(new Set(rows.map((row) => row.product.category)))
              .sort()
              .map((value) => (
                <option key={value} value={value}>
                  {categoryName(value)}
                </option>
              ))}
          </select>
          <select
            aria-label="Filtrar por estado del catálogo"
            value={status}
            onChange={(event) => selectStatus(event.target.value)}
          >
            <option value="active">Productos activos</option>
            <option value="low">Necesitan reposición</option>
            <option value="low_stock">Stock bajo</option>
            <option value="available">Disponibles</option>
            <option value="out">Agotados</option>
            <option value="unpriced">Precio pendiente</option>
            <option value="archived">Archivados</option>
          </select>
          <select
            aria-label="Ordenar inventario"
            value={sort}
            onChange={(event) => setSort(event.target.value)}
          >
            <option value="name">Nombre A–Z</option>
            <option value="stock">Menor stock</option>
            <option value="price">Mayor precio</option>
          </select>
        </div>
        <div className="catalog-filter-tabs" role="group" aria-label="Filtrar inventario">
          {[
            ['active', 'Todos', activeRows.length],
            ['available', 'Disponibles', availableRows.length],
            ['low_stock', 'Bajo stock', positiveLowRows.length],
            ['out', 'Agotados', outRows.length],
          ].map(([key, label, count]) => (
            <button
              type="button"
              key={key}
              aria-pressed={status === key}
              onClick={() => selectStatus(String(key))}
            >
              {label}
              <span>{count}</span>
            </button>
          ))}
        </div>
        <div className="table-meta">
          <span>
            {visible.length} de {rows.length} {rows.length === 1 ? 'variante' : 'variantes'}
          </span>
          {query || category || status !== 'active' || sort !== 'name' ? (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setQuery('');
                setCategory('');
                setSort('name');
                selectStatus('active');
              }}
            >
              Limpiar filtros
            </button>
          ) : (
            <span>Precios con ITBIS: {taxRateLabel(data.settings.tax_rate)}</span>
          )}
        </div>
        {visible.length ? (
          <>
            <div className="table-wrap catalog-desktop">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Producto / variante</th>
                    <th>SKU</th>
                    <th>Stock actual</th>
                    <th>Precio sin ITBIS</th>
                    <th>Precio con ITBIS</th>
                    {data.permissions.view_costs && <th>Margen</th>}
                    <th>
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map(({ product, variant, stock }) => {
                    const amounts = calculateUnitPrice(variant.price, data.settings.tax_rate);
                    const available = stock?.available ?? 0;
                    const health = stockHealth(available, variant.min_stock);
                    return (
                      <tr key={variant.id}>
                        <td>
                          <button className="product-cell" onClick={() => openDetail(variant)}>
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
                          <small>{variant.barcode || 'Sin código de barras'}</small>
                        </td>
                        <td>
                          <div className="stock-cell">
                            <strong>
                              {integer(available)} <small>/ mín. {variant.min_stock}</small>
                            </strong>
                            <StockMeter
                              available={available}
                              minimum={variant.min_stock}
                              target={variant.reorder_target}
                            />
                            <span
                              className={`badge ${health === 'out' ? 'danger' : health === 'low' ? 'warning' : 'success'}`}
                            >
                              {stockHealthLabels[health]}
                            </span>
                          </div>
                        </td>
                        <td className="numeric">
                          {amounts ? (
                            money(amounts.base)
                          ) : (
                            <span className="badge warning">Precio pendiente</span>
                          )}
                        </td>
                        <td className="numeric">
                          {amounts ? (
                            <>
                              <strong>{money(amounts.total)}</strong>
                              <small>ITBIS: {money(amounts.tax)}</small>
                            </>
                          ) : (
                            '—'
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
                          <div className="row-actions">
                            <button className="button ghost" onClick={() => openDetail(variant)}>
                              Ver ficha
                            </button>
                            {data.permissions.manage_catalog && (
                              <>
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
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="catalog-mobile">
              {visible.map(({ product, variant, stock }) => {
                const available = stock?.available ?? 0;
                const health = stockHealth(available, variant.min_stock);
                const price = calculateUnitPrice(variant.price, data.settings.tax_rate);
                return (
                  <button
                    type="button"
                    className="catalog-mobile-product"
                    key={variant.id}
                    onClick={() => openDetail(variant)}
                  >
                    <span className="catalog-mobile-top">
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
                          {variant.name} · {variant.sku}
                        </small>
                        <small>{variant.barcode || 'Sin código de barras'}</small>
                      </span>
                      <ArrowUpRight size={18} />
                    </span>
                    <span className="catalog-mobile-bottom">
                      <span>
                        <strong>{integer(available)} unidades</strong>
                        <StockMeter
                          available={available}
                          minimum={variant.min_stock}
                          target={variant.reorder_target}
                        />
                        <span
                          className={`badge ${health === 'out' ? 'danger' : health === 'low' ? 'warning' : 'success'}`}
                        >
                          {stockHealthLabels[health]}
                        </span>
                      </span>
                      <span>
                        <strong>{price ? money(price.total) : 'Precio pendiente'}</strong>
                        <small>Con ITBIS</small>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </>
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
      {scanner && (
        <BarcodeScanner
          title="Buscar una referencia"
          onDetected={lookupBarcode}
          onClose={() => setScanner(false)}
        />
      )}
      {activeEditor && (
        <ProductEditor
          product={activeEditor === 'new' ? undefined : activeEditor}
          onClose={closeEditor}
          onSaved={(barcode) => updateParams({ etiqueta: barcode, nuevo: null })}
        />
      )}
      {adjustment && <StockEditor variant={adjustment} onClose={() => setAdjustment(null)} />}
      {detail && (
        <InventoryDetails
          key={detail.id}
          variant={detail}
          onClose={closeDetail}
          onEdit={(product) => {
            closeDetail();
            setEditor(product);
          }}
        />
      )}
      {(params.get('variante') || params.get('etiqueta')) && !detail && (
        <ErrorNotice message="No encontramos esa referencia en los datos actuales. Actualiza el catálogo y vuelve a intentar." />
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
