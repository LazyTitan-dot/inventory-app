import type { RetailData, RetailDocument } from './contracts';
import { businessDate, documentNumber } from './format';
import { stockOverview } from './reports';

/** Calendar arithmetic is deliberately independent of the executor's timezone. */
export function calendarDaysEnding(today: string, days: 7 | 30): string[] {
  const end = new Date(`${today}T12:00:00Z`);
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(end);
    date.setUTCDate(date.getUTCDate() - (days - index - 1));
    return date.toISOString().slice(0, 10);
  });
}

export function salesTrend(documents: RetailDocument[], today: string, days: 7 | 30) {
  const dates = calendarDaysEnding(today, days);
  const amounts = new Map(dates.map((day) => [day, 0]));
  for (const document of documents) {
    const sale = document.type === 'sale' && ['completed', 'partially_returned', 'returned'].includes(document.status);
    if (!sale && document.type !== 'return') continue;
    const day = businessDate(new Date(document.created_at));
    if (amounts.has(day)) amounts.set(day, amounts.get(day)! + document.total * (sale ? 1 : -1));
  }
  return dates.map((day) => ({ day, amount: Math.round(amounts.get(day)! * 100) / 100 }));
}

export type DashboardTask = {
  id: string;
  level: 'urgent' | 'attention' | 'neutral';
  kind: 'stock' | 'purchase' | 'delivery';
  title: string;
  detail: string;
  context: string;
  to: string;
};

export function dashboardTasks(data: RetailData, now: Date): DashboardTask[] {
  const tasks: DashboardTask[] = stockOverview(data)
    .filter((row) => row.available <= row.variant.min_stock)
    .sort((a, b) => a.available - b.available || a.variant.sku.localeCompare(b.variant.sku))
    .map((row) => ({
      id: `stock-${row.variant.id}`,
      level: row.available === 0 ? 'urgent' : 'attention',
      kind: 'stock',
      title: row.available === 0 ? 'Variante agotada' : 'Reponer existencias',
      detail: `${row.product.brand} ${row.product.model} · ${row.variant.name}`,
      context: `${row.available} disponibles · mínimo ${row.variant.min_stock}${data.permissions.purchase && row.incoming > 0 ? ` · ${row.incoming} en camino` : ''}`,
      to: `/inventario?variante=${encodeURIComponent(row.variant.id)}`,
    }));
  if (data.permissions.purchase) {
    for (const purchase of data.documents.filter((doc) => doc.type === 'purchase' && ['pending', 'partial'].includes(doc.status))) {
      const remaining = data.document_items.filter((item) => item.document_id === purchase.id).reduce((sum, item) => sum + Math.max(0, item.quantity - item.received_quantity), 0);
      const overdue = Boolean(purchase.expected_at && purchase.expected_at.slice(0, 10) < businessDate(now));
      tasks.push({
        id: `purchase-${purchase.id}`, level: overdue ? 'urgent' : 'neutral', kind: 'purchase', title: overdue ? 'Compra atrasada' : 'Compra por recibir',
        detail: typeof purchase.contact_snapshot.name === 'string' ? purchase.contact_snapshot.name : 'Proveedor',
        context: `${documentNumber(purchase)} · ${remaining} unidades pendientes`, to: `/compras?documento=${encodeURIComponent(purchase.id)}`,
      });
    }
  }
  if (data.permissions.sell || data.permissions.manage_business || data.permissions.purchase) {
    for (const delivery of data.deliveries.filter((item) => !['delivered', 'cancelled'].includes(item.status))) {
      const late = new Date(delivery.scheduled_at).getTime() < now.getTime();
      tasks.push({
        id: `delivery-${delivery.id}`, level: late || delivery.status === 'failed' ? 'urgent' : 'neutral', kind: 'delivery',
        title: delivery.status === 'failed' ? 'Reprogramar entrega' : late ? 'Entrega atrasada' : 'Entrega por gestionar',
        detail: delivery.contact_name, context: delivery.address, to: `/entregas?documento=${encodeURIComponent(delivery.id)}`,
      });
    }
  }
  const rank = { urgent: 0, attention: 1, neutral: 2 };
  return tasks.sort((a, b) => rank[a.level] - rank[b.level]);
}

export function dashboardActivity(data: RetailData) {
  const commerce = data.permissions.sell || data.permissions.manage_business;
  const allowed = data.documents.filter((doc) => doc.type === 'purchase' ? data.permissions.purchase : commerce);
  const labels = { sale: 'Venta registrada', purchase: 'Compra registrada', quote: 'Cotización registrada', return: 'Devolución registrada' };
  const routes = { sale: 'ventas', purchase: 'compras', quote: 'cotizaciones', return: 'posventa' };
  const rows = allowed.map((doc) => ({
    id: `document-${doc.id}`, at: doc.created_at, title: `${labels[doc.type]} · ${documentNumber(doc)}`,
    detail: typeof doc.contact_snapshot.name === 'string' ? doc.contact_snapshot.name : '',
    amount: doc.type !== 'purchase' || data.permissions.view_costs ? doc.total * (doc.type === 'return' ? -1 : 1) : null,
    quantity: null as number | null, to: `/${routes[doc.type]}?documento=${encodeURIComponent(doc.id)}`,
  }));
  const variants = new Map(data.variants.map((variant) => [variant.id, variant]));
  const products = new Map(data.products.map((product) => [product.id, product]));
  for (const movement of data.movements.filter((movement) => !movement.document_id)) {
    const variant = variants.get(movement.variant_id);
    const product = variant ? products.get(variant.product_id) : undefined;
    rows.push({
      id: `movement-${movement.id}`, at: movement.created_at, title: 'Ajuste de inventario',
      detail: product && variant ? `${product.brand} ${product.model} · ${variant.sku}` : 'Variante de inventario',
      amount: null, quantity: movement.after_quantity - movement.before_quantity, to: `/inventario?variante=${encodeURIComponent(movement.variant_id)}`,
    });
  }
  return rows.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6);
}
