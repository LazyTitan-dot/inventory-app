import type { Contact, Delivery, DocumentItem, RetailDocument } from './contracts';
import { dateTime, money, paymentLabels, shortDate, statusLabels } from './format';
import { displayBusinessName } from './brand';

export const MAX_WHATSAPP_MESSAGE_LENGTH = 3500;
export const DELIVERY_CHAT_REPLY = 'Puedes escribirnos por este mismo chat para cualquier consulta o cambio en tu entrega.';

export interface ContactWhatsAppInput {
  contact: Pick<Contact, 'name' | 'kind'>;
  businessName: string;
}

export interface DocumentWhatsAppInput {
  document: RetailDocument;
  items: readonly DocumentItem[];
  businessName: string;
  now?: Date;
}

export interface DeliveryWhatsAppInput {
  delivery: Delivery;
  sale?: RetailDocument;
  items?: readonly DocumentItem[];
  businessName: string;
}

/** Returns an international number without +; never guesses a country outside RD. */
export function normalizeWhatsAppPhone(phone: string): string {
  const input = phone.trim();
  if (!input || !/^\+?[0-9 ().\-\u00a0]+$/.test(input)) {
    throw new Error('Escribe un teléfono válido, sin extensiones ni letras.');
  }
  const international = input.startsWith('+') || input.startsWith('00');
  let digits = input.replace(/[^0-9]/g, '');
  if (input.startsWith('00')) digits = digits.slice(2);
  if (international) {
    if (!/^[1-9][0-9]{6,14}$/.test(digits)) {
      throw new Error('El número internacional debe tener entre 7 y 15 dígitos, incluido el país.');
    }
    return digits;
  }
  if (/^(809|829|849)[0-9]{7}$/.test(digits)) return `1${digits}`;
  if (/^1(809|829|849)[0-9]{7}$/.test(digits)) return digits;
  throw new Error(
    'Para otros países, incluye + o 00 y el código de país. En RD usa 809, 829 o 849.',
  );
}

export function buildWhatsAppUrl(phone: string, message: string): string {
  const digits = normalizeWhatsAppPhone(phone);
  if (!message.trim()) throw new Error('Escribe el mensaje que deseas compartir.');
  if (message.length > MAX_WHATSAPP_MESSAGE_LENGTH) {
    throw new Error(`El mensaje puede tener hasta ${MAX_WHATSAPP_MESSAGE_LENGTH} caracteres.`);
  }
  try {
    return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
  } catch {
    throw new Error('El mensaje contiene un carácter no válido. Revísalo antes de compartir.');
  }
}

// Only explicitly selected business fields enter messages. Notes, IDs, costs and media do not.
function text(value: unknown, limit = 120): string {
  if (typeof value !== 'string') return '';
  const clean = value
    .replace(/https?:\/\/\S+|(?:storage|legacy):\S+/gi, '[enlace omitido]')
    .replace(/\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/gi, '[referencia omitida]')
    .replace(/\p{Cc}|[\u202a-\u202e\u2066-\u2069]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return clean.length <= limit
    ? clean
    : `${clean.slice(0, limit - 1).replace(/[\uD800-\uDBFF]$/, '')}…`;
}

function amount(value: number): string {
  if (!Number.isFinite(value)) throw new Error('Hay un importe inválido en el documento.');
  return money(value);
}

function number(value: number): string {
  if (!Number.isFinite(value)) throw new Error('Hay una cantidad inválida en el documento.');
  return new Intl.NumberFormat('es-DO', { maximumFractionDigits: 2 }).format(value);
}

function date(value: string | null): string {
  return value && Number.isFinite(new Date(value).getTime())
    ? `${dateTime(value)} (hora de RD)`
    : 'No registrada';
}

function deliverySchedule(delivery: DeliveryWhatsAppInput['delivery']): string {
  const metadata = delivery.legacy;
  if (metadata?.exact_time_known === true) return date(delivery.scheduled_at);
  const historical =
    metadata?.exact_time_known === false ||
    delivery.history.some(
      (entry) =>
        entry.actor === null &&
        entry.note === 'Estado declarado en el sistema anterior; receptor y autor no registrados.',
    );
  if (!historical) return date(delivery.scheduled_at);
  const originalDate = metadata?.original_date;
  const slot = typeof metadata?.time_slot === 'string' ? metadata.time_slot : '';
  const originalDay =
    typeof originalDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(originalDate)
      ? originalDate
      : null;
  // The importer stores a placeholder hour for each historical window. A later
  // authenticated reschedule can replace it without rewriting the legacy metadata.
  const placeholderHour = /^AM\b/i.test(slot)
    ? '08'
    : /^PM\b/i.test(slot)
      ? '12'
      : /^Evening\b/i.test(slot)
        ? '17'
        : '00';
  const placeholder = originalDay
    ? new Date(`${originalDay}T${placeholderHour}:00:00-04:00`).getTime()
    : Number.NaN;
  const rescheduled = delivery.history.some(
    (entry) =>
      entry.actor !== null && entry.status === 'scheduled' && entry.note === 'Entrega reprogramada',
  );
  if (
    rescheduled &&
    Number.isFinite(placeholder) &&
    new Date(delivery.scheduled_at).getTime() !== placeholder
  ) {
    return date(delivery.scheduled_at);
  }
  const value = originalDay ? `${originalDay}T12:00:00-04:00` : delivery.scheduled_at;
  const day = Number.isFinite(new Date(value).getTime()) ? shortDate(value) : 'Fecha no registrada';
  const period = /^AM\b/i.test(slot)
    ? 'Mañana'
    : /^PM\b/i.test(slot)
      ? 'Tarde'
      : /^Evening\b/i.test(slot)
        ? 'Noche'
        : 'Franja no registrada';
  return `${day} · ${period} (hora exacta no registrada en el sistema anterior)`;
}

function business(name: string): string {
  return displayBusinessName(text(name, 100)) || 'Nuestro negocio';
}

function itemName(item: DocumentItem): string {
  const snapshot = item.product_snapshot;
  const model = [text(snapshot.brand, 60), text(snapshot.model, 80)].filter(Boolean).join(' ');
  return [model, text(snapshot.name, 100)].filter(Boolean).join(' · ') || 'Artículo';
}

function documentStatus(document: RetailDocument, now: Date): string {
  if (
    document.type === 'quote' &&
    document.status === 'open' &&
    document.expires_at &&
    new Date(document.expires_at).getTime() <= now.getTime()
  ) {
    return 'Vencida';
  }
  return statusLabels[document.status] ?? 'Estado no reconocido; consulta el documento';
}

function withItems(header: string[], lines: string[], footer: string[]): string {
  const join = (details: string[]) => [...header, '', ...details, '', ...footer].join('\n');
  if (!lines.length)
    return join(['Detalle de partidas no disponible; consulta el documento original.']);
  if (join(lines).length <= MAX_WHATSAPP_MESSAGE_LENGTH) return join(lines);

  // Reserve the complete footer before choosing lines. Totals are never truncated.
  const selected: string[] = [];
  const summary = (count: number) =>
    `Resumen: ${count} de ${lines.length} partidas. Se omiten ${lines.length - count} del detalle; consulta el documento completo.`;
  for (const line of lines) {
    if (
      join([...selected, line, summary(selected.length + 1)]).length > MAX_WHATSAPP_MESSAGE_LENGTH
    ) {
      break;
    }
    selected.push(line);
  }
  const result = join([...selected, summary(selected.length)]);
  if (result.length > MAX_WHATSAPP_MESSAGE_LENGTH) {
    throw new Error('El resumen supera el tamaño permitido para WhatsApp.');
  }
  return result;
}

export function buildContactWhatsAppMessage({
  contact,
  businessName,
}: ContactWhatsAppInput): string {
  const purpose =
    contact.kind === 'supplier'
      ? 'Nos gustaría coordinar una compra contigo.'
      : '¿Cómo podemos ayudarte?';
  return `Hola, ${text(contact.name) || 'buen día'}. Te escribimos de ${business(businessName)}. ${purpose}`;
}

export function buildDocumentWhatsAppMessage({
  document,
  items,
  businessName,
  now = new Date(),
}: DocumentWhatsAppInput): string {
  if (document.type !== 'sale' && document.type !== 'quote') {
    throw new Error('Solo puedes compartir ventas y cotizaciones por este medio.');
  }
  const isQuote = document.type === 'quote';
  const header = [
    business(businessName),
    `${isQuote ? 'Cotización' : 'Resumen de venta'} ${text(document.number, 100)}`,
    `Cliente: ${text(document.contact_snapshot.name) || 'Cliente de mostrador'}`,
    `Fecha: ${date(document.created_at)}`,
    `Estado: ${documentStatus(document, now)}`,
  ];
  if (isQuote) header.push(`Vigencia hasta: ${date(document.expires_at)}`);

  const lines = items
    .filter((item) => item.document_id === document.id)
    .map(
      (item) =>
        `${number(item.quantity)} × ${itemName(item)}\n` +
        `  Precio unitario sin ITBIS: ${amount(item.unit_price)} · Importe con ITBIS: ${amount(item.line_total)}`,
    );
  const footer = [
    `Subtotal sin ITBIS: ${amount(document.subtotal)}`,
    `Descuento: ${amount(document.discount)}`,
    `ITBIS registrado: ${amount(document.tax)}`,
    `${isQuote ? 'Total cotizado' : 'Total original de la venta'}: ${amount(document.total)}`,
  ];
  if (!isQuote && document.payment_method) {
    footer.push(`Medio de pago registrado: ${paymentLabels[document.payment_method] ?? 'Otro'}`);
  }
  if (isQuote) {
    footer.push('Esta cotización no reserva existencias. Confirma su vigencia antes de comprar.');
  } else if (document.status === 'legacy_pending') {
    footer.push('Registro histórico pendiente de confirmar. Este mensaje no acredita un cobro.');
  } else if (['voided', 'cancelled'].includes(document.status)) {
    footer.push('Venta anulada. El total mostrado es el original; no representa un cobro vigente.');
  } else if (['returned', 'partially_returned'].includes(document.status)) {
    footer.push(
      'Importes originales antes de devoluciones. Consulta las devoluciones por separado.',
    );
  } else if (document.legacy?.payment_evidence === 'method_only') {
    footer.push('El registro histórico conserva el medio de pago, sin comprobante del cobro.');
  }
  footer.push('Documento interno. No es un comprobante fiscal.');
  return withItems(header, lines, footer);
}

export function buildQuoteWhatsAppMessage(input: DocumentWhatsAppInput): string {
  if (input.document.type !== 'quote') throw new Error('Selecciona una cotización.');
  return buildDocumentWhatsAppMessage(input);
}

export function buildSaleReceiptWhatsAppMessage(input: DocumentWhatsAppInput): string {
  if (input.document.type !== 'sale') throw new Error('Selecciona una venta.');
  return buildDocumentWhatsAppMessage(input);
}

export function buildDeliveryWhatsAppMessage({
  delivery,
  sale,
  items = [],
  businessName,
}: DeliveryWhatsAppInput): string {
  const linkedSale = sale?.type === 'sale' && sale.id === delivery.sale_id ? sale : undefined;
  const header = [
    business(businessName),
    `Hola, ${text(delivery.contact_name) || 'buen día'}.`,
    linkedSale
      ? `Entrega de la venta ${text(linkedSale.number, 100)}`
      : 'Información de tu entrega',
    `Estado de entrega: ${statusLabels[delivery.status] ?? 'No registrado'}`,
    `Fecha programada: ${deliverySchedule(delivery)}`,
    `Dirección: ${text(delivery.address, 350) || 'No registrada'}`,
  ];
  if (linkedSale) header.push(`Estado de venta: ${documentStatus(linkedSale, new Date())}`);
  if (delivery.delivered_at) header.push(`Entregada el: ${date(delivery.delivered_at)}`);
  if (delivery.received_by) header.push(`Recibió: ${text(delivery.received_by)}`);

  const lines = linkedSale
    ? items
        .filter((item) => item.document_id === linkedSale.id)
        .map((item) => `${number(item.quantity)} × ${itemName(item)}`)
    : [];
  const closing: Record<Delivery['status'], string> = {
    scheduled: 'Confírmanos si podrás recibir en esa fecha y dirección.',
    in_transit: 'Tu entrega está en camino.',
    delivered: 'Tu entrega figura como entregada. Gracias por recibirnos.',
    failed: 'No se completó la entrega. Escríbenos para coordinar el próximo paso.',
    cancelled: 'Esta entrega está cancelada.',
  };
  // A delivery does not carry a financial summary or recompute the original sale.
  const footer = [closing[delivery.status], DELIVERY_CHAT_REPLY];
  return lines.length
    ? withItems(header, lines, footer)
    : [...header, '', ...footer].join('\n');
}

export function buildDeliveryTrackingWhatsAppMessage({
  delivery,
  businessName,
  saleNumber,
}: {
  delivery: Delivery;
  businessName: string;
  saleNumber?: string;
}): string {
  const latest = [...delivery.history].sort((a, b) => b.at.localeCompare(a.at))[0];
  return [
    `${business(businessName)} · Seguimiento de entrega`,
    ...(saleNumber ? [`Venta: ${text(saleNumber, 100)}`] : []),
    `Estado: ${statusLabels[delivery.status] ?? 'No registrado'}`,
    `Fecha programada: ${deliverySchedule(delivery)}`,
    ...(latest ? [`Último evento: ${statusLabels[latest.status] ?? 'Actualización registrada'} · ${date(latest.at)}`] : []),
    DELIVERY_CHAT_REPLY,
    'Este resumen muestra eventos registrados; no incluye ubicación GPS ni una hora estimada de llegada.',
  ].join('\n');
}
