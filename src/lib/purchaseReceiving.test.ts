import { describe, expect, it } from 'vitest';
import type { DocumentItem, Variant } from './contracts';
import { countPurchaseBarcode, preparePurchaseReceipt, remainingPurchaseQuantity, type ReceiptDraft } from './purchaseReceiving';

const item = (overrides: Partial<DocumentItem> = {}): DocumentItem => ({
  id: 'line-a', document_id: 'purchase', variant_id: 'variant-a',
  product_snapshot: { category: 'other', brand: 'Marca', model: 'Modelo', name: 'Estándar', sku: 'SKU-A', barcode: 'BAR-A', warranty_months: 12 },
  quantity: 5, received_quantity: 2, damaged_quantity: 1, returned_quantity: 0,
  unit_price: 20, unit_cost: 20, discount: 0, tax: 0, line_total: 100, parent_item_id: null,
  ...overrides,
});
const variants: Pick<Variant, 'id' | 'sku' | 'barcode' | 'barcode_aliases'>[] = [
  { id: 'variant-a', sku: 'CURRENT-A', barcode: 'CURRENT-BAR-A', barcode_aliases: ['6946087393113'] },
  { id: 'variant-b', sku: 'FOREIGN-SKU', barcode: 'FOREIGN-BAR' },
];
const draft = (quantity: string, damagedQuantity = '0'): ReceiptDraft => ({ 'line-a': { quantity, damagedQuantity } });
const scan = (value: string, counts: ReceiptDraft = {}, previous: { value: string; at: number } | null = null, at = 1000, items: DocumentItem[] = [item()]) =>
  countPurchaseBarcode({ value, items, variants, draft: counts, previous, at });

describe('purchase receiving quantities', () => {
  it('uses all already-accounted units when calculating remaining stock', () => {
    expect(remainingPurchaseQuantity(item())).toBe(3);
    expect(remainingPurchaseQuantity(item({ received_quantity: 5 }))).toBe(0);
  });
  it('sends good and quarantined damaged counts together within the pending quantity', () => {
    expect(preparePurchaseReceipt([item()], draft('2', '1'), true)).toEqual({
      lines: [{ item_id: 'line-a', quantity: 2, damaged_quantity: 1 }], good: 2, damaged: 1, error: '',
    });
  });
  it('allows a damaged-only receipt without adding sellable units', () => {
    expect(preparePurchaseReceipt([item()], draft('0', '3'), true).lines).toEqual([{ item_id: 'line-a', quantity: 0, damaged_quantity: 3 }]);
  });
  it('rejects combined over-receipt even when both individual counts fit', () => {
    const prepared = preparePurchaseReceipt([item()], draft('2', '2'), true);
    expect(prepared.error).toContain('juntas');
    expect(prepared.lines).toEqual([]);
  });
  it.each(['-1', '1.5', 'Infinity', 'NaN', '9007199254740992'])('rejects invalid good quantity %s', (value) => {
    expect(preparePurchaseReceipt([item()], draft(value), true).error).toContain('enteros');
  });
  it.each(['-1', '0.5', 'Infinity'])('rejects invalid damaged quantity %s', (value) => {
    expect(preparePurchaseReceipt([item()], draft('1', value), true).error).toContain('enteros');
  });
  it('requires at least one counted unit', () => {
    expect(preparePurchaseReceipt([item()], draft('', ''), true).error).toContain('al menos una');
  });
  it('rejects a previously staged line after it becomes fully received', () => {
    expect(preparePurchaseReceipt([item({ received_quantity: 5 })], draft('1'), true).error).toContain('pendiente');
  });
  it('rejects staged items removed from the current order or missing their variant link', () => {
    expect(preparePurchaseReceipt([], draft('1'), true).error).toContain('vinculada');
    expect(preparePurchaseReceipt([item({ variant_id: null })], draft('1'), true).error).toContain('vinculada');
  });
  it('retains quantity-only payload compatibility when receipt capabilities are absent', () => {
    expect(preparePurchaseReceipt([item()], draft('2'), false).lines).toEqual([{ item_id: 'line-a', quantity: 2 }]);
    expect(preparePurchaseReceipt([item()], draft('1', '1'), false).error).toContain('dañadas');
  });
});

describe('purchase receipt scanning', () => {
  it('accepts exact stored and current barcode/SKU values case-insensitively', () => {
    for (const code of ['BAR-A', ' sku-a ', 'CURRENT-A', 'current-bar-a', '6946087393113']) {
      const counted = scan(code);
      expect(counted.accepted).toBe(true);
      expect(counted.draft['line-a']?.quantity).toBe('1');
    }
  });
  it('rejects a catalog variant that is not in this order and partial SKU text', () => {
    expect(scan('FOREIGN-SKU').accepted).toBe(false);
    expect(scan('FOREIGN-BAR').accepted).toBe(false);
    expect(scan('SKU').accepted).toBe(false);
  });
  it('does not count fully received or historical unlinked items', () => {
    expect(scan('SKU-A', {}, null, 1000, [item({ received_quantity: 5 })]).message).toContain('por completo');
    expect(scan('SKU-A', {}, null, 1000, [item({ variant_id: null })]).accepted).toBe(false);
  });
  it('blocks rapid duplicate scans but accepts the same physical code after the debounce window', () => {
    const first = scan('BAR-A', {}, null, 1000);
    expect(scan('bar-a', first.draft, first.scan, 1949).accepted).toBe(false);
    const next = scan('bar-a', first.draft, first.scan, 1950);
    expect(next.accepted).toBe(true);
    expect(next.draft['line-a']?.quantity).toBe('2');
  });
  it('does not count beyond good plus damaged provisional quantities', () => {
    const counts = draft('1', '2');
    const counted = scan('BAR-A', counts);
    expect(counted.accepted).toBe(false);
    expect(counted.draft).toBe(counts);
  });
  it('refuses ambiguous codes rather than choosing an arbitrary order line', () => {
    const counted = scan('SKU-A', {}, null, 1000, [item(), item({ id: 'line-b', variant_id: 'variant-b' })]);
    expect(counted.accepted).toBe(false);
    expect(counted.message).toContain('varias líneas');
  });
  it('does not mutate the prior provisional count or consume a rejected scan', () => {
    const counts = draft('1');
    const counted = scan('BAR-A', counts);
    expect(counts['line-a']?.quantity).toBe('1');
    expect(counted.draft['line-a']?.quantity).toBe('2');
    expect(scan('FOREIGN-BAR').scan).toBeNull();
  });
  it('rejects an invalid manual count before adding a scanned unit', () => {
    expect(scan('BAR-A', draft('-1')).message).toContain('Corrige');
  });
});
