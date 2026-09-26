import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarDays, Check, Clock3, MessageCircle, Pencil, Plus, Tag, Truck } from 'lucide-react';
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
import type { Delivery, Promotion, RetailData, RetailDocument } from '../lib/contracts';
import { errorMessage } from '../lib/errors';
import {
  BUSINESS_TIMEZONE,
  businessDate,
  categoryName,
  dateTime,
  documentNumber,
  matches,
  money,
  statusLabels,
} from '../lib/format';
import { useOperation } from '../state/useOperation';
import { useRetail } from '../state/useRetail';
import { WhatsAppComposer } from '../components/WhatsAppComposer';
import { buildDeliveryWhatsAppMessage } from '../lib/whatsapp';
import './operations.css';

type DeliveryStatus = Delivery['status'];
type PromotionState = 'current' | 'upcoming' | 'expired' | 'inactive';
type PromotionScope = 'all' | 'category' | 'products' | 'combined';
const promotionLabels: Record<PromotionState, string> = {
  current: 'Vigente',
  upcoming: 'Próxima',
  expired: 'Vencida',
  inactive: 'Desactivada',
};
const deliveryActions: Record<DeliveryStatus, DeliveryStatus[]> = {
  scheduled: ['in_transit', 'cancelled'],
  in_transit: ['delivered', 'failed'],
  failed: ['scheduled', 'cancelled'],
  delivered: [],
  cancelled: [],
};
const actionLabels: Record<DeliveryStatus, string> = {
  scheduled: 'Volver a programar',
  in_transit: 'Iniciar entrega',
  delivered: 'Confirmar entrega',
  failed: 'Registrar intento fallido',
  cancelled: 'Cancelar entrega',
};

function canManageDeliveries(data: RetailData) {
  return (
    ['owner', 'admin', 'sales', 'inventory'].includes(data.profile.role) &&
    (data.permissions.sell || data.permissions.purchase)
  );
}
function canManagePromotions(data: RetailData) {
  return ['owner', 'admin'].includes(data.profile.role) && data.permissions.manage_business;
}
function saleIsCurrent(sale: RetailDocument) {
  return sale.type === 'sale' && ['completed', 'partially_returned'].includes(sale.status);
}
function textSnapshot(sale: RetailDocument | undefined, key: string) {
  const value = sale?.contact_snapshot[key];
  return typeof value === 'string' ? value : '';
}
function saleCustomer(sale: RetailDocument) {
  return textSnapshot(sale, 'name') || 'Cliente de mostrador';
}
function businessInput(value: string | number) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}
function businessInstant(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  // República Dominicana usa UTC−04:00 durante todo el año, sin horario de verano.
  const instant = new Date(`${value}:00-04:00`);
  return Number.isFinite(instant.getTime()) && businessInput(instant.getTime()) === value
    ? instant.toISOString()
    : null;
}
function useBusinessClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}
function promotionState(promotion: Promotion, now: number): PromotionState {
  if (!promotion.active) return 'inactive';
  if (new Date(promotion.starts_at).getTime() > now) return 'upcoming';
  if (new Date(promotion.ends_at).getTime() < now) return 'expired';
  return 'current';
}
function promotionScope(promotion: Promotion) {
  const category = promotion.category ? categoryName(promotion.category) : '';
  const products = promotion.product_ids.length
    ? `${promotion.product_ids.length} ${promotion.product_ids.length === 1 ? 'producto' : 'productos'}`
    : '';
  return category && products
    ? `${products} de ${category}`
    : category || products || 'Todo el catálogo';
}
function promotionPayload(promotion: Promotion, active: boolean): Record<string, unknown> {
  return {
    id: promotion.id,
    expected_updated_at: promotion.updated_at,
    name: promotion.name,
    code: promotion.code ?? '',
    kind: promotion.kind,
    value: promotion.value,
    starts_at: promotion.starts_at,
    ends_at: promotion.ends_at,
    category: promotion.category ?? '',
    product_ids: promotion.product_ids,
    active,
  };
}

export function DeliveriesPage() {
  const { data } = useRetail();
  const [params, setParams] = useSearchParams();
  const now = useBusinessClock();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [date, setDate] = useState('');
  const [creating, setCreating] = useState(params.get('nuevo') === '1' && data.permissions.sell);
  const [selectedId, setSelectedId] = useState<string | null>(params.get('documento'));
  const closeContext = () => setParams({}, { replace: true });
  const today = businessDate(new Date(now));
  const canManage = canManageDeliveries(data);
  const availableSales = data.documents.filter(
    (sale) =>
      saleIsCurrent(sale) &&
      !data.deliveries.some(
        (delivery) => delivery.sale_id === sale.id && delivery.status !== 'cancelled',
      ),
  );
  const selected = data.deliveries.find((delivery) => delivery.id === selectedId);
  const saleMap = new Map(
    data.documents.filter((sale) => sale.type === 'sale').map((sale) => [sale.id, sale]),
  );
  const deliveries = [...data.deliveries].sort((a, b) =>
    a.scheduled_at.localeCompare(b.scheduled_at),
  );
  const filtered = deliveries.filter((delivery) => {
    const sale = saleMap.get(delivery.sale_id);
    return (
      (status === 'all' || delivery.status === status) &&
      (!date || businessDate(new Date(delivery.scheduled_at)) === date) &&
      matches(
        query,
        delivery.contact_name,
        delivery.address,
        delivery.phone,
        delivery.assignee,
        sale ? documentNumber(sale) : '',
      )
    );
  });
  const pending = deliveries.filter((delivery) =>
    ['scheduled', 'in_transit', 'failed'].includes(delivery.status),
  );
  const createButton =
    canManage && data.permissions.sell ? (
      <button
        className="button primary"
        onClick={() => setCreating(true)}
        disabled={!availableSales.length}
      >
        <Plus size={18} />
        Programar entrega
      </button>
    ) : undefined;

  return (
    <>
      <PageHeader
        eyebrow="OPERACIONES"
        title="Entregas"
        description="Coordina cada visita y conserva la constancia de quién recibió la mercancía."
        actions={createButton}
      />
      {data.profile.role === 'viewer' ? (
        <section className="panel">
          <EmptyState
            title="Entregas no disponibles para tu rol"
            description="Un administrador puede revisar tus permisos de acceso."
          />
        </section>
      ) : (
        <>
          <div className="stats-grid">
            <StatCard
              label="Pendientes para hoy"
              value={
                pending.filter(
                  (delivery) => businessDate(new Date(delivery.scheduled_at)) === today,
                ).length
              }
              hint="Hora de República Dominicana"
            />
            <StatCard
              label="En camino"
              value={deliveries.filter((delivery) => delivery.status === 'in_transit').length}
              hint="Esperando confirmación de recepción"
            />
            <StatCard
              label="Requieren seguimiento"
              value={deliveries.filter((delivery) => delivery.status === 'failed').length}
              hint="Intentos fallidos por reprogramar"
              tone="warning"
            />
            <StatCard
              label="Programadas con hora vencida"
              value={
                deliveries.filter(
                  (delivery) =>
                    delivery.status === 'scheduled' &&
                    new Date(delivery.scheduled_at).getTime() < now,
                ).length
              }
              hint="Revisa el horario o inicia la entrega"
            />
          </div>
          <section className="panel">
            <div className="toolbar operations-toolbar">
              <SearchInput
                value={query}
                onChange={setQuery}
                placeholder="Buscar venta, contacto, dirección o responsable…"
              />
              <select
                aria-label="Filtrar entregas por estado"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="all">Todos los estados</option>
                {Object.keys(deliveryActions).map((value) => (
                  <option key={value} value={value}>
                    {statusLabels[value]}
                  </option>
                ))}
              </select>
              <label className="operations-date-filter">
                <span>Fecha</span>
                <input
                  aria-label="Fecha de entrega en República Dominicana"
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                />
              </label>
              {(query || status !== 'all' || date) && (
                <button
                  className="button ghost"
                  onClick={() => {
                    setQuery('');
                    setStatus('all');
                    setDate('');
                  }}
                >
                  Limpiar filtros
                </button>
              )}
            </div>
            {!filtered.length ? (
              <EmptyState
                title={
                  deliveries.length
                    ? 'No hay entregas con estos filtros'
                    : 'Cada entrega, bajo control'
                }
                description={
                  deliveries.length
                    ? 'Prueba otra fecha, estado o contacto.'
                    : availableSales.length
                      ? 'Programa una entrega a partir de una venta confirmada.'
                      : data.permissions.sell
                        ? 'Las ventas confirmadas sin una entrega registrada aparecerán aquí para programar.'
                        : 'Aquí aparecerán las entregas que el equipo de ventas programe.'
                }
                action={!deliveries.length && availableSales.length ? createButton : undefined}
              />
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Venta y contacto</th>
                      <th>Programación</th>
                      <th>Destino</th>
                      <th>Estado</th>
                      <th>Responsable</th>
                      <th>
                        <span className="sr-only">Acciones</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((delivery) => {
                      const sale = saleMap.get(delivery.sale_id);
                      return (
                        <tr key={delivery.id}>
                          <td>
                            <strong>{sale ? documentNumber(sale) : 'Venta vinculada'}</strong>
                            <small className="operations-table-meta">{delivery.contact_name}</small>
                          </td>
                          <td>
                            {dateTime(delivery.scheduled_at)}
                            <small className="operations-table-meta">Hora de RD</small>
                          </td>
                          <td>
                            <span className="operations-address">{delivery.address}</span>
                            <small className="operations-table-meta">{delivery.phone}</small>
                          </td>
                          <td>
                            <StatusBadge status={delivery.status} />
                          </td>
                          <td>{delivery.assignee || 'Sin asignar'}</td>
                          <td>
                            <button
                              className="button ghost"
                              onClick={() => setSelectedId(delivery.id)}
                              aria-label={`Ver entrega a ${delivery.contact_name}`}
                            >
                              Ver entrega
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
      {creating && (
        <DeliveryEditor
          initialSaleId={params.get('venta') ?? undefined}
          onClose={() => {
            setCreating(false);
            closeContext();
          }}
        />
      )}
      {selected && (
        <DeliveryDetail
          key={selected.id}
          delivery={selected}
          onClose={() => {
            setSelectedId(null);
            closeContext();
          }}
        />
      )}
    </>
  );
}

function DeliveryEditor({
  delivery,
  initialSaleId,
  onClose,
}: {
  delivery?: Delivery;
  initialSaleId?: string;
  onClose: () => void;
}) {
  const { data, notify } = useRetail();
  const { run, busy, error, clearError } = useOperation();
  const now = useBusinessClock();
  const initialSale = data.documents.find(
    (sale) => sale.id === initialSaleId && saleIsCurrent(sale),
  );
  const initialCustomer = data.contacts.find((contact) => contact.id === initialSale?.contact_id);
  const [saleId, setSaleId] = useState(delivery?.sale_id ?? initialSale?.id ?? '');
  const [contact, setContact] = useState(
    delivery?.contact_name ?? (textSnapshot(initialSale, 'name') || initialCustomer?.name || ''),
  );
  const [address, setAddress] = useState(
    delivery?.address ?? (textSnapshot(initialSale, 'address') || initialCustomer?.address || ''),
  );
  const [phone, setPhone] = useState(
    delivery?.phone ?? (textSnapshot(initialSale, 'phone') || initialCustomer?.phone || ''),
  );
  const [scheduled, setScheduled] = useState(() =>
    businessInput(delivery?.scheduled_at ?? Date.now() + 2 * 3600000),
  );
  const [assignee, setAssignee] = useState(delivery?.assignee ?? '');
  const [notes, setNotes] = useState(delivery?.notes ?? '');
  const [validation, setValidation] = useState('');
  const [openedVersion] = useState(delivery?.updated_at);
  const sales = data.documents
    .filter(
      (sale) =>
        saleIsCurrent(sale) &&
        !data.deliveries.some(
          (item) =>
            item.sale_id === sale.id && item.id !== delivery?.id && item.status !== 'cancelled',
        ),
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const selectedSale = data.documents.find((sale) => sale.id === saleId);
  const latest = delivery && data.deliveries.find((item) => item.id === delivery.id);
  const changed = delivery && (!latest || latest.updated_at !== openedVersion);

  function selectSale(id: string) {
    setSaleId(id);
    const sale = sales.find((item) => item.id === id);
    const customer = data.contacts.find((item) => item.id === sale?.contact_id);
    setContact(textSnapshot(sale, 'name') || customer?.name || '');
    setAddress(textSnapshot(sale, 'address') || customer?.address || '');
    setPhone(textSnapshot(sale, 'phone') || customer?.phone || '');
    setValidation('');
    clearError();
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidation('');
    clearError();
    if (!canManageDeliveries(data)) {
      setValidation('Tu rol no permite guardar entregas.');
      return;
    }
    if (changed) {
      setValidation(
        'La entrega cambió mientras la editabas. Cierra esta ventana y vuelve a abrirla para revisar los datos actuales.',
      );
      return;
    }
    if (
      !saleId ||
      (!delivery && !sales.some((sale) => sale.id === saleId)) ||
      (selectedSale && !saleIsCurrent(selectedSale))
    ) {
      setValidation('Selecciona una venta vigente que no tenga otra entrega registrada.');
      return;
    }
    if (!contact.trim() || !address.trim() || !phone.trim()) {
      setValidation('Completa el contacto, el teléfono y la dirección de entrega.');
      return;
    }
    const instant = businessInstant(scheduled);
    if (
      !instant ||
      new Date(instant).getTime() < now - 86400000 ||
      new Date(instant).getTime() > now + 366 * 86400000
    ) {
      setValidation(
        'Selecciona un horario entre las últimas 24 horas y los próximos 366 días. Se utiliza la hora de República Dominicana.',
      );
      return;
    }
    try {
      await run('save_delivery', {
        ...(delivery ? { id: delivery.id, expected_updated_at: openedVersion } : {}),
        sale_id: saleId,
        contact_name: contact.trim(),
        address: address.trim(),
        phone: phone.trim(),
        scheduled_at: instant,
        assignee: assignee.trim(),
        notes: notes.trim(),
      });
      notify(delivery ? 'Entrega actualizada y programada.' : 'Entrega programada.');
      onClose();
    } catch (cause) {
      setValidation(errorMessage(cause));
    }
  }
  return (
    <Modal
      title={delivery ? 'Editar o reprogramar entrega' : 'Programar entrega'}
      onClose={() => {
        if (!busy) onClose();
      }}
      wide
    >
      <form className="stack" onSubmit={submit}>
        <fieldset className="operations-fields stack" disabled={busy}>
          {delivery ? (
            <p>
              Venta:{' '}
              <strong>{selectedSale ? documentNumber(selectedSale) : 'Venta vinculada'}</strong>. Al
              guardar, la entrega queda en estado <strong>Programada</strong>.
            </p>
          ) : (
            <Field
              label="Venta confirmada"
              hint="Solo ventas vigentes sin otra entrega registrada. Las entregas canceladas permiten una nueva programación."
            >
              <select required value={saleId} onChange={(event) => selectSale(event.target.value)}>
                <option value="">Selecciona una venta…</option>
                {sales.map((sale) => (
                  <option value={sale.id} key={sale.id}>
                    {documentNumber(sale)} · {saleCustomer(sale)} · {money(sale.total)}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <div className="form-grid">
            <Field label="Persona de contacto">
              <input
                required
                autoComplete="name"
                maxLength={200}
                value={contact}
                onChange={(event) => setContact(event.target.value)}
              />
            </Field>
            <Field label="Teléfono">
              <input
                required
                type="tel"
                autoComplete="tel"
                maxLength={60}
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
            </Field>
          </div>
          <Field label="Dirección y referencia">
            <textarea
              required
              autoComplete="street-address"
              maxLength={1000}
              rows={3}
              placeholder="Calle, número, sector, municipio y una referencia para llegar."
              value={address}
              onChange={(event) => setAddress(event.target.value)}
            />
          </Field>
          <div className="form-grid">
            <Field label="Fecha y hora de entrega" hint="Hora de República Dominicana (UTC−04:00).">
              <input
                required
                type="datetime-local"
                step={60}
                value={scheduled}
                onChange={(event) => setScheduled(event.target.value)}
              />
            </Field>
            <Field
              label="Responsable de la entrega"
              hint="Nombre del conductor o del equipo asignado."
            >
              <input
                maxLength={160}
                value={assignee}
                onChange={(event) => setAssignee(event.target.value)}
                placeholder="Ej. José / Ruta Santo Domingo Este"
              />
            </Field>
          </div>
          <Field label="Instrucciones para la entrega (opcional)">
            <textarea
              rows={3}
              maxLength={4000}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Ej. Llamar al llegar; edificio sin ascensor."
            />
          </Field>
        </fieldset>
        <ErrorNotice message={validation || error} />
        <div className="modal-footer">
          <button type="button" className="button secondary" disabled={busy} onClick={onClose}>
            Volver
          </button>
          <button
            className="button primary"
            disabled={busy || !saleId || !canManageDeliveries(data)}
          >
            {busy ? 'Guardando…' : delivery ? 'Guardar programación' : 'Programar entrega'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DeliveryDetail({ delivery, onClose }: { delivery: Delivery; onClose: () => void }) {
  const { data } = useRetail();
  const [mode, setMode] = useState<'detail' | 'edit'>('detail');
  const [transition, setTransition] = useState<DeliveryStatus | null>(null);
  const [whatsAppOpen, setWhatsAppOpen] = useState(false);
  const sale = data.documents.find((item) => item.id === delivery.sale_id);
  const canManage = canManageDeliveries(data) && (!sale || saleIsCurrent(sale));
  const actorName = (id: string | null) =>
    id === data.profile.id
      ? data.profile.display_name || data.profile.email
      : data.team.find((member) => member.user_id === id)?.display_name ||
        (id ? 'Usuario del equipo' : 'Sistema');
  if (whatsAppOpen && canManageDeliveries(data)) {
    return (
      <WhatsAppComposer
        title="Entrega por WhatsApp"
        contactName={delivery.contact_name}
        phone={delivery.phone}
        message={buildDeliveryWhatsAppMessage({
          delivery,
          sale,
          items: data.document_items.filter((item) => item.document_id === delivery.sale_id),
          businessName: data.settings.business_name,
        })}
        onClose={() => setWhatsAppOpen(false)}
      />
    );
  }
  if (mode === 'edit') return <DeliveryEditor delivery={delivery} onClose={onClose} />;
  if (transition)
    return (
      <DeliveryTransition
        delivery={delivery}
        status={transition}
        onClose={onClose}
        onBack={() => setTransition(null)}
      />
    );
  return (
    <Modal
      title={sale ? `Entrega · ${documentNumber(sale)}` : 'Detalle de entrega'}
      onClose={onClose}
      wide
    >
      <div className="stack">
        <div className="operations-detail-heading">
          <StatusBadge status={delivery.status} />
          <span className="muted">
            <CalendarDays size={16} /> {dateTime(delivery.scheduled_at)} · hora de RD
          </span>
        </div>
        <dl className="operations-detail-grid">
          <div>
            <dt>Contacto</dt>
            <dd>{delivery.contact_name}</dd>
          </div>
          <div>
            <dt>Teléfono</dt>
            <dd>{delivery.phone}</dd>
          </div>
          <div className="operations-full">
            <dt>Dirección</dt>
            <dd>{delivery.address}</dd>
          </div>
          <div>
            <dt>Responsable</dt>
            <dd>{delivery.assignee || 'Sin asignar'}</dd>
          </div>
          <div>
            <dt>Registrada</dt>
            <dd>{dateTime(delivery.created_at)}</dd>
          </div>
          {delivery.notes && (
            <div className="operations-full">
              <dt>Instrucciones</dt>
              <dd>{delivery.notes}</dd>
            </div>
          )}
          {delivery.received_by && (
            <div>
              <dt>Recibida por</dt>
              <dd>{delivery.received_by}</dd>
            </div>
          )}
          {delivery.delivered_at && (
            <div>
              <dt>Entregada</dt>
              <dd>{dateTime(delivery.delivered_at)}</dd>
            </div>
          )}
        </dl>
        {sale && !saleIsCurrent(sale) && (
          <p className="operations-callout">
            La venta vinculada ya no está vigente. El historial se conserva y no admite cambios de
            entrega.
          </p>
        )}
        {canManage && (
          <div className="operations-actions">
            {['scheduled', 'failed'].includes(delivery.status) && (
              <button className="button secondary" onClick={() => setMode('edit')}>
                <Pencil size={16} />
                Editar / reprogramar
              </button>
            )}
            {deliveryActions[delivery.status]
              .filter((status) => status !== 'scheduled')
              .map((status) => (
                <button
                  key={status}
                  className={`button ${status === 'cancelled' || status === 'failed' ? 'ghost' : 'primary'}`}
                  onClick={() => setTransition(status)}
                >
                  {status === 'in_transit' ? (
                    <Truck size={16} />
                  ) : status === 'delivered' ? (
                    <Check size={16} />
                  ) : null}
                  {actionLabels[status]}
                </button>
              ))}
          </div>
        )}
        <section aria-label="Historial de entrega">
          <h3>Historial de seguimiento</h3>
          {delivery.history.length ? (
            <ol className="operations-timeline">
              {[...delivery.history]
                .sort((a, b) => a.at.localeCompare(b.at))
                .map((event, index) => (
                  <li key={`${event.at}-${index}`}>
                    <div>
                      <StatusBadge status={event.status} />
                      <time dateTime={event.at}>{dateTime(event.at)}</time>
                    </div>
                    {event.note && <p>{event.note}</p>}
                    <small>{actorName(event.actor)}</small>
                  </li>
                ))}
            </ol>
          ) : (
            <p className="muted">No hay eventos registrados.</p>
          )}
        </section>
        <div className="modal-footer">
          {canManageDeliveries(data) && (
            <button className="button secondary" onClick={() => setWhatsAppOpen(true)}>
              <MessageCircle size={17} /> WhatsApp
            </button>
          )}
          <button className="button secondary" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </Modal>
  );
}

function DeliveryTransition({
  delivery,
  status,
  onClose,
  onBack,
}: {
  delivery: Delivery;
  status: DeliveryStatus;
  onClose: () => void;
  onBack: () => void;
}) {
  const { data, notify } = useRetail();
  const { run, busy, error, clearError } = useOperation();
  const [note, setNote] = useState('');
  const [receiver, setReceiver] = useState('');
  const [validation, setValidation] = useState('');
  const [openedStatus] = useState(delivery.status);
  const [openedVersion] = useState(delivery.updated_at);
  const reasonRequired = status === 'failed' || status === 'cancelled';
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidation('');
    clearError();
    const latest = data.deliveries.find((item) => item.id === delivery.id);
    const sale = data.documents.find((item) => item.id === delivery.sale_id);
    if (!canManageDeliveries(data)) {
      setValidation('Tu rol no permite actualizar entregas.');
      return;
    }
    if (
      !latest ||
      latest.status !== openedStatus ||
      !deliveryActions[latest.status].includes(status) ||
      (sale && !saleIsCurrent(sale))
    ) {
      setValidation(
        'La entrega o la venta cambió. Vuelve al detalle para revisar el estado actual.',
      );
      return;
    }
    if (reasonRequired && !note.trim()) {
      setValidation('Explica el motivo para dejar constancia en el historial.');
      return;
    }
    if (status === 'delivered' && !receiver.trim()) {
      setValidation('Indica el nombre de la persona que recibió la mercancía.');
      return;
    }
    try {
      await run('status_delivery', {
        id: delivery.id,
        expected_updated_at: openedVersion,
        status,
        note: note.trim(),
        ...(status === 'delivered' ? { received_by: receiver.trim() } : {}),
      });
      notify(
        status === 'delivered'
          ? 'Entrega confirmada con el nombre de quien recibió.'
          : `Entrega actualizada: ${statusLabels[status]?.toLowerCase()}.`,
      );
      onClose();
    } catch (cause) {
      setValidation(errorMessage(cause));
    }
  }
  return (
    <Modal
      title={actionLabels[status]}
      onClose={() => {
        if (!busy) onBack();
      }}
    >
      <form onSubmit={submit} className="stack">
        <p>
          Entrega a <strong>{delivery.contact_name}</strong> en {delivery.address}.
        </p>
        <fieldset disabled={busy} className="operations-fields stack">
          {status === 'delivered' && (
            <Field label="Nombre de quien recibió">
              <input
                required
                maxLength={200}
                autoComplete="name"
                value={receiver}
                onChange={(event) => setReceiver(event.target.value)}
                placeholder="Nombre completo"
              />
            </Field>
          )}
          <Field
            label={reasonRequired ? 'Motivo del cambio' : 'Observación (opcional)'}
            hint="Esta información quedará en el historial de la entrega."
          >
            <textarea
              required={reasonRequired}
              maxLength={1000}
              rows={4}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={
                status === 'failed'
                  ? 'Ej. No había nadie en la dirección; se llamó al contacto.'
                  : status === 'cancelled'
                    ? 'Explica por qué se cancela la entrega.'
                    : ''
              }
            />
          </Field>
          {status === 'cancelled' && (
            <p className="operations-callout">
              La cancelación conserva esta entrega en el historial. Podrás programar otra entrega
              para la misma venta.
            </p>
          )}
        </fieldset>
        <ErrorNotice message={validation || error} />
        <div className="modal-footer">
          <button type="button" className="button secondary" disabled={busy} onClick={onBack}>
            Volver al detalle
          </button>
          <button
            className={`button ${status === 'cancelled' ? 'danger' : 'primary'}`}
            disabled={busy}
          >
            {busy ? 'Guardando…' : actionLabels[status]}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function PromotionsPage() {
  const { data } = useRetail();
  const now = useBusinessClock();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [kind, setKind] = useState('all');
  const [editor, setEditor] = useState<Promotion | 'new' | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toggle, setToggle] = useState<Promotion | null>(null);
  const canManage = canManagePromotions(data);
  const canRead = data.permissions.sell && ['owner', 'admin', 'sales'].includes(data.profile.role);
  const selected = data.promotions.find((promotion) => promotion.id === selectedId);
  const filtered = [...data.promotions]
    .filter(
      (promotion) =>
        (status === 'all' || promotionState(promotion, now) === status) &&
        (kind === 'all' || promotion.kind === kind) &&
        matches(query, promotion.name, promotion.code, promotionScope(promotion)),
    )
    .sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  return (
    <>
      <PageHeader
        eyebrow="COMERCIAL"
        title="Promociones"
        description="Descuentos con fechas, códigos y productos definidos. Un cupón por documento."
        actions={
          canManage ? (
            <button className="button primary" onClick={() => setEditor('new')}>
              <Plus size={18} />
              Nueva promoción
            </button>
          ) : undefined
        }
      />
      {!canRead ? (
        <section className="panel">
          <EmptyState
            title="Promociones no disponibles para tu rol"
            description="El equipo de ventas y los administradores pueden consultar las promociones."
          />
        </section>
      ) : (
        <>
          <div className="stats-grid">
            <StatCard
              label="Vigentes ahora"
              value={
                data.promotions.filter((promotion) => promotionState(promotion, now) === 'current')
                  .length
              }
              hint="Activadas y dentro de su horario"
            />
            <StatCard
              label="Próximas"
              value={
                data.promotions.filter((promotion) => promotionState(promotion, now) === 'upcoming')
                  .length
              }
              hint="Se habilitan al comenzar su vigencia"
            />
            <StatCard
              label="Desactivadas"
              value={data.promotions.filter((promotion) => !promotion.active).length}
              hint="No se pueden aplicar al vender"
            />
          </div>
          <section className="panel">
            <div className="toolbar operations-toolbar">
              <SearchInput
                value={query}
                onChange={setQuery}
                placeholder="Buscar promoción, código o alcance…"
              />
              <select
                aria-label="Filtrar promociones por vigencia"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="all">Todos los estados</option>
                {Object.entries(promotionLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <select
                aria-label="Filtrar por tipo de descuento"
                value={kind}
                onChange={(event) => setKind(event.target.value)}
              >
                <option value="all">Todos los descuentos</option>
                <option value="percent">Porcentaje</option>
                <option value="fixed">Monto fijo</option>
              </select>
              {(query || status !== 'all' || kind !== 'all') && (
                <button
                  className="button ghost"
                  onClick={() => {
                    setQuery('');
                    setStatus('all');
                    setKind('all');
                  }}
                >
                  Limpiar filtros
                </button>
              )}
            </div>
            {!filtered.length ? (
              <EmptyState
                title={
                  data.promotions.length
                    ? 'No hay promociones con estos filtros'
                    : 'Prepara tu próxima promoción'
                }
                description={
                  data.promotions.length
                    ? 'Prueba otro código, tipo de descuento o estado.'
                    : canManage
                      ? 'Define un descuento, su horario y los productos a los que aplica.'
                      : 'Las promociones aparecerán cuando un administrador las cree.'
                }
                action={
                  !data.promotions.length && canManage ? (
                    <button className="button primary" onClick={() => setEditor('new')}>
                      Crear promoción
                    </button>
                  ) : undefined
                }
              />
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Promoción y código</th>
                      <th>Descuento</th>
                      <th>Alcance</th>
                      <th>Vigencia · hora de RD</th>
                      <th>Estado</th>
                      <th>
                        <span className="sr-only">Acciones</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((promotion) => (
                      <tr key={promotion.id}>
                        <td>
                          <strong>{promotion.name}</strong>
                          <small className="operations-table-meta">
                            {promotion.code || 'Sin cupón asignado'}
                          </small>
                        </td>
                        <td>
                          {promotion.kind === 'percent'
                            ? `${promotion.value}%`
                            : money(promotion.value)}
                          <small className="operations-table-meta">
                            {promotion.kind === 'percent'
                              ? 'Sobre productos elegibles'
                              : 'Hasta el subtotal elegible'}
                          </small>
                        </td>
                        <td>{promotionScope(promotion)}</td>
                        <td>
                          {dateTime(promotion.starts_at)}
                          <small className="operations-table-meta">
                            Hasta {dateTime(promotion.ends_at)}
                          </small>
                        </td>
                        <td>
                          <PromotionBadge promotion={promotion} now={now} />
                        </td>
                        <td>
                          <div className="operations-row-actions">
                            <button
                              className="button ghost"
                              onClick={() => setSelectedId(promotion.id)}
                              aria-label={`Ver promoción ${promotion.name}`}
                            >
                              Ver
                            </button>
                            {canManage && (
                              <>
                                <button
                                  className="button ghost"
                                  onClick={() => setEditor(promotion)}
                                  aria-label={`Editar promoción ${promotion.name}`}
                                >
                                  Editar
                                </button>
                                <button
                                  className="button ghost"
                                  onClick={() => setToggle(promotion)}
                                  aria-label={`${promotion.active ? 'Desactivar' : 'Activar'} promoción ${promotion.name}`}
                                >
                                  {promotion.active ? 'Desactivar' : 'Activar'}
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
      {editor && (
        <PromotionEditor
          key={editor === 'new' ? 'new' : editor.id}
          promotion={editor === 'new' ? undefined : editor}
          onClose={() => setEditor(null)}
        />
      )}
      {selected && (
        <PromotionDetail
          promotion={selected}
          now={now}
          onClose={() => setSelectedId(null)}
          onEdit={
            canManage
              ? () => {
                  setSelectedId(null);
                  setEditor(selected);
                }
              : undefined
          }
        />
      )}
      {toggle && <PromotionToggle promotion={toggle} now={now} onClose={() => setToggle(null)} />}
    </>
  );
}

function PromotionBadge({ promotion, now }: { promotion: Promotion; now: number }) {
  const state = promotionState(promotion, now);
  return <span className={`badge operations-promo-${state}`}>{promotionLabels[state]}</span>;
}

function PromotionDetail({
  promotion,
  now,
  onClose,
  onEdit,
}: {
  promotion: Promotion;
  now: number;
  onClose: () => void;
  onEdit?: () => void;
}) {
  const { data } = useRetail();
  return (
    <Modal title={promotion.name} onClose={onClose}>
      <div className="stack">
        <div className="operations-detail-heading">
          <PromotionBadge promotion={promotion} now={now} />
          <strong>
            {promotion.kind === 'percent'
              ? `${promotion.value}% de descuento`
              : `${money(promotion.value)} de descuento`}
          </strong>
        </div>
        <dl className="operations-detail-grid">
          <div>
            <dt>Código del cupón</dt>
            <dd>{promotion.code || 'Sin código asignado'}</dd>
          </div>
          <div>
            <dt>Alcance</dt>
            <dd>{promotionScope(promotion)}</dd>
          </div>
          <div>
            <dt>Comienza · hora de RD</dt>
            <dd>{dateTime(promotion.starts_at)}</dd>
          </div>
          <div>
            <dt>Finaliza · hora de RD</dt>
            <dd>{dateTime(promotion.ends_at)}</dd>
          </div>
        </dl>
        {promotion.product_ids.length > 0 && (
          <section>
            <h3>Productos seleccionados</h3>
            <ul className="operations-product-summary">
              {promotion.product_ids.map((id) => {
                const product = data.products.find((item) => item.id === id);
                return (
                  <li key={id}>
                    {product
                      ? `${product.brand} ${product.model}${product.active ? '' : ' (archivado)'}`
                      : 'Producto no disponible en esta vista'}
                    {product && promotion.category && product.category !== promotion.category && (
                      <small className="operations-table-meta">
                        No coincide con la categoría; actualmente no recibe el descuento.
                      </small>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        <p className="operations-callout">
          {promotion.code
            ? 'Introduce el código al crear una venta o cotización. '
            : 'Asigna un código para poder aplicar esta promoción al crear una venta o cotización. '}
          {promotion.kind === 'fixed'
            ? 'El monto se limita al subtotal de los productos elegibles. '
            : ''}
          {promotion.category && promotion.product_ids.length
            ? 'Solo aplica a los productos seleccionados que pertenecen a la categoría indicada. '
            : ''}
          No se acumula con otro cupón ni con un descuento manual.
        </p>
        <div className="modal-footer">
          <button className="button secondary" onClick={onClose}>
            Cerrar
          </button>
          {onEdit && (
            <button className="button primary" onClick={onEdit}>
              <Pencil size={16} />
              Editar promoción
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

function PromotionEditor({ promotion, onClose }: { promotion?: Promotion; onClose: () => void }) {
  const { data, notify } = useRetail();
  const { run, busy, error, clearError } = useOperation();
  const [name, setName] = useState(promotion?.name ?? '');
  const [code, setCode] = useState(promotion?.code ?? '');
  const [kind, setKind] = useState<Promotion['kind']>(promotion?.kind ?? 'percent');
  const [value, setValue] = useState(String(promotion?.value ?? 10));
  const [starts, setStarts] = useState(() => businessInput(promotion?.starts_at ?? Date.now()));
  const [ends, setEnds] = useState(() =>
    businessInput(promotion?.ends_at ?? Date.now() + 7 * 86400000),
  );
  const [active, setActive] = useState(promotion?.active ?? true);
  const [scope, setScope] = useState<PromotionScope>(
    promotion?.category
      ? promotion.product_ids.length
        ? 'combined'
        : 'category'
      : promotion?.product_ids.length
        ? 'products'
        : 'all',
  );
  const [category, setCategory] = useState(promotion?.category ?? '');
  const [productIds, setProductIds] = useState<string[]>(promotion?.product_ids ?? []);
  const [query, setQuery] = useState('');
  const [validation, setValidation] = useState('');
  const usesCategory = scope === 'category' || scope === 'combined';
  const usesProducts = scope === 'products' || scope === 'combined';
  const categories = [
    ...new Set([
      ...data.products.map((product) => product.category),
      ...(promotion?.category ? [promotion.category] : []),
    ]),
  ].sort((a, b) => categoryName(a).localeCompare(categoryName(b), 'es'));
  const products = data.products
    .filter(
      (product) =>
        (product.active || productIds.includes(product.id)) &&
        matches(query, product.brand, product.model, categoryName(product.category)),
    )
    .sort((a, b) => `${a.brand} ${a.model}`.localeCompare(`${b.brand} ${b.model}`, 'es'));
  const selectedProducts = data.products.filter((product) => productIds.includes(product.id));
  const latest = promotion && data.promotions.find((item) => item.id === promotion.id);
  const changed = promotion && (!latest || latest.updated_at !== promotion.updated_at);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidation('');
    clearError();
    if (!canManagePromotions(data)) {
      setValidation('Solo un administrador puede guardar promociones.');
      return;
    }
    if (changed) {
      setValidation(
        'Esta promoción cambió mientras la editabas. Cierra la ventana y vuelve a abrirla para revisar la versión actual.',
      );
      return;
    }
    if (!name.trim()) {
      setValidation('Escribe un nombre para la promoción.');
      return;
    }
    const amount = Number(value);
    if (
      !value.trim() ||
      !Number.isFinite(amount) ||
      amount < 0.01 ||
      amount > (kind === 'percent' ? 100 : 999999999.99)
    ) {
      setValidation(
        kind === 'percent'
          ? 'El porcentaje debe ser mayor que cero y no superar el 100%.'
          : 'Ingresa un monto válido entre RD$0.01 y RD$999,999,999.99.',
      );
      return;
    }
    const start = businessInstant(starts);
    const end = businessInstant(ends);
    if (!start || !end || new Date(end).getTime() <= new Date(start).getTime()) {
      setValidation(
        'Selecciona una fecha final posterior al inicio. Las horas corresponden a República Dominicana.',
      );
      return;
    }
    if (
      code.trim() &&
      data.promotions.some(
        (item) =>
          item.id !== promotion?.id &&
          item.code?.toLocaleUpperCase() === code.trim().toLocaleUpperCase(),
      )
    ) {
      setValidation('Ese código ya pertenece a otra promoción. Usa uno diferente.');
      return;
    }
    if (usesCategory && !category) {
      setValidation('Selecciona la categoría a la que aplica el descuento.');
      return;
    }
    if (
      usesProducts &&
      (!productIds.length ||
        productIds.length > 200 ||
        selectedProducts.length !== productIds.length)
    ) {
      setValidation('Selecciona entre 1 y 200 productos válidos.');
      return;
    }
    if (
      scope === 'combined' &&
      !selectedProducts.some((product) => product.category === category)
    ) {
      setValidation(
        'Ningún producto seleccionado pertenece a esa categoría. Revisa el alcance del descuento.',
      );
      return;
    }
    try {
      await run('save_promotion', {
        ...(promotion ? { id: promotion.id, expected_updated_at: promotion.updated_at } : {}),
        name: name.trim(),
        code: code.trim().toUpperCase(),
        kind,
        value: amount,
        starts_at: start,
        ends_at: end,
        active,
        category: usesCategory ? category : '',
        product_ids: usesProducts ? productIds : [],
      });
      notify(promotion ? 'Promoción actualizada.' : 'Promoción creada.');
      onClose();
    } catch (cause) {
      setValidation(errorMessage(cause));
    }
  }
  return (
    <Modal
      title={promotion ? 'Editar promoción' : 'Nueva promoción'}
      onClose={() => {
        if (!busy) onClose();
      }}
      wide
    >
      <form onSubmit={submit} className="stack">
        <fieldset disabled={busy} className="operations-fields stack">
          <div className="form-grid">
            <Field label="Nombre de la promoción">
              <input
                required
                maxLength={160}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ej. Especial del fin de semana"
              />
            </Field>
            <Field
              label="Código del cupón (opcional)"
              hint="Asigna un código para aplicarla en ventas o cotizaciones."
            >
              <input
                maxLength={60}
                autoCapitalize="characters"
                autoComplete="off"
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder="Ej. FINDE10"
              />
            </Field>
            <Field label="Tipo de descuento">
              <select
                value={kind}
                onChange={(event) => setKind(event.target.value === 'fixed' ? 'fixed' : 'percent')}
              >
                <option value="percent">Porcentaje</option>
                <option value="fixed">Monto fijo en RD$</option>
              </select>
            </Field>
            <Field
              label={kind === 'percent' ? 'Porcentaje (%)' : 'Monto (RD$)'}
              hint={
                kind === 'fixed'
                  ? 'No excederá el subtotal de los productos elegibles.'
                  : 'Se calcula sobre el subtotal de los productos elegibles.'
              }
            >
              <input
                required
                type="number"
                min="0.01"
                max={kind === 'percent' ? 100 : 999999999.99}
                step="0.01"
                value={value}
                onChange={(event) => setValue(event.target.value)}
              />
            </Field>
            <Field label="Inicio · hora de RD">
              <input
                required
                type="datetime-local"
                step={60}
                value={starts}
                onChange={(event) => setStarts(event.target.value)}
              />
            </Field>
            <Field label="Final · hora de RD">
              <input
                required
                type="datetime-local"
                step={60}
                value={ends}
                onChange={(event) => setEnds(event.target.value)}
              />
            </Field>
          </div>
          <p className="muted operations-timezone">
            <Clock3 size={16} /> Todas las fechas usan la hora de República Dominicana (UTC−04:00).
          </p>
          <div className="form-grid">
            <Field label="Aplica a">
              <select
                value={scope}
                onChange={(event) => {
                  const next = event.target.value;
                  if (
                    next === 'all' ||
                    next === 'category' ||
                    next === 'products' ||
                    next === 'combined'
                  )
                    setScope(next);
                }}
              >
                <option value="all">Todo el catálogo</option>
                <option value="category">Una categoría</option>
                <option value="products">Productos seleccionados</option>
                <option value="combined">Productos seleccionados de una categoría</option>
              </select>
            </Field>
            {usesCategory && (
              <Field label="Categoría">
                <select
                  required
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                >
                  <option value="">Selecciona una categoría…</option>
                  {categories.map((item) => (
                    <option key={item} value={item}>
                      {categoryName(item)}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>
          {usesProducts && (
            <section className="operations-product-picker" aria-label="Seleccionar productos">
              <div className="operations-picker-heading">
                <h3>Productos incluidos</h3>
                <span>{productIds.length} de 200 seleccionados</span>
              </div>
              <SearchInput
                value={query}
                onChange={setQuery}
                placeholder="Buscar marca, modelo o categoría…"
              />
              {scope === 'combined' && (
                <p className="muted">
                  Solo se descontarán los productos seleccionados que pertenezcan a{' '}
                  {category ? categoryName(category) : 'la categoría elegida'}.
                </p>
              )}
              <div className="operations-product-options">
                {products.length ? (
                  products.map((product) => (
                    <label key={product.id} className="operations-product-option">
                      <input
                        type="checkbox"
                        checked={productIds.includes(product.id)}
                        disabled={
                          !productIds.includes(product.id) &&
                          (!product.active || productIds.length >= 200)
                        }
                        onChange={(event) =>
                          setProductIds((ids) =>
                            event.target.checked
                              ? [...ids, product.id]
                              : ids.filter((id) => id !== product.id),
                          )
                        }
                      />
                      <span>
                        <strong>
                          {product.brand} {product.model}
                        </strong>
                        <small>
                          {categoryName(product.category)}
                          {!product.active ? ' · Archivado' : ''}
                          {usesCategory && category && product.category !== category
                            ? ' · Fuera de la categoría elegida'
                            : ''}
                        </small>
                      </span>
                    </label>
                  ))
                ) : (
                  <p className="muted">No hay productos que coincidan con la búsqueda.</p>
                )}
              </div>
            </section>
          )}
          <label className="operations-checkbox">
            <input
              type="checkbox"
              checked={active}
              onChange={(event) => setActive(event.target.checked)}
            />
            <span>
              <strong>Promoción activada</strong>
              <small>
                Solo podrá aplicarse dentro de las fechas indicadas y con un código asignado.
              </small>
            </span>
          </label>
          <p className="operations-callout">
            <Tag size={17} /> Se aplica un cupón por documento. Este descuento no se acumula con un
            descuento manual.
          </p>
        </fieldset>
        <ErrorNotice message={validation || error} />
        <div className="modal-footer">
          <button type="button" className="button secondary" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <button className="button primary" disabled={busy || !canManagePromotions(data)}>
            {busy ? 'Guardando…' : promotion ? 'Guardar cambios' : 'Crear promoción'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function PromotionToggle({
  promotion,
  now,
  onClose,
}: {
  promotion: Promotion;
  now: number;
  onClose: () => void;
}) {
  const { data, notify } = useRetail();
  const { run, busy, error, clearError } = useOperation();
  const [validation, setValidation] = useState('');
  const nextActive = !promotion.active;
  const nextState = promotionState({ ...promotion, active: nextActive }, now);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearError();
    setValidation('');
    if (!canManagePromotions(data)) {
      setValidation('Tu rol no permite cambiar promociones.');
      return;
    }
    const latest = data.promotions.find((item) => item.id === promotion.id);
    if (!latest || latest.updated_at !== promotion.updated_at) {
      setValidation(
        'La promoción cambió. Cierra esta ventana y revisa los datos actuales antes de continuar.',
      );
      return;
    }
    try {
      await run('save_promotion', promotionPayload(promotion, nextActive));
      notify(
        nextActive
          ? 'Promoción activada; se aplicará según su vigencia.'
          : 'Promoción desactivada.',
      );
      onClose();
    } catch (cause) {
      setValidation(errorMessage(cause));
    }
  }
  return (
    <Modal
      title={`${nextActive ? 'Activar' : 'Desactivar'} promoción`}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form className="stack" onSubmit={submit}>
        <p>
          {nextActive ? 'Se activará' : 'Se desactivará'} <strong>{promotion.name}</strong>.
        </p>
        {nextActive && nextState === 'expired' ? (
          <p className="operations-callout">
            La fecha final ya pasó. Aunque la actives, seguirá vencida hasta que edites sus fechas.
          </p>
        ) : nextActive && nextState === 'upcoming' ? (
          <p className="operations-callout">
            Comenzará a estar disponible el {dateTime(promotion.starts_at)}, hora de RD.
          </p>
        ) : !nextActive ? (
          <p className="muted">
            No se podrá aplicar en nuevos documentos. Los descuentos ya registrados se conservarán.
          </p>
        ) : (
          <p className="muted">La promoción está dentro de su vigencia actual.</p>
        )}
        {nextActive && !promotion.code && (
          <p className="operations-callout">
            Todavía no tiene código. Asígnale uno para poder aplicarla al vender.
          </p>
        )}
        <ErrorNotice message={validation || error} />
        <div className="modal-footer">
          <button type="button" className="button secondary" disabled={busy} onClick={onClose}>
            Volver
          </button>
          <button className={`button ${nextActive ? 'primary' : 'danger'}`} disabled={busy}>
            {busy ? 'Guardando…' : nextActive ? 'Activar promoción' : 'Desactivar promoción'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
