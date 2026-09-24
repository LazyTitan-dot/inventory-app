import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  ClipboardList,
  FileText,
  Package,
  Pencil,
  Plus,
  Printer,
  RotateCcw,
  Search,
  ShoppingBag,
  Trash2,
  Truck,
} from 'lucide-react';
import type { DocumentItem, RetailData, RetailDocument } from '../lib/contracts';
import {
  businessDate,
  categoryName,
  dateTime,
  documentNumber,
  matches,
  money,
  paymentLabels,
  shortDate,
  statusLabels,
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
import { ProductImage } from '../components/ProductImage';
import './commerce.css';

type Kind = 'sale' | 'purchase' | 'quote';
type CartLine = { variantId: string; quantity: number; expectedPrice: number; unitCost: number };
type DetailMode =
  | 'detail'
  | 'receive'
  | 'convert'
  | 'cancel'
  | 'void'
  | 'cancel_quote'
  | 'confirm_draft'
  | 'link_item';
const labels = {
  sale: {
    title: 'Ventas',
    description: 'Del mostrador al inventario, cada venta queda registrada.',
    create: 'Nueva venta',
    singular: 'venta',
    icon: ShoppingBag,
  },
  purchase: {
    title: 'Compras',
    description: 'Ordena, recibe por partes y conoce lo que falta por llegar.',
    create: 'Nueva orden',
    singular: 'orden de compra',
    icon: Truck,
  },
  quote: {
    title: 'Cotizaciones',
    description: 'Prepara una propuesta y conviértela en venta cuando esté lista.',
    create: 'Nueva cotización',
    singular: 'cotización',
    icon: FileText,
  },
};
const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const contactName = (doc: RetailDocument) =>
  String(
    doc.contact_snapshot.name || (doc.type === 'purchase' ? 'Proveedor' : 'Cliente de mostrador'),
  );
const itemTitle = (item: DocumentItem) =>
  `${item.product_snapshot.brand} ${item.product_snapshot.model}`.trim();
const permittedCreate = (data: RetailData, kind: Kind) =>
  kind === 'purchase' ? data.permissions.purchase : data.permissions.sell;
const quoteExpired = (doc: RetailDocument, now: number) =>
  doc.status === 'open' && Boolean(doc.expires_at && new Date(doc.expires_at).getTime() <= now);
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

export function CommercePage({ kind }: { kind: Kind }) {
  const { data } = useRetail();
  const now = useNow();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [params, setParams] = useSearchParams();
  const creating = params.get('nuevo') === '1';
  const selectedId = params.get('documento');
  const setCreating = (open: boolean) => {
    const next = new URLSearchParams(params);
    next.delete('editar');
    if (open) {
      next.set('nuevo', '1');
      next.delete('documento');
    } else {
      next.delete('nuevo');
      next.delete('contacto');
    }
    setParams(next);
  };
  const setSelectedId = (id: string | null) => {
    const next = new URLSearchParams(params);
    next.delete('nuevo');
    next.delete('contacto');
    next.delete('editar');
    if (id) next.set('documento', id);
    else next.delete('documento');
    setParams(next);
  };
  const details = labels[kind];
  const documents = data.documents
    .filter((doc) => doc.type === kind)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const statuses = [
    ...new Set(documents.map((doc) => (quoteExpired(doc, now) ? 'expired' : doc.status))),
  ];
  const filtered = documents.filter(
    (doc) =>
      (status === 'all' || (quoteExpired(doc, now) ? 'expired' : doc.status) === status) &&
      matches(query, documentNumber(doc), contactName(doc), doc.notes),
  );
  const selected = data.documents.find((doc) => doc.id === selectedId);
  const editingQuote =
    params.get('editar') === '1' &&
    selected?.type === 'quote' &&
    selected.status === 'open' &&
    data.permissions.sell
      ? selected
      : undefined;
  const pending = documents.filter((doc) =>
    kind === 'purchase'
      ? ['pending', 'partial'].includes(doc.status)
      : kind === 'quote'
        ? doc.status === 'open' && !quoteExpired(doc, now)
        : ['completed', 'partially_returned'].includes(doc.status),
  );
  const incoming = data.document_items
    .filter((item) => pending.some((doc) => doc.id === item.document_id))
    .reduce((sum, item) => sum + item.quantity - item.received_quantity, 0);
  const today = businessDate(new Date(now));
  const todayDocuments = documents.filter(
    (doc) =>
      businessDate(new Date(doc.created_at)) === today &&
      (kind === 'sale'
        ? ['completed', 'partially_returned', 'returned'].includes(doc.status)
        : !['draft', 'cancelled', 'voided'].includes(doc.status)),
  );

  return (
    <>
      <PageHeader
        eyebrow="OPERACIONES"
        title={details.title}
        description={details.description}
        actions={
          permittedCreate(data, kind) ? (
            <button className="button primary" onClick={() => setCreating(true)}>
              <Plus size={18} />
              {details.create}
            </button>
          ) : undefined
        }
      />
      {selectedId && !selected && (
        <ErrorNotice message="El documento solicitado no está disponible. Puede que tu rol no tenga acceso o que debas actualizar los datos." />
      )}
      <div className="stats-grid commerce-stats">
        <StatCard
          label={
            kind === 'purchase'
              ? 'Órdenes abiertas'
              : kind === 'quote'
                ? 'Cotizaciones vigentes'
                : 'Ventas de hoy'
          }
          value={kind === 'sale' ? todayDocuments.length : pending.length}
          hint={
            kind === 'sale' ? 'Incluye ventas con devolución parcial' : 'Pendientes de completar'
          }
        />
        <StatCard
          label={
            kind === 'purchase'
              ? 'Unidades por recibir'
              : kind === 'quote'
                ? 'Valor de propuestas vigentes'
                : 'Importe vendido hoy'
          }
          value={
            kind === 'purchase'
              ? incoming
              : money(
                  (kind === 'sale' ? todayDocuments : pending).reduce(
                    (sum, doc) => sum + doc.total,
                    0,
                  ),
                )
          }
          hint={
            kind === 'sale'
              ? 'Importe original; devoluciones en Reportes'
              : kind === 'purchase'
                ? 'Solo cantidades pendientes'
                : 'Sin reserva de inventario'
          }
        />
        <StatCard
          label="Documentos registrados"
          value={documents.length}
          hint="Historial conservado"
        />
      </div>
      <section className="panel">
        <div className="toolbar commerce-toolbar">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Buscar número, contacto o nota…"
          />
          <select
            aria-label="Filtrar por estado"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="all">Todos los estados</option>
            {statuses.map((value) => (
              <option key={value} value={value}>
                {value === 'expired' ? 'Vencida' : statusLabels[value] || value}
              </option>
            ))}
          </select>
          <span className="muted commerce-result-count">
            {filtered.length} {filtered.length === 1 ? 'documento' : 'documentos'}
          </span>
        </div>
        {!filtered.length ? (
          <EmptyState
            title={
              documents.length
                ? 'No hay coincidencias'
                : `Aún no hay ${details.title.toLowerCase()}`
            }
            description={
              documents.length
                ? 'Prueba otro número, contacto o estado.'
                : `Crea tu primera ${details.singular} para comenzar.`
            }
            action={
              documents.length ? (
                <button
                  className="button secondary"
                  onClick={() => {
                    setQuery('');
                    setStatus('all');
                  }}
                >
                  Limpiar filtros
                </button>
              ) : permittedCreate(data, kind) ? (
                <button className="button primary" onClick={() => setCreating(true)}>
                  {details.create}
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Documento</th>
                  <th>{kind === 'purchase' ? 'Proveedor' : 'Cliente'}</th>
                  <th>Fecha</th>
                  <th>Estado</th>
                  <th className="number">Total</th>
                  <th>
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((doc) => (
                  <tr key={doc.id}>
                    <td>
                      <strong>{documentNumber(doc)}</strong>
                      {kind === 'quote' && doc.expires_at && (
                        <small className="commerce-table-meta">
                          Vence {shortDate(doc.expires_at)}
                        </small>
                      )}
                    </td>
                    <td>{contactName(doc)}</td>
                    <td>{shortDate(doc.created_at)}</td>
                    <td>
                      {quoteExpired(doc, now) ? (
                        <span className="badge commerce-warning">Vencida</span>
                      ) : (
                        <StatusBadge status={doc.status} />
                      )}
                    </td>
                    <td className="number">{money(doc.total)}</td>
                    <td>
                      <button
                        className="button ghost"
                        onClick={() => setSelectedId(doc.id)}
                        aria-label={`Ver ${documentNumber(doc)}`}
                      >
                        Ver detalle
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {creating && permittedCreate(data, kind) && (
        <CreateDocument
          key={kind}
          kind={kind}
          initialContactId={params.get('contacto') ?? ''}
          onClose={() => setCreating(false)}
          onCreated={(id) => setSelectedId(id)}
        />
      )}
      {editingQuote ? (
        <CreateDocument
          key={`edit-${editingQuote.id}`}
          kind="quote"
          editingDocument={editingQuote}
          initialContactId={editingQuote.contact_id ?? ''}
          onClose={() => setSelectedId(editingQuote.id)}
          onCreated={setSelectedId}
        />
      ) : (
        selected && (
          <DocumentDetail
            key={selected.id}
            document={selected}
            onClose={() => setSelectedId(null)}
            onSelect={setSelectedId}
            onEdit={() => {
              const next = new URLSearchParams(params);
              next.delete('nuevo');
              next.set('editar', '1');
              setParams(next);
            }}
          />
        )
      )}
    </>
  );
}

function CreateDocument({
  kind,
  initialContactId,
  editingDocument,
  onClose,
  onCreated,
}: {
  kind: Kind;
  initialContactId: string;
  editingDocument?: RetailDocument;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { data, notify, refresh } = useRetail();
  const { run, busy, error, clearError } = useOperation();
  const now = useNow();
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [cart, setCart] = useState<CartLine[]>(() =>
    editingDocument
      ? data.document_items
          .filter((item) => item.document_id === editingDocument.id)
          .map((item) => ({
            variantId: item.variant_id ?? '',
            quantity: item.quantity,
            expectedPrice: item.unit_price,
            unitCost: item.unit_cost ?? 0,
          }))
      : [],
  );
  const [openedVersion] = useState(editingDocument?.updated_at);
  const [taxRate, setTaxRate] = useState(editingDocument?.tax_rate ?? data.settings.tax_rate);
  const [contactId, setContactId] = useState(initialContactId);
  const [payment, setPayment] = useState('cash');
  const [tendered, setTendered] = useState('');
  const [discount, setDiscount] = useState(String(editingDocument?.discount ?? 0));
  const [coupon, setCoupon] = useState(
    () =>
      data.promotions.find((promotion) => promotion.id === editingDocument?.promotion_id)?.code ??
      '',
  );
  const [notes, setNotes] = useState(editingDocument?.notes ?? '');
  const [expires, setExpires] = useState(() =>
    businessDate(new Date(editingDocument?.expires_at ?? Date.now() + 15 * 86400000)),
  );
  const [validation, setValidation] = useState('');
  const stock = new Map(data.stocks.map((item) => [item.variant_id, item.available]));
  const products = new Map(data.products.map((product) => [product.id, product]));
  const variants = data.variants.filter(
    (variant) => variant.active && products.get(variant.product_id)?.active,
  );
  const categories = [
    ...new Set(variants.map((variant) => products.get(variant.product_id)?.category || 'other')),
  ];
  const filtered = variants.filter((variant) => {
    const product = products.get(variant.product_id);
    return (
      (category === 'all' || product?.category === category) &&
      matches(query, variant.sku, variant.barcode, variant.name, product?.brand, product?.model)
    );
  });
  const contacts = data.contacts.filter(
    (contact) => contact.active && contact.kind === (kind === 'purchase' ? 'supplier' : 'customer'),
  );
  const subtotal = round(
    cart.reduce(
      (sum, line) =>
        sum + line.quantity * (kind === 'purchase' ? line.unitCost : line.expectedPrice),
      0,
    ),
  );
  const promotion = coupon.trim()
    ? data.promotions.find(
        (promo) =>
          promo.code?.toLowerCase() === coupon.trim().toLowerCase() &&
          promo.active &&
          new Date(promo.starts_at).getTime() <= now &&
          new Date(promo.ends_at).getTime() > now,
      )
    : undefined;
  const eligible = promotion
    ? round(
        cart.reduce((sum, line) => {
          const variant = data.variants.find((v) => v.id === line.variantId);
          const product = variant && products.get(variant.product_id);
          return product &&
            (!promotion.category || promotion.category === product.category) &&
            (!promotion.product_ids.length || promotion.product_ids.includes(product.id))
            ? sum + line.expectedPrice * line.quantity
            : sum;
        }, 0),
      )
    : 0;
  const discountAmount =
    kind === 'purchase'
      ? 0
      : promotion
        ? round(
            promotion.kind === 'percent'
              ? (eligible * promotion.value) / 100
              : Math.min(eligible, promotion.value),
          )
        : Math.min(subtotal, Math.max(0, Number(discount) || 0));
  const tax =
    kind === 'purchase' ? 0 : round((Math.max(0, subtotal - discountAmount) * taxRate) / 100);
  const total = round(subtotal - discountAmount + tax);
  const change = payment === 'cash' ? Math.max(0, round(Number(tendered) - total)) : 0;
  const maxDiscount = data.permissions.manage_business
    ? subtotal
    : round((subtotal * data.settings.max_sale_discount_percent) / 100);
  const changedPrices =
    kind !== 'purchase' &&
    cart.some(
      (line) =>
        data.variants.find((variant) => variant.id === line.variantId)?.price !==
        line.expectedPrice,
    );
  const changedDocument = Boolean(editingDocument && editingDocument.updated_at !== openedVersion);
  const changedTax =
    kind !== 'purchase' && !data.permissions.manage_business && taxRate !== data.settings.tax_rate;

  async function refreshCatalog() {
    setRefreshing(true);
    try {
      await refresh();
      setValidation('');
    } catch {
      setValidation('No se pudo actualizar el catálogo. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setRefreshing(false);
    }
  }

  function addVariant(id: string) {
    const variant = variants.find((v) => v.id === id);
    if (!variant) return false;
    if (kind !== 'purchase' && variant.price <= 0) {
      setValidation(
        'Este artículo tiene el precio pendiente. Completa su precio en Inventario antes de venderlo o cotizarlo.',
      );
      return false;
    }
    const inCart = cart.find((line) => line.variantId === id)?.quantity || 0;
    if (kind === 'sale' && inCart >= (stock.get(id) || 0)) {
      setValidation('No quedan más unidades disponibles de esta variante para agregar.');
      return false;
    }
    setCart((lines) =>
      lines.some((line) => line.variantId === id)
        ? lines.map((line) =>
            line.variantId === id ? { ...line, quantity: line.quantity + 1 } : line,
          )
        : [
            ...lines,
            {
              variantId: id,
              quantity: 1,
              expectedPrice: variant.price,
              unitCost: variant.cost ?? 0,
            },
          ],
    );
    setValidation('');
    return true;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearError();
    setValidation('');
    if (refreshing) return;
    if (changedDocument) {
      setValidation(
        'Esta cotización cambió mientras la editabas. Vuelve al documento y abre la versión actual antes de guardar.',
      );
      return;
    }
    if (changedTax) {
      setValidation(
        'La tasa de impuesto cambió. Revisa y acepta la tasa vigente antes de guardar.',
      );
      return;
    }
    if (!cart.length) {
      setValidation('Agrega al menos una variante.');
      return;
    }
    if (kind === 'purchase' && !contactId) {
      setValidation('Selecciona un proveedor activo.');
      return;
    }
    if (contactId && !contacts.some((contact) => contact.id === contactId)) {
      setValidation(
        'El contacto original ya no está disponible. Selecciona un contacto activo para continuar.',
      );
      return;
    }
    if (
      cart.some(
        (line) =>
          !Number.isSafeInteger(line.quantity) ||
          line.quantity < 1 ||
          !variants.some((v) => v.id === line.variantId),
      )
    ) {
      setValidation('Revisa las cantidades y las variantes del documento.');
      return;
    }
    if (
      kind !== 'purchase' &&
      cart.some(
        (line) => (variants.find((variant) => variant.id === line.variantId)?.price ?? 0) <= 0,
      )
    ) {
      setValidation(
        'Hay artículos con precio pendiente. Completa sus precios en Inventario antes de continuar.',
      );
      return;
    }
    if (kind === 'sale' && cart.some((line) => line.quantity > (stock.get(line.variantId) || 0))) {
      setValidation(
        'Una cantidad supera las existencias actuales. Ajusta el carrito para continuar.',
      );
      return;
    }
    if (
      kind === 'purchase' &&
      cart.some((line) => !Number.isFinite(line.unitCost) || line.unitCost < 0)
    ) {
      setValidation('Ingresa un costo válido en cada variante.');
      return;
    }
    if (
      kind !== 'purchase' &&
      !coupon.trim() &&
      (!Number.isFinite(Number(discount)) || Number(discount) < 0 || Number(discount) > maxDiscount)
    ) {
      setValidation(`El descuento permitido es de hasta ${money(maxDiscount)}.`);
      return;
    }
    if (changedPrices) {
      setValidation(
        'Hay precios actualizados. Revisa y acepta los nuevos precios antes de confirmar.',
      );
      return;
    }
    if (coupon.trim() && (!promotion || eligible <= 0)) {
      setValidation('El cupón no está vigente o no aplica a los productos del carrito.');
      return;
    }
    if (
      kind === 'sale' &&
      payment === 'cash' &&
      (!tendered || !Number.isFinite(Number(tendered)) || Number(tendered) < total)
    ) {
      setValidation('El efectivo recibido debe cubrir el total de la venta.');
      return;
    }
    if (kind === 'quote' && (!expires || expires < businessDate())) {
      setValidation('Selecciona una vigencia a partir de hoy.');
      return;
    }
    const payload: Record<string, unknown> = {
      ...(contactId ? { contact_id: contactId } : {}),
      items: cart.map((line) =>
        kind === 'purchase'
          ? { variant_id: line.variantId, quantity: line.quantity, unit_cost: line.unitCost }
          : {
              variant_id: line.variantId,
              quantity: line.quantity,
              expected_price: line.expectedPrice,
            },
      ),
      notes: notes.trim(),
    };
    if (kind !== 'purchase')
      Object.assign(payload, {
        discount: coupon.trim() ? 0 : discountAmount,
        tax_rate: taxRate,
        ...(coupon.trim() ? { promotion_code: coupon.trim() } : {}),
      });
    if (kind === 'sale')
      Object.assign(payload, {
        payment_method: payment,
        ...(payment === 'cash' ? { tendered: Number(tendered) } : {}),
      });
    if (kind === 'quote') payload.expires_at = `${expires}T23:59:59-04:00`;
    if (editingDocument)
      Object.assign(payload, { id: editingDocument.id, expected_updated_at: openedVersion });
    try {
      const result = await run(
        editingDocument
          ? 'update_quote'
          : kind === 'sale'
            ? 'create_sale'
            : kind === 'purchase'
              ? 'create_purchase'
              : 'create_quote',
        payload,
      );
      if (!result.entity_id) {
        setValidation(
          'La respuesta no identifica el documento. Actualiza los datos para comprobar el registro antes de crear otro.',
        );
        return;
      }
      notify(
        editingDocument
          ? 'Cotización actualizada.'
          : kind === 'sale'
            ? 'Venta registrada e inventario actualizado.'
            : kind === 'purchase'
              ? 'Orden de compra registrada.'
              : 'Cotización guardada.',
      );
      onCreated(result.entity_id);
    } catch {
      /* El hook conserva el error y el identificador para reintentar. */
    }
  }

  return (
    <Modal
      title={editingDocument ? `Editar ${documentNumber(editingDocument)}` : labels[kind].create}
      onClose={busy ? () => undefined : onClose}
      wide
    >
      <form onSubmit={submit} className="commerce-editor">
        {editingDocument && (
          <p className="commerce-inline-note">
            Revisa las cantidades, la vigencia y el total antes de guardar. Se aplicarán los precios
            del catálogo y las promociones vigentes que confirmes aquí. Se conserva el número de
            cotización.
          </p>
        )}
        {changedDocument && (
          <ErrorNotice message="Esta cotización cambió. Vuelve al documento para revisar la versión actual; tus cambios no se guardarán encima." />
        )}
        {changedTax && (
          <div className="commerce-price-change">
            <p>La tasa vigente es {data.settings.tax_rate}%. Revisa el total antes de guardar.</p>
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => setTaxRate(data.settings.tax_rate)}
            >
              Usar tasa vigente
            </button>
          </div>
        )}
        <fieldset disabled={busy || refreshing} className="commerce-fieldset">
          <div className="commerce-workbench">
            <section className="commerce-catalog" aria-label="Catálogo de variantes">
              <button
                type="button"
                className="button ghost commerce-refresh"
                onClick={() => void refreshCatalog()}
              >
                {refreshing ? 'Actualizando…' : 'Actualizar catálogo y existencias'}
              </button>
              <div className="commerce-catalog-search">
                <Search size={18} />
                <input
                  autoFocus
                  value={query}
                  placeholder="Nombre, SKU o código de barras…"
                  aria-label="Buscar productos para agregar"
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') return;
                    event.preventDefault();
                    const exact = variants.filter(
                      (variant) =>
                        variant.barcode === query.trim() ||
                        variant.sku.toLowerCase() === query.trim().toLowerCase(),
                    );
                    if (exact.length === 1 && exact[0]) {
                      if (addVariant(exact[0].id)) setQuery('');
                    } else if (exact.length > 1)
                      setValidation(
                        'El código coincide con más de una variante. Selecciona el artículo correcto de los resultados.',
                      );
                    else if (filtered.length === 1 && filtered[0]) {
                      if (addVariant(filtered[0].id)) setQuery('');
                    } else setValidation('Selecciona una variante de los resultados.');
                  }}
                />
              </div>
              <div className="commerce-category-row">
                <button
                  type="button"
                  className={
                    category === 'all' ? 'commerce-category selected' : 'commerce-category'
                  }
                  onClick={() => setCategory('all')}
                >
                  Todos
                </button>
                {categories.map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={
                      category === value ? 'commerce-category selected' : 'commerce-category'
                    }
                    onClick={() => setCategory(value)}
                  >
                    {categoryName(value)}
                  </button>
                ))}
              </div>
              <div className="commerce-product-grid">
                {filtered.map((variant) => {
                  const product = products.get(variant.product_id);
                  const available = stock.get(variant.id) || 0;
                  const quantityInCart =
                    cart.find((line) => line.variantId === variant.id)?.quantity || 0;
                  return (
                    <button
                      type="button"
                      key={variant.id}
                      className="commerce-product"
                      disabled={
                        (kind !== 'purchase' && variant.price <= 0) ||
                        (kind === 'sale' && available <= quantityInCart)
                      }
                      onClick={() => addVariant(variant.id)}
                    >
                      <span className="commerce-product-visual">
                        {product ? (
                          <ProductImage productId={product.id} source={product.images[0]} alt="" />
                        ) : (
                          <Package size={28} />
                        )}
                        {quantityInCart > 0 && (
                          <span className="commerce-cart-count">{quantityInCart}</span>
                        )}
                      </span>
                      <strong>
                        {product?.brand} {product?.model}
                      </strong>
                      <span className="muted">{variant.name}</span>
                      <small>{variant.sku}</small>
                      <span className="commerce-product-bottom">
                        <b>
                          {kind !== 'purchase' && variant.price <= 0
                            ? 'Precio pendiente'
                            : money(kind === 'purchase' ? (variant.cost ?? 0) : variant.price)}
                        </b>
                        <span className={available ? 'muted' : 'commerce-out'}>
                          {available ? `${available} disp.` : 'Agotado'}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {!filtered.length && (
                <div className="commerce-catalog-empty">
                  <Package size={30} />
                  <strong>No encontramos variantes</strong>
                  <p>Prueba con otro nombre, SKU o código.</p>
                </div>
              )}
            </section>
            <section className="commerce-cart" aria-label="Documento actual">
              {changedPrices && (
                <div className="commerce-price-change">
                  <p>El precio de una variante cambió. Revisa el nuevo total antes de continuar.</p>
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() =>
                      setCart((lines) =>
                        lines.map((line) => ({
                          ...line,
                          expectedPrice:
                            data.variants.find((variant) => variant.id === line.variantId)?.price ??
                            line.expectedPrice,
                        })),
                      )
                    }
                  >
                    Aceptar precios actualizados
                  </button>
                </div>
              )}
              <div className="commerce-cart-heading">
                <h3>
                  {kind === 'purchase'
                    ? 'Tu orden'
                    : kind === 'quote'
                      ? 'Tu propuesta'
                      : 'Venta actual'}
                </h3>
                <span className="badge">
                  {cart.reduce((sum, line) => sum + line.quantity, 0)} uds.
                </span>
              </div>
              <Field label={kind === 'purchase' ? 'Proveedor' : 'Cliente'}>
                <select
                  value={contactId}
                  onChange={(event) => setContactId(event.target.value)}
                  required={kind === 'purchase'}
                >
                  <option value="">
                    {kind === 'purchase' ? 'Selecciona un proveedor' : 'Cliente de mostrador'}
                  </option>
                  {contactId && !contacts.some((contact) => contact.id === contactId) && (
                    <option value={contactId} disabled>
                      Contacto original no disponible
                    </option>
                  )}
                  {contacts.map((contact) => (
                    <option key={contact.id} value={contact.id}>
                      {contact.name}
                    </option>
                  ))}
                </select>
              </Field>
              {kind === 'purchase' && !contacts.length && (
                <p className="commerce-inline-note">
                  Agrega un proveedor en Proveedores antes de crear la orden.
                </p>
              )}
              <div className="commerce-cart-lines">
                {cart.map((line) => {
                  const variant = data.variants.find((v) => v.id === line.variantId);
                  const product = variant && products.get(variant.product_id);
                  return (
                    <div key={line.variantId} className="commerce-cart-line">
                      <div className="commerce-line-name">
                        <strong>
                          {product?.brand} {product?.model}
                        </strong>
                        <button
                          type="button"
                          className="button ghost commerce-icon-button"
                          aria-label={`Quitar ${product?.model} ${variant?.name}`}
                          onClick={() =>
                            setCart((lines) =>
                              lines.filter((item) => item.variantId !== line.variantId),
                            )
                          }
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <small className="muted">
                        {variant?.name} · {variant?.sku}
                      </small>
                      <div className="commerce-line-controls">
                        <label>
                          Cantidad
                          <input
                            aria-label={`Cantidad de ${product?.model} ${variant?.name}`}
                            type="number"
                            min="1"
                            step="1"
                            max={kind === 'sale' ? stock.get(line.variantId) || 0 : undefined}
                            required
                            value={line.quantity || ''}
                            onChange={(event) =>
                              setCart((lines) =>
                                lines.map((item) =>
                                  item.variantId === line.variantId
                                    ? { ...item, quantity: Number(event.target.value) }
                                    : item,
                                ),
                              )
                            }
                          />
                        </label>
                        {kind === 'purchase' ? (
                          <label>
                            Costo unitario RD$
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              required
                              value={line.unitCost}
                              onChange={(event) =>
                                setCart((lines) =>
                                  lines.map((item) =>
                                    item.variantId === line.variantId
                                      ? { ...item, unitCost: Number(event.target.value) }
                                      : item,
                                  ),
                                )
                              }
                            />
                          </label>
                        ) : (
                          <span className="muted">× {money(line.expectedPrice)}</span>
                        )}
                        <strong>
                          {money(
                            line.quantity *
                              (kind === 'purchase' ? line.unitCost : line.expectedPrice),
                          )}
                        </strong>
                      </div>
                      {kind === 'sale' && line.quantity > (stock.get(line.variantId) || 0) && (
                        <p className="commerce-error-text">
                          Solo quedan {stock.get(line.variantId) || 0} disponibles.
                        </p>
                      )}
                    </div>
                  );
                })}
                {!cart.length && (
                  <div className="commerce-cart-empty">
                    <ShoppingBag size={28} />
                    <p>Agrega productos para comenzar.</p>
                  </div>
                )}
              </div>
              {kind !== 'purchase' && (
                <div className="form-grid commerce-small-grid">
                  <Field
                    label="Descuento RD$"
                    hint={
                      coupon.trim()
                        ? 'El cupón reemplaza el descuento manual.'
                        : `Hasta ${money(maxDiscount)}`
                    }
                  >
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      max={maxDiscount}
                      value={discount}
                      disabled={Boolean(coupon.trim())}
                      onChange={(event) => setDiscount(event.target.value)}
                    />
                  </Field>
                  <Field
                    label="Cupón"
                    hint={
                      coupon.trim()
                        ? promotion && eligible > 0
                          ? `${promotion.name}: ${money(discountAmount)}`
                          : 'No aplicable a este carrito'
                        : 'Opcional'
                    }
                  >
                    <input
                      value={coupon}
                      onChange={(event) => setCoupon(event.target.value)}
                      placeholder="Código"
                      maxLength={60}
                    />
                  </Field>
                </div>
              )}
              {kind === 'quote' && (
                <Field label="Válida hasta">
                  <input
                    type="date"
                    min={businessDate(new Date(now))}
                    max={businessDate(new Date(now + 365 * 86400000))}
                    required
                    value={expires}
                    onChange={(event) => setExpires(event.target.value)}
                  />
                </Field>
              )}
              <Field label="Nota" hint="Opcional">
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  maxLength={4000}
                  placeholder={
                    kind === 'purchase'
                      ? 'Condiciones o referencia del proveedor'
                      : 'Información adicional del documento'
                  }
                />
              </Field>
              <div className="commerce-totals">
                <div>
                  <span>Subtotal</span>
                  <span>{money(subtotal)}</span>
                </div>
                {kind !== 'purchase' && (
                  <>
                    <div>
                      <span>Descuento</span>
                      <span>−{money(discountAmount)}</span>
                    </div>
                    <div>
                      <span>Impuestos ({taxRate}%)</span>
                      <span>{money(tax)}</span>
                    </div>
                  </>
                )}
                <div className="commerce-grand-total">
                  <strong>Total</strong>
                  <strong>{money(total)}</strong>
                </div>
              </div>
              {kind === 'sale' && (
                <>
                  <Field label="Medio de pago">
                    <select value={payment} onChange={(event) => setPayment(event.target.value)}>
                      {Object.entries(paymentLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  {payment === 'cash' ? (
                    <div className="commerce-cash">
                      <Field label="Efectivo recibido RD$">
                        <input
                          type="number"
                          min={total}
                          step="0.01"
                          required
                          value={tendered}
                          onChange={(event) => setTendered(event.target.value)}
                        />
                      </Field>
                      <button
                        type="button"
                        className="button ghost"
                        onClick={() => setTendered(total.toFixed(2))}
                      >
                        Monto exacto
                      </button>
                      <div>
                        Cambio <strong>{money(change)}</strong>
                      </div>
                    </div>
                  ) : (
                    <p className="commerce-inline-note">
                      Confirma el cobro en tu terminal o cuenta antes de registrar la venta. Esta
                      aplicación registra el medio de pago.
                    </p>
                  )}
                </>
              )}
              {kind === 'quote' && (
                <p className="commerce-inline-note">
                  La cotización no reserva ni descuenta existencias.
                </p>
              )}
            </section>
          </div>
        </fieldset>
        <ErrorNotice message={validation || error} />
        <div className="modal-footer">
          <button type="button" className="button secondary" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <button
            className="button primary"
            type="submit"
            disabled={
              busy ||
              refreshing ||
              changedDocument ||
              !cart.length ||
              (kind === 'purchase' && !contacts.length)
            }
          >
            <Check size={17} />
            {busy
              ? 'Guardando…'
              : editingDocument
                ? 'Guardar cambios de cotización'
                : kind === 'sale'
                  ? `Completar venta · ${money(total)}`
                  : kind === 'purchase'
                    ? 'Crear orden de compra'
                    : 'Guardar cotización'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DocumentContext({
  document: doc,
  items,
}: {
  document: RetailDocument;
  items: DocumentItem[];
}) {
  const historical = Boolean(doc.legacy?.source);
  const unlinked = items.filter((item) => !item.variant_id).length;
  const taxDisagrees =
    historical && round(((doc.subtotal - doc.discount) * doc.tax_rate) / 100) !== round(doc.tax);
  const ncf = typeof doc.legacy?.ncf_number === 'string' ? doc.legacy.ncf_number : '';
  if (!historical && !unlinked && doc.status !== 'draft' && !doc.status_reason) return null;
  return (
    <div className="stack commerce-inline-note">
      {historical && (
        <p>
          <strong>Documento del sistema anterior.</strong> Se conservan la fecha, los importes y las
          condiciones que quedaron registradas.
        </p>
      )}
      {doc.status === 'legacy_pending' && (
        <p>
          <strong>Venta pendiente de revisión.</strong> No forma parte de las ventas confirmadas. Su
          cobro y efecto en las existencias deben verificarse antes de completarla; por ahora se
          conserva para consulta.
        </p>
      )}
      {doc.status === 'draft' && (
        <p>
          <strong>Borrador de compra.</strong> Revisa el proveedor y los artículos antes de
          confirmar la orden. Después podrás registrar las recepciones; los importes originales se
          conservan.
        </p>
      )}
      {unlinked > 0 && (
        <p>
          <strong>
            {unlinked}{' '}
            {unlinked === 1
              ? 'artículo sin vínculo con el inventario'
              : 'artículos sin vínculo con el inventario'}
            .
          </strong>{' '}
          Estos renglones requieren revisión antes de registrar recepciones, devoluciones o una
          anulación.
        </p>
      )}
      {taxDisagrees && (
        <p>
          El impuesto histórico no coincide con la tasa indicada. Se conserva el importe original;
          revisa el documento de origen.
        </p>
      )}
      {doc.type === 'sale' && doc.legacy?.payment_evidence === 'method_only' && (
        <p>
          El medio de pago proviene del registro anterior. Este documento no incluye evidencia del
          cobro.
        </p>
      )}
      {ncf && (
        <p>
          NCF registrado anteriormente: <strong>{ncf}</strong>. Pendiente de verificación.
        </p>
      )}
      {doc.status_reason && (
        <p>
          <strong>Motivo del cambio de estado:</strong> {doc.status_reason}
        </p>
      )}
    </div>
  );
}

function DocumentDetail({
  document: doc,
  onClose,
  onSelect,
  onEdit,
}: {
  document: RetailDocument;
  onClose: () => void;
  onSelect: (id: string) => void;
  onEdit: () => void;
}) {
  const { data, notify } = useRetail();
  const operation = useOperation();
  const now = useNow();
  const [mode, setMode] = useState<DetailMode>('detail');
  const [linkItemId, setLinkItemId] = useState<string | null>(null);
  const items = data.document_items.filter((item) => item.document_id === doc.id);
  const linkItem = items.find((item) => item.id === linkItemId);
  const linkedSale =
    doc.type === 'quote'
      ? data.documents.find((document) => document.type === 'sale' && document.parent_id === doc.id)
      : undefined;
  const linkedQuote =
    doc.type === 'sale'
      ? data.documents.find(
          (document) => document.type === 'quote' && document.id === doc.parent_id,
        )
      : undefined;
  const delivery =
    doc.type === 'sale'
      ? data.deliveries.find((item) => item.sale_id === doc.id && item.status !== 'cancelled')
      : undefined;
  const returns = data.documents.filter(
    (item) => item.type === 'return' && item.parent_id === doc.id,
  );
  const currentSale =
    doc.type === 'sale' && ['completed', 'partially_returned'].includes(doc.status);
  const canReceive = items.some(
    (item) => item.variant_id && item.quantity > item.received_quantity,
  );
  const canRestoreAll = items.length > 0 && items.every((item) => item.variant_id);
  const draftSupplier = data.contacts.find(
    (contact) => contact.id === doc.contact_id && contact.kind === 'supplier' && contact.active,
  );
  return (
    <Modal title={documentNumber(doc)} onClose={operation.busy ? () => undefined : onClose} wide>
      {mode !== 'detail' && (
        <button
          className="button ghost commerce-back"
          disabled={operation.busy}
          onClick={() => {
            operation.clearError();
            setMode('detail');
          }}
        >
          <ArrowLeft size={16} />
          Volver al documento
        </button>
      )}
      {mode === 'detail' ? (
        <>
          <article className="retail-print commerce-document">
            <DocumentContext document={doc} items={items} />
            <div className="commerce-document-heading">
              <div>
                <span className="commerce-document-eyebrow">{data.settings.business_name}</span>
                <h2>
                  {doc.type === 'purchase'
                    ? 'Orden de compra'
                    : doc.type === 'quote'
                      ? 'Cotización'
                      : doc.type === 'return'
                        ? 'Devolución'
                        : 'Recibo de venta'}
                </h2>
                <p>
                  {documentNumber(doc)} · {dateTime(doc.created_at)}
                </p>
              </div>
              <div>
                {quoteExpired(doc, now) ? (
                  <span className="badge commerce-warning">Vencida</span>
                ) : (
                  <StatusBadge status={doc.status} />
                )}
                {data.settings.tax_id && <small>Identificación: {data.settings.tax_id}</small>}
              </div>
            </div>
            <div className="commerce-document-contact">
              <div>
                <span className="muted">{doc.type === 'purchase' ? 'Proveedor' : 'Cliente'}</span>
                <strong>{contactName(doc)}</strong>
                {Boolean(doc.contact_snapshot.phone) && (
                  <span>{String(doc.contact_snapshot.phone)}</span>
                )}
                {Boolean(doc.contact_snapshot.address) && (
                  <span>{String(doc.contact_snapshot.address)}</span>
                )}
              </div>
              <div>
                {doc.payment_method && (
                  <>
                    <span className="muted">Medio de pago</span>
                    <strong>{paymentLabels[doc.payment_method] || doc.payment_method}</strong>
                  </>
                )}
                {doc.expires_at && (
                  <>
                    <span className="muted">Válida hasta</span>
                    <strong>{shortDate(doc.expires_at)}</strong>
                  </>
                )}
              </div>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th className="number">Cantidad</th>
                    {doc.type === 'purchase' && <th className="number">Recibido</th>}
                    <th className="number">
                      {doc.type === 'purchase' ? 'Costo unitario' : 'Precio unitario'}
                    </th>
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
                        {!item.variant_id && (
                          <small className="commerce-table-meta commerce-warning">
                            Sin vínculo con el inventario
                          </small>
                        )}
                        {doc.type !== 'purchase' && (
                          <small>
                            {item.product_snapshot.warranty_unknown ||
                            item.product_snapshot.warranty_months === null
                              ? 'Garantía no registrada en el sistema anterior'
                              : item.product_snapshot.warranty_months === 0
                                ? 'Sin garantía comercial'
                                : 'Garantía: ' + item.product_snapshot.warranty_months + ' meses'}
                          </small>
                        )}
                      </td>
                      <td className="number">{item.quantity}</td>
                      {doc.type === 'purchase' && (
                        <td className="number">
                          {item.received_quantity} / {item.quantity}
                        </td>
                      )}
                      <td className="number">{money(item.unit_price)}</td>
                      <td className="number">{money(item.line_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="commerce-document-summary">
              <div className="commerce-document-notes">
                {doc.notes && (
                  <>
                    <strong>Nota</strong>
                    <p>{doc.notes}</p>
                  </>
                )}
                {doc.type === 'quote' && (
                  <p>
                    Esta cotización no reserva existencias. Revisa su vigencia antes de confirmar la
                    compra.
                  </p>
                )}
                <p>Documento comercial. No es un comprobante fiscal.</p>
                {doc.type === 'purchase' && (
                  <p>Conserve esta orden para verificar la mercancía recibida.</p>
                )}
                {doc.type === 'sale' && data.settings.receipt_footer && (
                  <p>{data.settings.receipt_footer}</p>
                )}
              </div>
              <div className="commerce-totals">
                <div>
                  <span>Subtotal</span>
                  <span>{money(doc.subtotal)}</span>
                </div>
                <div>
                  <span>Descuento</span>
                  <span>−{money(doc.discount)}</span>
                </div>
                <div>
                  <span>Impuestos ({doc.tax_rate}%)</span>
                  <span>{money(doc.tax)}</span>
                </div>
                <div className="commerce-grand-total">
                  <strong>Total</strong>
                  <strong>{money(doc.total)}</strong>
                </div>
                {doc.payment_method === 'cash' && doc.tendered !== null && (
                  <>
                    <div>
                      <span>Efectivo recibido</span>
                      <span>{money(doc.tendered)}</span>
                    </div>
                    <div>
                      <span>Cambio</span>
                      <span>{money(doc.change_amount || 0)}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </article>
          {data.permissions.manage_business &&
            Boolean(doc.legacy?.source) &&
            items
              .filter((item) => !item.variant_id)
              .map((item) => (
                <div className="commerce-linked-note" key={item.id}>
                  <Package size={18} />
                  <span>
                    {itemTitle(item)} · {item.product_snapshot.name} ·{' '}
                    {item.product_snapshot.sku || 'Sin SKU'}
                  </span>
                  <button
                    className="button secondary"
                    onClick={() => {
                      operation.clearError();
                      setLinkItemId(item.id);
                      setMode('link_item');
                    }}
                  >
                    Vincular artículo
                  </button>
                </div>
              ))}
          {linkedSale && (
            <div className="commerce-linked-note">
              <Check size={18} />
              <span>Convertida en {documentNumber(linkedSale)}</span>
              <button className="button ghost" onClick={() => onSelect(linkedSale.id)}>
                Ver venta
              </button>
            </div>
          )}
          {linkedQuote && (
            <div className="commerce-linked-note">
              <FileText size={18} />
              <span>Venta de {documentNumber(linkedQuote)}</span>
              <Link className="button ghost" to={`/cotizaciones?documento=${linkedQuote.id}`}>
                Ver cotización
              </Link>
            </div>
          )}
          {delivery && (
            <div className="commerce-linked-note">
              <Truck size={18} />
              <span>Entrega: {statusLabels[delivery.status]}</span>
              <Link className="button ghost" to={`/entregas?documento=${delivery.id}`}>
                Ver entrega
              </Link>
            </div>
          )}
          {returns.map((item) => (
            <div className="commerce-linked-note" key={item.id}>
              <RotateCcw size={18} />
              <span>
                {documentNumber(item)} · {money(item.total)}
              </span>
              <Link className="button ghost" to={`/posventa?documento=${item.id}`}>
                Ver devolución
              </Link>
            </div>
          ))}
          {currentSale && (
            <div className="toolbar">
              {data.permissions.refund && (
                <Link className="button secondary" to={`/posventa?nuevo=1&venta=${doc.id}`}>
                  <RotateCcw size={17} />
                  Registrar devolución
                </Link>
              )}
              {data.permissions.sell && !delivery && (
                <Link className="button secondary" to={`/entregas?nuevo=1&venta=${doc.id}`}>
                  <Truck size={17} />
                  Programar entrega
                </Link>
              )}
            </div>
          )}
          {doc.type === 'purchase' && doc.status === 'draft' && !draftSupplier && (
            <ErrorNotice message="El borrador necesita un proveedor activo para poder confirmarse. Revisa el proveedor original antes de continuar." />
          )}
          {doc.type === 'purchase' && doc.status === 'draft' && data.permissions.purchase && (
            <div className="toolbar">
              <button className="button ghost danger" onClick={() => setMode('cancel')}>
                Cancelar borrador
              </button>
              <button
                className="button primary"
                disabled={!canRestoreAll || !draftSupplier}
                onClick={() => setMode('confirm_draft')}
              >
                <Check size={17} />
                Confirmar orden
              </button>
            </div>
          )}
          {doc.type === 'quote' && doc.status === 'open' && data.permissions.sell && (
            <div className="toolbar">
              <button className="button ghost danger" onClick={() => setMode('cancel_quote')}>
                Cancelar cotización
              </button>
              <button className="button secondary" disabled={!canRestoreAll} onClick={onEdit}>
                <Pencil size={17} />
                {quoteExpired(doc, now) ? 'Revisar y renovar' : 'Editar cotización'}
              </button>
            </div>
          )}
          <div className="modal-footer commerce-document-actions">
            <button className="button secondary" onClick={() => window.print()}>
              <Printer size={17} />
              Imprimir
            </button>
            {doc.type === 'purchase' &&
              data.permissions.purchase &&
              ['pending', 'partial'].includes(doc.status) && (
                <>
                  <button className="button ghost danger" onClick={() => setMode('cancel')}>
                    Cancelar pendiente
                  </button>
                  <button
                    className="button primary"
                    disabled={!canReceive}
                    onClick={() => setMode('receive')}
                  >
                    <Truck size={17} />
                    Recibir mercancía
                  </button>
                </>
              )}
            {doc.type === 'quote' &&
              data.permissions.sell &&
              doc.status === 'open' &&
              !quoteExpired(doc, now) && (
                <button className="button primary" onClick={() => setMode('convert')}>
                  <ShoppingBag size={17} />
                  Convertir en venta
                </button>
              )}
            {doc.type === 'sale' && data.permissions.refund && doc.status === 'completed' && (
              <button
                className="button danger"
                disabled={!canRestoreAll}
                onClick={() => setMode('void')}
              >
                Anular venta
              </button>
            )}
          </div>
        </>
      ) : mode === 'receive' ? (
        <ReceivePurchase
          document={doc}
          items={items}
          operation={operation}
          onDone={() => setMode('detail')}
        />
      ) : mode === 'convert' ? (
        <ConvertQuote
          document={doc}
          operation={operation}
          onDone={(id) => {
            notify('Cotización convertida en venta.');
            setMode('detail');
            onSelect(id);
          }}
        />
      ) : mode === 'confirm_draft' ? (
        <ConfirmPurchaseDraft
          document={doc}
          items={items}
          operation={operation}
          onDone={() => setMode('detail')}
        />
      ) : mode === 'link_item' ? (
        linkItem ? (
          <LinkHistoricalItem
            key={linkItem.id}
            document={doc}
            item={linkItem}
            operation={operation}
            onDone={() => setMode('detail')}
          />
        ) : (
          <ErrorNotice message="El artículo cambió. Vuelve al documento para revisarlo." />
        )
      ) : (
        <ReverseDocument
          document={doc}
          mode={mode}
          operation={operation}
          onDone={() => setMode('detail')}
        />
      )}
    </Modal>
  );
}

function ReceivePurchase({
  document: doc,
  items,
  operation,
  onDone,
}: {
  document: RetailDocument;
  items: DocumentItem[];
  operation: ReturnType<typeof useOperation>;
  onDone: () => void;
}) {
  const { notify } = useRetail();
  const { run, busy, error } = operation;
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [validation, setValidation] = useState('');
  const pending = items.filter((item) => item.quantity > item.received_quantity);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidation('');
    const lines = pending.map((item) => ({
      item_id: item.id,
      quantity: Number(quantities[item.id] || 0),
    }));
    if (
      lines.some(
        (line) =>
          !Number.isSafeInteger(line.quantity) ||
          line.quantity < 0 ||
          line.quantity >
            (pending.find((item) => item.id === line.item_id)?.quantity || 0) -
              (pending.find((item) => item.id === line.item_id)?.received_quantity || 0),
      )
    ) {
      setValidation('Revisa las cantidades: no pueden superar lo pendiente.');
      return;
    }
    if (!lines.some((line) => line.quantity > 0)) {
      setValidation('Indica al menos una unidad recibida.');
      return;
    }
    if (
      lines.some(
        (line) =>
          line.quantity > 0 && !pending.find((item) => item.id === line.item_id)?.variant_id,
      )
    ) {
      setValidation(
        'Los artículos sin vínculo con el inventario requieren revisión antes de recibirlos.',
      );
      return;
    }
    try {
      await run('receive_purchase', {
        id: doc.id,
        items: lines.filter((line) => line.quantity > 0),
        notes,
      });
      notify('Recepción registrada. Las existencias ya están actualizadas.');
      onDone();
    } catch {
      /* El formulario se conserva. */
    }
  }
  return (
    <form onSubmit={submit} className="stack">
      <div>
        <h3>Recibir mercancía</h3>
        <p className="muted">
          Registra únicamente lo que llegó en esta entrega. El resto queda pendiente.
        </p>
      </div>
      <fieldset disabled={busy} className="commerce-fieldset">
        <div className="commerce-receive-list">
          {pending.map((item) => (
            <div className="commerce-receive-line" key={item.id}>
              <Package size={24} />
              <div>
                <strong>{itemTitle(item)}</strong>
                <p className="muted">
                  {item.product_snapshot.name} · {item.product_snapshot.sku}
                </p>
                <small>
                  {item.received_quantity} recibidas de {item.quantity} ·{' '}
                  {item.quantity - item.received_quantity} pendientes
                </small>
              </div>
              {!item.variant_id && (
                <p className="commerce-inline-note">
                  Sin vínculo con el inventario. Pendiente de revisión.
                </p>
              )}
              <Field label="Recibidas hoy">
                <input
                  type="number"
                  disabled={!item.variant_id}
                  min="0"
                  max={item.quantity - item.received_quantity}
                  step="1"
                  value={quantities[item.id] ?? '0'}
                  onChange={(event) =>
                    setQuantities((current) => ({ ...current, [item.id]: event.target.value }))
                  }
                  aria-label={`Recibir ${itemTitle(item)} ${item.product_snapshot.name}`}
                />
              </Field>
            </div>
          ))}
        </div>
        <Field label="Nota de recepción" hint="Opcional">
          <textarea
            rows={2}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            maxLength={1000}
            placeholder="Referencia de entrega o revisión de mercancía"
          />
        </Field>
      </fieldset>
      <ErrorNotice message={validation || error} />
      <div className="modal-footer">
        <button type="button" className="button secondary" disabled={busy} onClick={onDone}>
          Cancelar
        </button>
        <button
          className="button primary"
          disabled={busy || !pending.some((item) => item.variant_id)}
        >
          <Check size={17} />
          {busy ? 'Registrando…' : 'Confirmar recepción'}
        </button>
      </div>
    </form>
  );
}

function ConvertQuote({
  document: doc,
  operation,
  onDone,
}: {
  document: RetailDocument;
  operation: ReturnType<typeof useOperation>;
  onDone: (id: string) => void;
}) {
  const { data } = useRetail();
  const { run, busy, error } = operation;
  const [payment, setPayment] = useState('cash');
  const [tendered, setTendered] = useState(doc.total.toFixed(2));
  const [validation, setValidation] = useState('');
  const items = useMemo(
    () => data.document_items.filter((item) => item.document_id === doc.id),
    [data.document_items, doc.id],
  );
  const shortages = items.filter(
    (item) =>
      item.quantity >
      (data.stocks.find((stock) => stock.variant_id === item.variant_id)?.available || 0),
  );
  const unavailable = items.filter((item) => {
    const variant = data.variants.find((value) => value.id === item.variant_id);
    return (
      !variant?.active ||
      !data.products.find((product) => product.id === variant.product_id)?.active
    );
  });
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidation('');
    if (shortages.length || unavailable.length) {
      setValidation('Revisa los artículos y sus existencias antes de convertir la cotización.');
      return;
    }
    if (
      payment === 'cash' &&
      (!Number.isFinite(Number(tendered)) || Number(tendered) < doc.total)
    ) {
      setValidation('El efectivo recibido debe cubrir el total.');
      return;
    }
    try {
      const result = await run('convert_quote', {
        id: doc.id,
        payment_method: payment,
        ...(payment === 'cash' ? { tendered: Number(tendered) } : {}),
      });
      const saleId =
        typeof result.result.sale_id === 'string' ? result.result.sale_id : result.entity_id;
      if (!saleId) {
        setValidation(
          'La respuesta no identifica la venta. Actualiza los datos para comprobar la conversión.',
        );
        return;
      }
      onDone(saleId);
    } catch {
      /* El error del servidor permanece visible. */
    }
  }
  return (
    <form onSubmit={submit} className="stack">
      <div className="commerce-convert-summary">
        <ClipboardList size={30} />
        <div>
          <h3>Completar la venta</h3>
          <p>
            {documentNumber(doc)} · {contactName(doc)}
          </p>
        </div>
        <strong>{money(doc.total)}</strong>
      </div>
      <p className="muted">
        Se conservan los precios, descuentos e impuestos cotizados. Las existencias se validan al
        confirmar.
      </p>
      {unavailable.length > 0 && (
        <ErrorNotice message="Hay artículos archivados o sin vínculo con el inventario. Revisa el catálogo antes de convertir esta cotización." />
      )}
      {shortages.length > 0 && (
        <ErrorNotice
          message={`Existencias insuficientes: ${shortages.map((item) => `${itemTitle(item)} (${item.product_snapshot.name})`).join(', ')}.`}
        />
      )}
      <fieldset disabled={busy} className="commerce-fieldset form-grid">
        <Field label="Medio de pago">
          <select value={payment} onChange={(event) => setPayment(event.target.value)}>
            {Object.entries(paymentLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        {payment === 'cash' && (
          <Field
            label="Efectivo recibido RD$"
            hint={`Cambio: ${money(Math.max(0, round(Number(tendered) - doc.total)))}`}
          >
            <input
              type="number"
              min={doc.total}
              step="0.01"
              required
              value={tendered}
              onChange={(event) => setTendered(event.target.value)}
            />
          </Field>
        )}
      </fieldset>
      {payment !== 'cash' && (
        <p className="commerce-inline-note">Verifica el cobro antes de registrar la venta.</p>
      )}
      <ErrorNotice message={validation || error} />
      <div className="modal-footer">
        <button
          className="button primary"
          disabled={busy || shortages.length > 0 || unavailable.length > 0}
        >
          {busy ? 'Convirtiendo…' : `Registrar venta · ${money(doc.total)}`}
        </button>
      </div>
    </form>
  );
}

function LinkHistoricalItem({
  document: doc,
  item,
  operation,
  onDone,
}: {
  document: RetailDocument;
  item: DocumentItem;
  operation: ReturnType<typeof useOperation>;
  onDone: () => void;
}) {
  const { data, notify, refresh } = useRetail();
  const { run, busy, error } = operation;
  const [openedVersion] = useState(doc.updated_at);
  const [variantId, setVariantId] = useState('');
  const [reason, setReason] = useState('');
  const [validation, setValidation] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const norm = (value: string) => value.trim().toLowerCase();
  const snapshot = item.product_snapshot;
  const evidencePresent = Boolean(
    norm(snapshot.brand) && norm(snapshot.model) && norm(snapshot.name),
  );
  const candidates = data.variants.filter((variant) => {
    const product = data.products.find((value) => value.id === variant.product_id);
    return (
      evidencePresent &&
      variant.active &&
      product?.active &&
      norm(product.brand) === norm(snapshot.brand) &&
      norm(product.model) === norm(snapshot.model) &&
      norm(variant.name) === norm(snapshot.name)
    );
  });
  const changed = doc.updated_at !== openedVersion || item.variant_id !== null;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidation('');
    if (
      !data.permissions.manage_business ||
      changed ||
      !candidates.some((variant) => variant.id === variantId) ||
      !reason.trim()
    ) {
      setValidation('Selecciona una variante coincidente y explica cómo verificaste el vínculo.');
      return;
    }
    try {
      await run('link_historical_item', {
        item_id: item.id,
        variant_id: variantId,
        reason: reason.trim(),
        expected_updated_at: openedVersion,
      });
      notify('Artículo histórico vinculado. Sus existencias e importes se conservan.');
      onDone();
    } catch {
      /* Conservar selección y evidencia. */
    }
  }
  async function refreshCandidates() {
    setRefreshing(true);
    try {
      await refresh();
      setValidation('');
    } catch {
      setValidation('No se pudo actualizar el catálogo. Inténtalo de nuevo.');
    } finally {
      setRefreshing(false);
    }
  }
  return (
    <form onSubmit={submit} className="stack">
      <h3>Vincular artículo histórico</h3>
      <p>
        <strong>
          {snapshot.brand} {snapshot.model}
        </strong>
        <br />
        Variante: {snapshot.name || 'Sin nombre registrado'} · SKU original:{' '}
        {snapshot.sku || 'Sin SKU registrado'}
      </p>
      <p className="muted">
        Solo aparecen variantes activas con la misma marca, modelo y nombre. Verifica el SKU y el
        documento original: este vínculo identifica el artículo sin cambiar su descripción histórica
        ni sus existencias.
      </p>
      {!evidencePresent ? (
        <ErrorNotice message="El registro original no tiene marca, modelo y nombre suficientes para verificar el vínculo. Requiere revisión del documento de origen." />
      ) : !candidates.length ? (
        <div className="commerce-inline-note">
          <p>
            No hay una variante activa que coincida. Crea o reactiva el producto y la variante
            correspondientes en Inventario, luego vuelve a este documento.
          </p>
          <Link className="button secondary" to="/inventario">
            Ir a Inventario
          </Link>
        </div>
      ) : (
        <Field label="Variante verificada">
          <select
            required
            value={variantId}
            disabled={busy || refreshing}
            onChange={(event) => setVariantId(event.target.value)}
          >
            <option value="">Selecciona la variante que verificaste…</option>
            {candidates.map((variant) => (
              <option key={variant.id} value={variant.id}>
                {variant.name} · {variant.sku}
              </option>
            ))}
          </select>
        </Field>
      )}
      <button
        className="button ghost"
        type="button"
        disabled={busy || refreshing}
        onClick={() => void refreshCandidates()}
      >
        {refreshing ? 'Actualizando…' : 'Actualizar catálogo'}
      </button>
      <Field label="Motivo y evidencia de la vinculación">
        <textarea
          required
          maxLength={1000}
          rows={3}
          value={reason}
          disabled={busy || refreshing}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Indica el documento o dato con el que verificaste que es el mismo artículo"
        />
      </Field>
      {changed && (
        <ErrorNotice message="El documento cambió. Vuelve al detalle para revisar su versión actual antes de vincular." />
      )}
      <ErrorNotice message={validation || error} />
      <div className="modal-footer">
        <button type="button" className="button secondary" disabled={busy} onClick={onDone}>
          Volver al documento
        </button>
        <button
          className="button primary"
          disabled={busy || refreshing || changed || !variantId || !reason.trim()}
        >
          {busy ? 'Vinculando…' : 'Confirmar vínculo'}
        </button>
      </div>
    </form>
  );
}

function ConfirmPurchaseDraft({
  document: doc,
  items,
  operation,
  onDone,
}: {
  document: RetailDocument;
  items: DocumentItem[];
  operation: ReturnType<typeof useOperation>;
  onDone: () => void;
}) {
  const { data, notify } = useRetail();
  const { run, busy, error } = operation;
  const [openedVersion] = useState(doc.updated_at);
  const changed = doc.updated_at !== openedVersion || doc.status !== 'draft';
  const supplier = data.contacts.find(
    (contact) => contact.id === doc.contact_id && contact.kind === 'supplier' && contact.active,
  );
  const unresolved =
    !items.length ||
    items.some((item) => {
      const variant = data.variants.find((value) => value.id === item.variant_id);
      return (
        item.received_quantity > 0 ||
        !variant?.active ||
        !data.products.find((product) => product.id === variant.product_id)?.active
      );
    });
  const blocked = changed || unresolved || !supplier;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blocked) return;
    try {
      await run('confirm_purchase_draft', { id: doc.id, expected_updated_at: openedVersion });
      notify('Orden confirmada. Ya puedes registrar las recepciones de mercancía.');
      onDone();
    } catch {
      /* Conservar revisión; el servidor valida la versión y los vínculos históricos. */
    }
  }
  return (
    <form onSubmit={submit} className="stack">
      <div className="commerce-convert-summary">
        <Truck size={28} />
        <div>
          <h3>Confirmar orden de compra</h3>
          <p>
            {documentNumber(doc)} · {contactName(doc)}
          </p>
        </div>
        <strong>{money(doc.total)}</strong>
      </div>
      <p>
        Se conservan los artículos, costos e impuestos del borrador. La orden pasará a pendiente de
        recepción y sus unidades se agregarán al inventario cuando registres lo recibido.
      </p>
      <p className="muted">
        {items.reduce((sum, item) => sum + item.quantity, 0)} unidades en {items.length} renglones.
      </p>
      {changed && (
        <ErrorNotice message="El borrador cambió mientras lo revisabas. Vuelve al documento para comprobar la versión actual." />
      )}
      {(!supplier || unresolved) && (
        <ErrorNotice message="Revisa el proveedor activo y la vinculación de todos los artículos antes de confirmar esta orden." />
      )}
      <ErrorNotice message={error} />
      <div className="modal-footer">
        <button type="button" className="button secondary" disabled={busy} onClick={onDone}>
          Volver al borrador
        </button>
        <button className="button primary" disabled={busy || blocked}>
          {busy ? 'Confirmando…' : 'Confirmar orden'}
        </button>
      </div>
    </form>
  );
}

function ReverseDocument({
  document: doc,
  mode,
  operation,
  onDone,
}: {
  document: RetailDocument;
  mode: 'cancel' | 'void' | 'cancel_quote';
  operation: ReturnType<typeof useOperation>;
  onDone: () => void;
}) {
  const { data, notify } = useRetail();
  const { run, busy, error } = operation;
  const [reason, setReason] = useState('');
  const [openedVersion] = useState(doc.updated_at);
  const changed = doc.updated_at !== openedVersion;
  const blocked =
    mode === 'void' &&
    data.deliveries.some(
      (delivery) => delivery.sale_id === doc.id && delivery.status !== 'cancelled',
    );
  const title =
    mode === 'void'
      ? 'Anular esta venta'
      : mode === 'cancel_quote'
        ? 'Cancelar cotización'
        : doc.status === 'draft'
          ? 'Cancelar borrador'
          : 'Cancelar las cantidades pendientes';
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reason.trim() || blocked || changed) return;
    try {
      await run(
        mode === 'void'
          ? 'void_sale'
          : mode === 'cancel_quote'
            ? 'cancel_quote'
            : 'cancel_purchase',
        { id: doc.id, reason: reason.trim(), expected_updated_at: openedVersion },
      );
      notify(
        mode === 'void'
          ? 'Venta anulada e inventario restituido.'
          : mode === 'cancel_quote'
            ? 'Cotización cancelada. Se conserva su historial.'
            : doc.status === 'draft'
              ? 'Borrador cancelado.'
              : 'Cantidades pendientes canceladas.',
      );
      onDone();
    } catch {
      /* Conservar motivo. */
    }
  }
  return (
    <form onSubmit={submit} className="stack">
      <h3>{title}</h3>
      <p className="muted">
        {mode === 'void'
          ? 'La venta quedará anulada y sus unidades volverán a estar disponibles. La anulación no realiza un reembolso en una terminal o cuenta bancaria.'
          : mode === 'cancel_quote'
            ? 'La cotización quedará cancelada y ya no podrá convertirse en venta. Sus artículos, importes y motivo se conservarán para consulta.'
            : doc.status === 'draft'
              ? 'El borrador quedará cancelado. Se conservarán su contenido y el motivo sin cambiar las existencias.'
              : 'Las unidades ya recibidas y su historial se conservan. Lo pendiente dejará de contarse como mercancía en camino.'}
      </p>
      {blocked && (
        <ErrorNotice message="Esta venta tiene una entrega vinculada no cancelada. Resuelve la entrega antes de anular." />
      )}
      {changed && (
        <ErrorNotice message="Este documento cambió mientras lo revisabas. Vuelve al detalle antes de continuar." />
      )}
      <Field label="Motivo obligatorio">
        <textarea
          required
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={3}
          maxLength={1000}
          disabled={busy}
        />
      </Field>
      <ErrorNotice message={error} />
      <div className="modal-footer">
        <button type="button" className="button secondary" disabled={busy} onClick={onDone}>
          Conservar documento
        </button>
        <button className="button danger" disabled={busy || !reason.trim() || blocked || changed}>
          {busy ? 'Guardando…' : mode === 'void' ? 'Confirmar anulación' : title}
        </button>
      </div>
    </form>
  );
}
