import type { RetailData } from './contracts';
import { barcodeMatches } from './barcode';

export interface CashierLine {
  variantId: string;
  quantity: number;
  expectedPrice: number;
  unitCost: number;
}

/** URL quick actions select one real active variant; they never invent a SKU or stock. */
export function cashierPrefill(
  data: Pick<RetailData, 'products' | 'variants' | 'stocks'>,
  kind: 'sale' | 'purchase' | 'quote',
  variantId: string,
  requestedQuantity = '1',
): { line: CashierLine | null; message: string } {
  if (!variantId) return { line: null, message: '' };
  const variant = data.variants.find((item) => item.id === variantId && item.active);
  const product =
    variant && data.products.find((item) => item.id === variant.product_id && item.active);
  if (!variant || !product)
    return {
      line: null,
      message: 'La variante solicitada ya no está disponible. Selecciona una variante activa.',
    };
  if (kind !== 'purchase' && (!Number.isFinite(variant.price) || variant.price <= 0))
    return {
      line: null,
      message:
        'La variante solicitada tiene el precio pendiente. Complétalo en Inventario antes de continuar.',
    };
  const requested = Number(requestedQuantity);
  let quantity = Number.isSafeInteger(requested) && requested > 0 ? requested : 1;
  let message = '';
  if (kind === 'sale') {
    const available = data.stocks.find((item) => item.variant_id === variantId)?.available ?? 0;
    if (available <= 0)
      return { line: null, message: 'La variante solicitada no tiene existencias disponibles.' };
    if (quantity > available) {
      quantity = available;
      message = 'La cantidad inicial se ajustó a las existencias disponibles.';
    }
  }
  return {
    line: { variantId, quantity, expectedPrice: variant.price, unitCost: variant.cost ?? 0 },
    message,
  };
}

export function exactCashierMatches(
  variants: Pick<RetailData['variants'][number], 'id' | 'sku' | 'barcode' | 'barcode_aliases'>[],
  input: string,
): string[] {
  const code = input.trim().toLocaleLowerCase('es');
  if (!code) return [];
  return variants
    .filter(
      (item) =>
        item.sku.trim().toLocaleLowerCase('es') === code ||
        barcodeMatches(item, input),
    )
    .map((item) => item.id);
}
