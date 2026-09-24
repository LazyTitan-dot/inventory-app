import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  Check,
  Package,
  Plus,
  Printer,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import type { DocumentItem, RetailDocument } from '../lib/contracts';
import {
  businessDate,
  dateTime,
  documentNumber,
  matches,
  money,
  paymentLabels,
  shortDate,
} from '../lib/format';
import { useRetail } from '../state/useRetail';
import { useOperation } from '../state/useOperation';
import {
  EmptyState,
  ErrorNotice,
  Field,
  Modal,
  PageHeader,
  SearchInput,
  StatCard,
  StatusBadge,
} from '../components/ui';
import './commerce.css';

type Warranty = {
  sale: RetailDocument;
  item: DocumentItem;
  expires: string | null;
  status: 'active' | 'expiring' | 'expired' | 'none' | 'unknown';
  remaining: number;
};
type ReturnLine = { quantity: string; condition: 'available' | 'quarantine' };
const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const itemTitle = (item: DocumentItem) =>
  `${item.product_snapshot.brand} ${item.product_snapshot.model}`.trim();
const customerName = (doc: RetailDocument) =>
  String(doc.contact_snapshot.name || 'Cliente de mostrador');
const warrantyLabels = {
  active: 'Vigente',
  expiring: 'Vence pronto',
  expired: 'Vencida',
  none: 'Sin garantía comercial',
  unknown: 'Garantía no registrada',
};
const warrantyUnknown = (item: DocumentItem) =>
  Boolean(item.product_snapshot.warranty_unknown) || item.product_snapshot.warranty_months === null;

// Se conserva el día cuando existe; 31 de enero + un mes vence el último día de febrero.
function warrantyEndDate(soldAt: string, months: number | null): string | null {
  if (months === null || !Number.isInteger(months) || months <= 0) return null;
  const parts = businessDate(new Date(soldAt)).split('-').map(Number);
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  if (year === undefined || month === undefined || day === undefined) return null;
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}

export function AfterSalesPage() {
  const { data } = useRetail();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);
  const [tab, setTab] = useState<'returns' | 'warranties'>('returns');
  const [query, setQuery] = useState('');
  const [warrantyStatus, setWarrantyStatus] = useState('all');
  const [params, setParams] = useSearchParams();
  const creating = params.get('nuevo') === '1';
  const initialSaleId = params.get('venta') ?? '';
  const setCreating = (open: boolean) => {
    const next = new URLSearchParams(params);
    next.delete('documento');
    if (open) next.set('nuevo', '1');
    else {
      next.delete('nuevo');
      next.delete('venta');
    }
    setParams(next);
  };
  const selectedId = params.get('documento');
  const setSelectedId = (id: string | null) => setParams(id ? { documento: id } : {});
  const [warrantyId, setWarrantyId] = useState<string | null>(null);
  const returns = data.documents
    .filter((doc) => doc.type === 'return')
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const sales = data.documents.filter(
    (doc) => doc.type === 'sale' && ['completed', 'partially_returned'].includes(doc.status),
  );
  const today = businessDate(new Date(now));
  const soon = businessDate(new Date(now + 30 * 86400000));
  const warranties: Warranty[] = data.document_items.flatMap((item) => {
    const sale = sales.find((doc) => doc.id === item.document_id);
    if (!sale || item.returned_quantity >= item.quantity) return [];
    const expires = warrantyUnknown(item)
      ? null
      : warrantyEndDate(sale.created_at, item.product_snapshot.warranty_months);
    const status: Warranty['status'] = warrantyUnknown(item)
      ? 'unknown'
      : !expires
        ? 'none'
        : expires < today
          ? 'expired'
          : expires <= soon
            ? 'expiring'
            : 'active';
    return [{ item, sale, expires, status, remaining: item.quantity - item.returned_quantity }];
  });
  const documentById = new Map(data.documents.map((doc) => [doc.id, doc]));
  const filteredReturns = returns.filter((doc) => {
    const original = doc.parent_id && documentById.get(doc.parent_id);
    return matches(
      query,
      documentNumber(doc),
      customerName(doc),
      doc.notes,
      original ? documentNumber(original) : '',
    );
  });
  const filteredWarranties = warranties.filter(
    (row) =>
      (warrantyStatus === 'all' ||
        (warrantyStatus === 'active'
          ? ['active', 'expiring'].includes(row.status)
          : row.status === warrantyStatus)) &&
      matches(
        query,
        customerName(row.sale),
        String(row.sale.contact_snapshot.phone || ''),
        documentNumber(row.sale),
        itemTitle(row.item),
        row.item.product_snapshot.name,
        row.item.product_snapshot.sku,
      ),
  );
  const selectedReturn = returns.find((doc) => doc.id === selectedId);
  const selectedWarranty = warranties.find((row) => row.item.id === warrantyId);

  return (
    <>
      <PageHeader
        eyebrow="ATENCIÓN DESPUÉS DE LA VENTA"
        title="Posventa"
        description="Resuelve devoluciones y consulta las garantías de cada compra."
        actions={
          data.permissions.refund ? (
            <button className="button primary" onClick={() => setCreating(true)}>
              <Plus size={18} />
              Nueva devolución
            </button>
          ) : undefined
        }
      />
      {creating && !data.permissions.refund && (
        <ErrorNotice message="Tu rol no permite registrar devoluciones. Un administrador puede atender esta solicitud." />
      )}
      {selectedId && !selectedReturn && (
        <ErrorNotice message="La devolución solicitada no está disponible. Revisa el enlace o actualiza los datos." />
      )}
      <div className="stats-grid commerce-stats">
        <StatCard
          label="Devoluciones registradas"
          value={returns.length}
          hint="Vinculadas a su venta original"
        />
        <StatCard
          label="Importe devuelto"
          value={money(returns.reduce((sum, doc) => sum + doc.total, 0))}
          hint="Reembolsos comerciales registrados"
        />
        <StatCard
          label="Garantías próximas a vencer"
          value={warranties.filter((row) => row.status === 'expiring').length}
          hint="Renglones que vencen en 30 días"
        />
      </div>
      <section className="panel">
        <div className="commerce-tabs" role="tablist" aria-label="Secciones de posventa">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'returns'}
            className={tab === 'returns' ? 'active' : ''}
            onClick={() => {
              setTab('returns');
              setQuery('');
            }}
          >
            <RotateCcw size={17} />
            Devoluciones
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'warranties'}
            className={tab === 'warranties' ? 'active' : ''}
            onClick={() => {
              setTab('warranties');
              setQuery('');
            }}
          >
            <ShieldCheck size={17} />
            Garantías
          </button>
        </div>
        <div className="toolbar commerce-toolbar">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder={
              tab === 'returns'
                ? 'Buscar devolución, venta o cliente…'
                : 'Buscar cliente, teléfono, venta o producto…'
            }
          />
          {tab === 'warranties' && (
            <select
              aria-label="Estado de garantía"
              value={warrantyStatus}
              onChange={(event) => setWarrantyStatus(event.target.value)}
            >
              <option value="all">Todas las garantías</option>
              <option value="active">Vigentes</option>
              <option value="expiring">Vencen en 30 días</option>
              <option value="expired">Vencidas</option>
              <option value="none">Sin garantía comercial</option>
              <option value="unknown">No registrada en el sistema anterior</option>
            </select>
          )}
        </div>
        {tab === 'returns' ? (
          !filteredReturns.length ? (
            <EmptyState
              title={returns.length ? 'No hay coincidencias' : 'Sin devoluciones registradas'}
              description={
                returns.length
                  ? 'Prueba el número de la venta o el nombre del cliente.'
                  : 'Cada devolución conservará su motivo, importe y venta de origen.'
              }
            />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Devolución</th>
                    <th>Cliente</th>
                    <th>Venta original</th>
                    <th>Fecha</th>
                    <th className="number">Reembolso</th>
                    <th>
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReturns.map((doc) => {
                    const sale = data.documents.find((candidate) => candidate.id === doc.parent_id);
                    return (
                      <tr key={doc.id}>
                        <td>
                          <strong>{documentNumber(doc)}</strong>
                        </td>
                        <td>{customerName(doc)}</td>
                        <td>{sale ? documentNumber(sale) : '—'}</td>
                        <td>{shortDate(doc.created_at)}</td>
                        <td className="number">{money(doc.total)}</td>
                        <td>
                          <button className="button ghost" onClick={() => setSelectedId(doc.id)}>
                            Ver detalle
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : !filteredWarranties.length ? (
          <EmptyState
            title="No encontramos garantías"
            description="Las condiciones se guardan en cada venta. Prueba otro filtro o producto."
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Producto / variante</th>
                  <th>Cliente / venta</th>
                  <th>Cobertura</th>
                  <th>Vencimiento</th>
                  <th>Estado</th>
                  <th>
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredWarranties.map((row) => (
                  <tr key={row.item.id}>
                    <td>
                      <strong>{itemTitle(row.item)}</strong>
                      <small className="commerce-table-meta">
                        {row.item.product_snapshot.name} · {row.item.product_snapshot.sku}
                      </small>
                    </td>
                    <td>
                      {customerName(row.sale)}
                      <small className="commerce-table-meta">{documentNumber(row.sale)}</small>
                    </td>
                    <td>
                      {warrantyUnknown(row.item)
                        ? 'Sin dato histórico'
                        : row.item.product_snapshot.warranty_months + ' meses'}
                      <small className="commerce-table-meta">
                        {row.remaining} {row.remaining === 1 ? 'unidad' : 'unidades'} sin devolver
                      </small>
                    </td>
                    <td>
                      {row.expires
                        ? shortDate(`${row.expires}T12:00:00-04:00`)
                        : row.status === 'unknown'
                          ? 'Sin fecha registrada'
                          : 'No aplica'}
                    </td>
                    <td>
                      <span className={`badge warranty-${row.status}`}>
                        {warrantyLabels[row.status]}
                      </span>
                    </td>
                    <td>
                      <button className="button ghost" onClick={() => setWarrantyId(row.item.id)}>
                        Consultar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {tab === 'warranties' && (
        <p className="commerce-page-note">
          Las garantías muestran las condiciones registradas al vender. Los cambios posteriores del
          catálogo no modifican esta información.
        </p>
      )}
      {creating && data.permissions.refund && (
        <CreateReturn
          key={initialSaleId}
          initialSaleId={initialSaleId}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setSelectedId(id);
            setTab('returns');
          }}
        />
      )}
      {selectedReturn && (
        <ReturnDetail document={selectedReturn} onClose={() => setSelectedId(null)} />
      )}
      {selectedWarranty && (
        <WarrantyDetail warranty={selectedWarranty} onClose={() => setWarrantyId(null)} />
      )}
    </>
  );
}

function CreateReturn({
  initialSaleId,
  onClose,
  onCreated,
}: {
  initialSaleId: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { data, notify } = useRetail();
  const { run, busy, error, clearError } = useOperation();
  const [query, setQuery] = useState('');
  const [saleId, setSaleId] = useState(initialSaleId);
  const [lines, setLines] = useState<Record<string, ReturnLine>>({});
  const [reason, setReason] = useState('');
  const [payment, setPayment] = useState(
    () => data.documents.find((doc) => doc.id === initialSaleId)?.payment_method || 'cash',
  );
  const [validation, setValidation] = useState('');
  const sales = data.documents
    .filter(
      (doc) => doc.type === 'sale' && ['completed', 'partially_returned'].includes(doc.status),
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const filtered = sales.filter((doc) =>
    matches(
      query,
      documentNumber(doc),
      customerName(doc),
      String(doc.contact_snapshot.phone || ''),
    ),
  );
  const sale = sales.find((doc) => doc.id === saleId);
  const items = data.document_items.filter((item) => item.document_id === saleId);
  const pendingDelivery = data.deliveries.find(
    (delivery) =>
      delivery.sale_id === saleId &&
      ['scheduled', 'in_transit', 'failed'].includes(delivery.status),
  );
  const hasReturnableItems = items.some(
    (item) => item.variant_id && item.quantity > item.returned_quantity,
  );
  function estimatedRefund(item: DocumentItem, quantity: number) {
    if (quantity <= 0 || !Number.isFinite(quantity)) return 0;
    const discount =
      round((item.discount * (item.returned_quantity + quantity)) / item.quantity) -
      round((item.discount * item.returned_quantity) / item.quantity);
    const tax =
      round((item.tax * (item.returned_quantity + quantity)) / item.quantity) -
      round((item.tax * item.returned_quantity) / item.quantity);
    return Math.max(0, round(item.unit_price * quantity - discount + tax));
  }
  const total = round(
    items.reduce(
      (sum, item) => sum + estimatedRefund(item, Number(lines[item.id]?.quantity || 0)),
      0,
    ),
  );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearError();
    setValidation('');
    if (!data.permissions.refund || !sale) {
      setValidation('Esta venta no admite una devolución con tu acceso actual.');
      return;
    }
    if (pendingDelivery) {
      setValidation('Resuelve o cancela la entrega pendiente antes de registrar la devolución.');
      return;
    }
    const selected = items
      .map((item) => ({
        item_id: item.id,
        quantity: Number(lines[item.id]?.quantity || 0),
        condition: lines[item.id]?.condition || 'quarantine',
      }))
      .filter((line) => line.quantity !== 0);
    if (!selected.length) {
      setValidation('Selecciona al menos una unidad para devolver.');
      return;
    }
    if (
      selected.some((line) => {
        const item = items.find((candidate) => candidate.id === line.item_id);
        return (
          !item ||
          !Number.isSafeInteger(line.quantity) ||
          line.quantity < 1 ||
          line.quantity > item.quantity - item.returned_quantity
        );
      })
    ) {
      setValidation('Las cantidades deben ser enteras y no superar el saldo devolvible.');
      return;
    }
    if (selected.some((line) => !items.find((item) => item.id === line.item_id)?.variant_id)) {
      setValidation('El artículo histórico debe vincularse al inventario antes de devolverlo.');
      return;
    }
    if (!reason.trim()) {
      setValidation('Indica el motivo de la devolución.');
      return;
    }
    try {
      const result = await run('return_sale', {
        id: saleId,
        items: selected,
        reason: reason.trim(),
        payment_method: payment,
      });
      if (!result.entity_id) {
        setValidation(
          'La respuesta no identifica la devolución. Actualiza los datos para comprobar el registro antes de crear otro.',
        );
        return;
      }
      notify('Devolución registrada. Inventario y saldo devolvible actualizados.');
      onCreated(result.entity_id);
    } catch {
      /* Conservar cantidades, condición y motivo para reintentar. */
    }
  }
  return (
    <Modal title="Nueva devolución" onClose={busy ? () => undefined : onClose} wide>
      {!sale ? (
        <div className="stack">
          {saleId && (
            <ErrorNotice message="La venta solicitada no está disponible para devolución. Solo se admiten ventas confirmadas con unidades sin devolver." />
          )}
          <p className="muted">
            Busca la venta original para conocer las cantidades y el importe que se pueden devolver.
          </p>
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Número de venta, cliente o teléfono…"
          />
          {!filtered.length ? (
            <EmptyState
              title="No hay ventas disponibles"
              description="Solo se pueden devolver unidades de ventas confirmadas que no se hayan devuelto por completo."
            />
          ) : (
            <div className="commerce-sale-picker">
              {filtered.map((doc) => (
                <button
                  key={doc.id}
                  className="commerce-pick-sale"
                  onClick={() => {
                    setSaleId(doc.id);
                    setPayment(doc.payment_method || 'cash');
                    setLines({});
                    clearError();
                  }}
                >
                  <span className="commerce-sale-icon">
                    <ShoppingReceipt />
                  </span>
                  <span>
                    <strong>{documentNumber(doc)}</strong>
                    <small>
                      {customerName(doc)} · {shortDate(doc.created_at)}
                    </small>
                  </span>
                  <b>{money(doc.total)}</b>
                  <ArrowUpRight size={18} />
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <form onSubmit={submit} className="stack">
          <button
            type="button"
            className="button ghost commerce-back"
            disabled={busy}
            onClick={() => {
              setSaleId('');
              setLines({});
              setValidation('');
              clearError();
            }}
          >
            <ArrowLeft size={16} />
            Elegir otra venta
          </button>
          <div className="commerce-convert-summary">
            <RotateCcw size={28} />
            <div>
              <h3>{documentNumber(sale)}</h3>
              <p>
                {customerName(sale)} · {shortDate(sale.created_at)}
              </p>
            </div>
            <StatusBadge status={sale.status} />
          </div>
          {pendingDelivery && (
            <div className="commerce-linked-note">
              <span>Resuelve o cancela la entrega pendiente antes de devolver mercancía.</span>
              <Link className="button secondary" to={'/entregas?documento=' + pendingDelivery.id}>
                Ver entrega
              </Link>
            </div>
          )}
          {!hasReturnableItems && (
            <ErrorNotice message="Los artículos pendientes no tienen vínculo con el inventario. Deben revisarse antes de registrar una devolución." />
          )}
          <fieldset disabled={busy} className="commerce-fieldset">
            <div className="commerce-return-lines">
              {items.map((item) => {
                const remaining = item.quantity - item.returned_quantity;
                const line = lines[item.id] || { quantity: '0', condition: 'quarantine' as const };
                return (
                  <div
                    className={`commerce-return-line ${remaining <= 0 ? 'is-complete' : ''}`}
                    key={item.id}
                  >
                    <div className="commerce-return-item">
                      <Package size={24} />
                      <div>
                        <strong>{itemTitle(item)}</strong>
                        <p className="muted">
                          {item.product_snapshot.name} · {item.product_snapshot.sku}
                        </p>
                        <small>
                          {item.quantity} vendidas · {item.returned_quantity} devueltas ·{' '}
                          <b>{remaining} devolvibles</b>
                        </small>
                        {!item.variant_id && (
                          <p className="commerce-inline-note">
                            Artículo histórico sin vínculo con el inventario. Pendiente de revisión.
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="form-grid commerce-return-fields">
                      <Field label="Cantidad a devolver">
                        <input
                          type="number"
                          min="0"
                          max={remaining}
                          step="1"
                          value={line.quantity}
                          disabled={!remaining || !item.variant_id}
                          aria-label={`Cantidad a devolver de ${itemTitle(item)} ${item.product_snapshot.name}`}
                          onChange={(event) =>
                            setLines((current) => ({
                              ...current,
                              [item.id]: { ...line, quantity: event.target.value },
                            }))
                          }
                        />
                      </Field>
                      <Field label="Condición de la mercancía">
                        <select
                          value={line.condition}
                          disabled={!remaining || !item.variant_id}
                          onChange={(event) =>
                            setLines((current) => ({
                              ...current,
                              [item.id]: {
                                ...line,
                                condition: event.target.value as ReturnLine['condition'],
                              },
                            }))
                          }
                        >
                          <option value="quarantine">Dañada / requiere revisión</option>
                          <option value="available">Apta para vender</option>
                        </select>
                      </Field>
                      <div className="commerce-return-estimate">
                        <span>Importe estimado</span>
                        <strong>{money(estimatedRefund(item, Number(line.quantity) || 0))}</strong>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="form-grid">
              <Field label="Motivo obligatorio">
                <textarea
                  rows={3}
                  required
                  maxLength={1000}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Describe lo ocurrido y la resolución acordada"
                />
              </Field>
              <Field label="Medio de reembolso">
                <select value={payment} onChange={(event) => setPayment(event.target.value)}>
                  {Object.entries(paymentLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </fieldset>
          <div className="commerce-return-total">
            <div>
              <strong>Reembolso estimado</strong>
              <p>Incluye los descuentos e impuestos de la venta original.</p>
            </div>
            <b>{money(total)}</b>
          </div>
          <p className="commerce-inline-note">
            Solo la mercancía apta vuelve a estar disponible. Los artículos por revisar quedan en
            cuarentena. El registro no mueve dinero en una terminal ni cuenta bancaria.
          </p>
          <ErrorNotice message={validation || error} />
          <div className="modal-footer">
            <button type="button" className="button secondary" disabled={busy} onClick={onClose}>
              Cancelar
            </button>
            <button
              className="button primary"
              disabled={busy || Boolean(pendingDelivery) || !hasReturnableItems}
            >
              <Check size={17} />
              {busy ? 'Registrando…' : 'Confirmar devolución'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function ShoppingReceipt() {
  return <RotateCcw size={20} />;
}

function ReturnDetail({
  document: doc,
  onClose,
}: {
  document: RetailDocument;
  onClose: () => void;
}) {
  const { data } = useRetail();
  const sale = data.documents.find((candidate) => candidate.id === doc.parent_id);
  const items = data.document_items.filter((item) => item.document_id === doc.id);
  return (
    <Modal title={documentNumber(doc)} onClose={onClose} wide>
      <article className="retail-print commerce-document">
        <div className="commerce-document-heading">
          <div>
            <span className="commerce-document-eyebrow">{data.settings.business_name}</span>
            <h2>Devolución registrada</h2>
            <p>
              {documentNumber(doc)} · {dateTime(doc.created_at)}
            </p>
          </div>
          <StatusBadge status={doc.status} />
        </div>
        <div className="commerce-document-contact">
          <div>
            <span className="muted">Cliente</span>
            <strong>{customerName(doc)}</strong>
          </div>
          <div>
            <span className="muted">Venta original</span>
            <strong>{sale ? documentNumber(sale) : '—'}</strong>
          </div>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Artículo devuelto</th>
                <th className="number">Cantidad</th>
                <th className="number">Importe</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{itemTitle(item)}</strong>
                    <small className="commerce-table-meta">
                      {item.product_snapshot.name} · {item.product_snapshot.sku}
                    </small>
                  </td>
                  <td className="number">{item.quantity}</td>
                  <td className="number">{money(item.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="commerce-document-summary">
          <div className="commerce-document-notes">
            <strong>Motivo</strong>
            <p>{doc.notes || 'Sin nota adicional'}</p>
            <p>Reembolso registrado: {paymentLabels[doc.payment_method || 'other']}</p>
            <p>Documento comercial. No es un comprobante fiscal.</p>
          </div>
          <div className="commerce-totals">
            <div>
              <span>Subtotal</span>
              <span>{money(doc.subtotal)}</span>
            </div>
            <div>
              <span>Descuento original</span>
              <span>−{money(doc.discount)}</span>
            </div>
            <div>
              <span>Impuestos</span>
              <span>{money(doc.tax)}</span>
            </div>
            <div className="commerce-grand-total">
              <strong>Total devuelto</strong>
              <strong>{money(doc.total)}</strong>
            </div>
          </div>
        </div>
      </article>
      <div className="modal-footer">
        {sale && (
          <Link className="button ghost" to={'/ventas?documento=' + sale.id}>
            Ver venta original
          </Link>
        )}
        <button className="button secondary" onClick={onClose}>
          Cerrar
        </button>
        <button className="button primary" onClick={() => window.print()}>
          <Printer size={17} />
          Imprimir constancia
        </button>
      </div>
    </Modal>
  );
}

function WarrantyDetail({ warranty, onClose }: { warranty: Warranty; onClose: () => void }) {
  const { data } = useRetail();
  const { sale, item, expires, remaining, status } = warranty;
  return (
    <Modal title="Garantía de la compra" onClose={onClose}>
      <article className="retail-print commerce-warranty-detail">
        <div className="commerce-warranty-icon">
          <ShieldCheck size={36} />
        </div>
        <span className="commerce-document-eyebrow">{data.settings.business_name}</span>
        <h2>{itemTitle(item)}</h2>
        <p className="muted">
          {item.product_snapshot.name} · {item.product_snapshot.sku}
        </p>
        <span className={`badge warranty-${status}`}>{warrantyLabels[status]}</span>
        <dl className="commerce-detail-list">
          <div>
            <dt>Venta</dt>
            <dd>{documentNumber(sale)}</dd>
          </div>
          <div>
            <dt>Cliente</dt>
            <dd>{customerName(sale)}</dd>
          </div>
          <div>
            <dt>Fecha de compra</dt>
            <dd>{shortDate(sale.created_at)}</dd>
          </div>
          <div>
            <dt>Período registrado</dt>
            <dd>
              {warrantyUnknown(item)
                ? 'Garantía no registrada en el sistema anterior'
                : item.product_snapshot.warranty_months + ' meses'}
            </dd>
          </div>
          <div>
            <dt>Vencimiento</dt>
            <dd>
              {expires
                ? shortDate(`${expires}T12:00:00-04:00`)
                : status === 'unknown'
                  ? 'Sin fecha registrada'
                  : 'No aplica'}
            </dd>
          </div>
          <div>
            <dt>Unidades sin devolver</dt>
            <dd>{remaining}</dd>
          </div>
        </dl>
        {status === 'unknown' ? (
          <p className="commerce-inline-note">
            La garantía no fue registrada en el sistema anterior. Revisa el recibo original para
            confirmar sus condiciones.
          </p>
        ) : (
          expires && (
            <p className="commerce-inline-note">
              <CalendarDays size={17} />
              El vencimiento conserva el día de compra o el último día del mes cuando ese día no
              existe.
            </p>
          )
        )}
        <p className="muted">
          Esta consulta refleja las condiciones guardadas en la venta. No registra una reparación ni
          autoriza un reemplazo.
        </p>
      </article>
      <div className="modal-footer">
        <Link className="button ghost" to={'/ventas?documento=' + sale.id}>
          Ver venta original
        </Link>
        {data.permissions.refund && item.variant_id && (
          <Link
            className="button secondary"
            to={'/posventa?nuevo=1&venta=' + sale.id}
            onClick={onClose}
          >
            Registrar devolución
          </Link>
        )}
        <button className="button secondary" onClick={onClose}>
          Cerrar
        </button>
        <button className="button primary" onClick={() => window.print()}>
          <Printer size={17} />
          Imprimir consulta
        </button>
      </div>
    </Modal>
  );
}
