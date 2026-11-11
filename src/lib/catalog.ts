import type { RetailData } from './contracts';

export type StockHealth = 'available' | 'low' | 'out';
export function stockHealth(available: number, minimum: number): StockHealth {
  return available <= 0 ? 'out' : available <= minimum ? 'low' : 'available';
}
export const stockHealthLabels: Record<StockHealth, string> = {
  available: 'Disponible',
  low: 'Stock bajo',
  out: 'Agotado',
};

/** Drafts and closed-short/cancelled orders never count as stock on the way. */
export function pendingPurchaseUnits(
  data: Pick<RetailData, 'documents' | 'document_items'>,
  variantId: string,
): number {
  const orders = new Set(
    data.documents
      .filter(
        (order) =>
          order.type === 'purchase' &&
          ['pending', 'partial'].includes(order.status) &&
          !order.closed_short,
      )
      .map((order) => order.id),
  );
  return data.document_items
    .filter((item) => orders.has(item.document_id) && item.variant_id === variantId)
    .reduce((sum, item) => sum + Math.max(0, item.quantity - item.received_quantity), 0);
}
export const replenishmentQuantity = (target: number, available: number, incoming: number) =>
  Math.max(0, target - available - incoming);
