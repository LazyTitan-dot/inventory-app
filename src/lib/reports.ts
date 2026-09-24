import type { RetailData } from './contracts';
import { businessDate } from './format';

export function reportForPeriod(
  data: Pick<RetailData, 'documents' | 'document_items'>,
  from: string,
  to: string,
) {
  const included = data.documents.filter((d) => {
    const day = businessDate(new Date(d.created_at));
    return (
      day >= from &&
      day <= to &&
      ((d.type === 'sale' && ['completed', 'partially_returned', 'returned'].includes(d.status)) ||
        d.type === 'return')
    );
  });
  const sales = included.filter((d) => d.type === 'sale');
  const refunds = included.filter((d) => d.type === 'return');
  const sum = (docs: typeof sales, field: 'total' | 'tax' | 'discount' | 'subtotal') =>
    docs.reduce((total, d) => total + d[field], 0);
  const total = sum(sales, 'total') - sum(refunds, 'total');
  const tax = sum(sales, 'tax') - sum(refunds, 'tax');
  const netRevenue = total - tax;
  const byId = new Map(included.map((d) => [d.id, d]));
  const items = data.document_items.filter((item) => byId.has(item.document_id));
  const cost = items.reduce(
    (total, item) =>
      total +
      item.quantity *
        (item.unit_cost ?? 0) *
        (byId.get(item.document_id)?.type === 'return' ? -1 : 1),
    0,
  );
  const categoryMap = new Map<string, number>();
  for (const item of items) {
    const sign = byId.get(item.document_id)?.type === 'return' ? -1 : 1;
    categoryMap.set(
      item.product_snapshot.category,
      (categoryMap.get(item.product_snapshot.category) ?? 0) + (item.line_total - item.tax) * sign,
    );
  }
  const payments = new Map<string, number>();
  for (const doc of included)
    payments.set(
      doc.payment_method ?? 'other',
      (payments.get(doc.payment_method ?? 'other') ?? 0) +
        doc.total * (doc.type === 'return' ? -1 : 1),
    );
  return {
    sales,
    refunds,
    included,
    total,
    tax,
    netRevenue,
    cost,
    profit: netRevenue - cost,
    categories: [...categoryMap.entries()].sort((a, b) => b[1] - a[1]),
    payments: [...payments.entries()],
  };
}

export function stockOverview(
  data: Pick<RetailData, 'products' | 'variants' | 'stocks' | 'documents' | 'document_items'>,
) {
  const activeProducts = new Map(data.products.filter((p) => p.active).map((p) => [p.id, p]));
  const stockById = new Map(data.stocks.map((s) => [s.variant_id, s]));
  const purchaseIds = new Set(
    data.documents
      .filter((d) => d.type === 'purchase' && ['pending', 'partial'].includes(d.status))
      .map((d) => d.id),
  );
  const incoming = new Map<string, number>();
  for (const item of data.document_items)
    if (item.variant_id && purchaseIds.has(item.document_id))
      incoming.set(
        item.variant_id,
        (incoming.get(item.variant_id) ?? 0) + item.quantity - item.received_quantity,
      );
  return data.variants
    .filter((v) => v.active && activeProducts.has(v.product_id))
    .map((v) => {
      const available = stockById.get(v.id)?.available ?? 0;
      const inTransit = incoming.get(v.id) ?? 0;
      return {
        variant: v,
        product: activeProducts.get(v.product_id)!,
        available,
        incoming: inTransit,
        suggested:
          available <= v.min_stock ? Math.max(0, v.reorder_target - available - inTransit) : 0,
      };
    });
}
