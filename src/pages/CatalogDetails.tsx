import { useState, type FormEvent } from 'react';
import { ArrowDownToLine, ArrowUpRight, Barcode, Printer, ShoppingBag, Truck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useRetail } from '../state/useRetail';
import { useOperation } from '../state/useOperation';
import type { Product, Variant } from '../lib/contracts';
import { categoryName, dateTime, integer, money } from '../lib/format';
import { EmptyState, ErrorNotice, Field, Modal } from '../components/ui';
import { ProductImage } from '../components/ProductImage';
import { calculateUnitPrice, potentialUnitProfit } from '../lib/pricing';
import { barcodeSvg, downloadBarcodeSvg, printBarcodeLabel } from '../lib/barcode';
import { pendingPurchaseUnits, replenishmentQuantity, stockHealth, stockHealthLabels } from '../lib/catalog';
import { PriceDetails } from './CatalogPricing';
import './catalog.css';
import './catalog-details.css';

export function StockEditor({
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

export function InventoryDetails({
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
  const price = calculateUnitPrice(variant.price, data.settings.tax_rate);
  const profit = data.permissions.view_costs
    ? potentialUnitProfit(variant.price, variant.cost ?? 0, data.settings.tax_rate)
    : null;
  const canSell = data.permissions.sell && active && available > 0 && Boolean(price);
  const canReplenish = data.permissions.purchase && active;
  const aliases = variant.barcode_aliases ?? [];
  return (
    <Modal title={`${variant.sku} · ${variant.name}`} onClose={onClose} variant="drawer">
      <div className="catalog-detail catalog-detail-compact">
        <div className="catalog-detail-hero">
          <ProductImage
            productId={product.id}
            source={product.images[0]}
            alt={`${product.brand} ${product.model} · ${variant.name}`}
            className="catalog-detail-image"
          />
          <div>
            <span className="eyebrow">{categoryName(product.category)}</span>
            <h3>{product.brand} {product.model}</h3>
            <p>{variant.name}</p>
            <span className={`badge ${!active || health === 'out' ? 'danger' : health === 'low' ? 'warning' : 'success'}`}>
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
            <dl className="catalog-detail-essential" aria-label="Precio y disponibilidad">
              <div>
                <dt>Precio final con ITBIS</dt>
                <dd className="catalog-detail-sale-price">{price ? money(price.total) : 'Precio pendiente'}</dd>
                <small>Por unidad · antes de descuentos</small>
              </div>
              <div>
                <dt>Disponibles</dt>
                <dd>{integer(available)} <small>{available === 1 ? 'unidad' : 'unidades'}</small></dd>
                <small>{!active ? 'Producto archivado' : available > 0 ? 'Listas para vender' : 'Sin existencias'}</small>
              </div>
            </dl>
            <div className="catalog-quick-actions">
              {canSell && (
                <Link className="button primary" to={`/ventas?nuevo=1&variante=${variant.id}`}>
                  <ShoppingBag size={17} /> Nueva venta
                </Link>
              )}
              {canReplenish && (
                <Link
                  className={`button ${canSell ? 'secondary' : 'primary'}`}
                  to={`/compras?nuevo=1&variante=${variant.id}&cantidad=${Math.max(1, suggested)}`}
                >
                  <Truck size={17} /> Reponer variante
                </Link>
              )}
            </div>
            {data.permissions.sell && active && !price && (
              <p className="catalog-detail-hint">Define un precio final para habilitar la venta.</p>
            )}
            <details className="catalog-detail-disclosure">
              <summary>Descripción y garantía</summary>
              <div className="catalog-detail-disclosure-body">
                <p className="catalog-detail-warranty">
                  {product.warranty_months ? `${product.warranty_months} meses de garantía comercial` : 'Sin garantía comercial'}
                </p>
                {product.description ? <p className="catalog-description">{product.description}</p> : <p className="catalog-detail-hint">Sin descripción adicional.</p>}
              </div>
            </details>
            <details className="catalog-detail-disclosure">
              <summary>{data.permissions.view_costs ? 'Gestión y precios' : 'Desglose del precio'}</summary>
              <div className="catalog-detail-disclosure-body">
                <PriceDetails price={variant.price} taxRate={data.settings.tax_rate} />
                {data.permissions.view_costs && (
                  <dl className="catalog-facts">
                    <div><dt>Costo por unidad</dt><dd>{money(variant.cost ?? 0)}</dd></div>
                    <div><dt>Ganancia estimada por unidad</dt><dd>{profit ? money(profit.profit) : 'Precio pendiente'}</dd></div>
                  </dl>
                )}
              </div>
            </details>
            <details className="catalog-detail-disclosure">
              <summary>Inventario y reposición</summary>
              <div className="catalog-detail-disclosure-body">
                <StockMeter available={available} target={variant.reorder_target} minimum={variant.min_stock} />
                <dl className="catalog-facts">
                  <div><dt>Stock mínimo</dt><dd>{integer(variant.min_stock)}</dd></div>
                  <div><dt>Objetivo de reposición</dt><dd>{integer(variant.reorder_target)}</dd></div>
                  <div><dt>En revisión</dt><dd>{integer(stock?.quarantine ?? 0)} unidades</dd></div>
                  {data.permissions.purchase && <div><dt>Pendientes de recibir</dt><dd>{integer(incoming)} unidades</dd></div>}
                </dl>
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
              </div>
            </details>
            <details className="catalog-detail-disclosure">
              <summary>Códigos y etiquetas</summary>
              <div className="catalog-detail-disclosure-body">
                <dl className="catalog-facts">
                  <div><dt>SKU</dt><dd><code>{variant.sku}</code></dd></div>
                  {aliases.length > 0 && <div><dt>Códigos del fabricante</dt><dd>{aliases.map((code) => <code className="catalog-detail-alias" key={code}>{code}</code>)}</dd></div>}
                </dl>
                {variant.barcode ? (
                  <section className="catalog-label-preview">
                    <small>{variant.barcode.startsWith('SL') ? 'Código registrado · puede ser interno' : 'Código registrado'}</small>
                    {printable ? <div className="catalog-label-bars" dangerouslySetInnerHTML={{ __html: printable }} /> : (
                      <p>El código se conserva, pero contiene caracteres no compatibles con etiquetas Code 128B.</p>
                    )}
                    <code>{variant.barcode}</code>
                    <div className="row-actions">
                      <button type="button" className="button secondary" disabled={!printable} onClick={() => setLabelError(printBarcodeLabel({ barcode: variant.barcode!, sku: variant.sku, title: `${product.brand} ${product.model} · ${variant.name}` }) ?? '')}>
                        <Printer size={16} /> Imprimir etiqueta
                      </button>
                      <button type="button" className="button secondary" disabled={!printable} onClick={() => setLabelError(downloadBarcodeSvg(variant.barcode!, variant.sku) ?? '')}>
                        <ArrowDownToLine size={16} /> Descargar SVG
                      </button>
                    </div>
                  </section>
                ) : (
                  <div className="note-box">
                    Esta variante no tiene código.{' '}
                    {data.permissions.manage_catalog && <button type="button" className="button secondary" onClick={() => onEdit(product)}><Barcode size={16} /> Generar código en la ficha</button>}
                  </div>
                )}
                <ErrorNotice message={labelError} />
              </div>
            </details>
          </>
        )}
        {tab === 'history' && (
          movements.length ? (
            <div className="catalog-movements">
              {movements.map((movement) => (
                <article key={movement.id}>
                  <span className={`catalog-movement-value ${movement.quantity > 0 ? 'positive' : ''}`}>{movement.quantity > 0 ? '+' : ''}{movement.quantity}</span>
                  <div>
                    <strong>{movement.reason}</strong>
                    <small>{dateTime(movement.created_at)} · {movement.bucket === 'quarantine' ? 'En revisión' : 'Disponible'}</small>
                    <small>Saldo posterior: {integer(movement.after_quantity)}</small>
                  </div>
                </article>
              ))}
            </div>
          ) : <EmptyState title="Sin movimientos" description="Las próximas operaciones aparecerán aquí con su fecha y motivo." />
        )}
        {tab === 'adjust' && data.permissions.manage_catalog && <StockEditor key={variant.id} variant={variant} embedded onClose={() => setTab('summary')} />}
        {data.permissions.manage_catalog && tab !== 'adjust' && (
          <div className="catalog-detail-footer">
            <button type="button" className="button secondary" onClick={() => onEdit(product)}>Editar ficha</button>
          </div>
        )}
      </div>
    </Modal>
  );
}

export function StockMeter({
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

