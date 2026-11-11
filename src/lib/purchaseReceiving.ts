import type { DocumentItem, Variant } from './contracts';

export type ReceiptCount = { quantity: string; damagedQuantity: string };
export type ReceiptDraft = Record<string, ReceiptCount>;
export type ReceiptLine = { item_id: string; quantity: number; damaged_quantity?: number };
export type ReceiptScan = { value: string; at: number };
export const RECEIPT_SCAN_DEBOUNCE_MS = 950;

export function remainingPurchaseQuantity(item: Pick<DocumentItem, 'quantity' | 'received_quantity'>) {
  return Math.max(0, item.quantity - item.received_quantity);
}

export function purchaseItemTitle(item: Pick<DocumentItem, 'product_snapshot'>) {
  return [item.product_snapshot.brand, item.product_snapshot.model].filter(Boolean).join(' ');
}

function countValue(value: string | undefined) {
  return value?.trim() ? Number(value) : 0;
}

/** Validate against the current order, including staged lines that just became fully received. */
export function preparePurchaseReceipt(
  items: readonly DocumentItem[],
  draft: ReceiptDraft,
  allowDamaged: boolean,
): { lines: ReceiptLine[]; good: number; damaged: number; error: string } {
  const lines: ReceiptLine[] = [];
  let good = 0;
  let damaged = 0;
  const failure = (error: string) => ({ lines: [], good: 0, damaged: 0, error });
  for (const [id, count] of Object.entries(draft)) {
    const quantity = countValue(count.quantity);
    const damagedQuantity = countValue(count.damagedQuantity);
    if (!Number.isSafeInteger(quantity) || !Number.isSafeInteger(damagedQuantity) || quantity < 0 || damagedQuantity < 0)
      return failure('Las cantidades deben ser números enteros mayores o iguales a cero.');
    if (!quantity && !damagedQuantity) continue;
    const item = items.find((line) => line.id === id);
    if (!item || !item.variant_id)
      return failure('Una referencia del conteo ya no está vinculada al inventario. Revisa la orden antes de recibirla.');
    if (!allowDamaged && damagedQuantity)
      return failure('No se pueden registrar unidades dañadas en esta recepción. Conserva el conteo y consulta al administrador.');
    if (quantity + damagedQuantity > remainingPurchaseQuantity(item))
      return failure('Las unidades conformes y dañadas juntas no pueden superar lo pendiente de cada referencia.');
    good += quantity;
    damaged += damagedQuantity;
    lines.push({ item_id: id, quantity, ...(allowDamaged ? { damaged_quantity: damagedQuantity } : {}) });
  }
  if (!lines.length) return failure('Indica al menos una unidad recibida.');
  return { lines, good, damaged, error: '' };
}

/** Match exact barcode/SKU values only; never select a different product from partial text. */
export function countPurchaseBarcode({
  value,
  items,
  variants,
  draft,
  previous,
  at,
}: {
  value: string;
  items: readonly DocumentItem[];
  variants: readonly Pick<Variant, 'id' | 'barcode' | 'sku'>[];
  draft: ReceiptDraft;
  previous: ReceiptScan | null;
  at: number;
}): { draft: ReceiptDraft; scan: ReceiptScan | null; message: string; accepted: boolean } {
  const normalized = value.trim().toLocaleLowerCase('es');
  const reject = (message: string) => ({ draft, scan: previous, message, accepted: false });
  if (!normalized) return reject('Escanea un código de barras o introduce un SKU completo.');
  const matched = items.filter((item) => {
    if (!item.variant_id) return false;
    const current = variants.find((variant) => variant.id === item.variant_id);
    return [item.product_snapshot.sku, item.product_snapshot.barcode, current?.sku, current?.barcode]
      .some((code) => code?.trim().toLocaleLowerCase('es') === normalized);
  });
  if (!matched.length) return reject('El código no corresponde a una referencia de esta orden.');
  if (matched.length !== 1) return reject('El código coincide con varias líneas. Registra las cantidades manualmente para evitar confusiones.');
  const item = matched[0]!;
  if (remainingPurchaseQuantity(item) === 0) return reject('Esta referencia ya está recibida por completo.');
  if (previous?.value === normalized && at - previous.at < RECEIPT_SCAN_DEBOUNCE_MS)
    return reject('Escaneo repetido muy rápido. Espera un momento y vuelve a pasar el lector.');
  const existing = draft[item.id] ?? { quantity: '0', damagedQuantity: '0' };
  const quantity = countValue(existing.quantity);
  const damaged = countValue(existing.damagedQuantity);
  if (!Number.isSafeInteger(quantity) || !Number.isSafeInteger(damaged) || quantity < 0 || damaged < 0)
    return reject('Corrige las cantidades de esta referencia antes de seguir escaneando.');
  if (quantity + damaged >= remainingPurchaseQuantity(item))
    return reject('El conteo provisional ya cubre lo pendiente de esta referencia.');
  return {
    draft: { ...draft, [item.id]: { ...existing, quantity: String(quantity + 1) } },
    scan: { value: normalized, at },
    message: `${purchaseItemTitle(item)}: +1 conforme. Conteo provisional; aún no se guardó la recepción.`,
    accepted: true,
  };
}
