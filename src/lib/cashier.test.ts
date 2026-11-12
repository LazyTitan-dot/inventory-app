import { describe, expect, it } from 'vitest';
import { cashierPrefill, exactCashierMatches } from './cashier';

const at = '2026-11-11T10:00:00Z';
const data = {
  products: [
    {
      id: 'product',
      category: 'other',
      brand: 'Marca',
      model: 'Modelo',
      description: '',
      warranty_months: 12,
      images: [],
      active: true,
      created_at: at,
      updated_at: at,
    },
  ],
  variants: [
    {
      id: 'variant',
      product_id: 'product',
      name: 'Estándar',
      sku: 'SKU-1',
      barcode: '00123',
      cost: 35,
      price: 50,
      min_stock: 2,
      reorder_target: 5,
      active: true,
      created_at: at,
      updated_at: at,
    },
  ],
  stocks: [{ variant_id: 'variant', available: 3, quarantine: 4, updated_at: at }],
};

describe('cashier URL and scanner boundaries', () => {
  it('prefills only the exact active variant and never substitutes the first catalogue item', () => {
    expect(cashierPrefill(data, 'sale', 'unknown').line).toBeNull();
    expect(
      cashierPrefill(
        { ...data, products: [{ ...data.products[0]!, active: false }] },
        'sale',
        'variant',
      ).line,
    ).toBeNull();
    expect(cashierPrefill(data, 'sale', 'variant', '2').line).toEqual({
      variantId: 'variant',
      quantity: 2,
      expectedPrice: 50,
      unitCost: 35,
    });
  });
  it('caps quick-sale quantities at available stock, excluding quarantine, while purchases use requested replenishment', () => {
    const sale = cashierPrefill(data, 'sale', 'variant', '20');
    expect(sale.line?.quantity).toBe(3);
    expect(sale.message).toContain('ajustó');
    expect(cashierPrefill(data, 'purchase', 'variant', '20').line?.quantity).toBe(20);
    expect(
      cashierPrefill({ ...data, stocks: [{ ...data.stocks[0]!, available: 0 }] }, 'sale', 'variant')
        .line,
    ).toBeNull();
  });
  it('rejects pending selling prices and does not trust malformed URL quantities', () => {
    const pending = { ...data, variants: [{ ...data.variants[0]!, price: 0 }] };
    expect(cashierPrefill(pending, 'sale', 'variant').line).toBeNull();
    expect(cashierPrefill(pending, 'quote', 'variant').line).toBeNull();
    expect(cashierPrefill(pending, 'purchase', 'variant', 'NaN').line?.quantity).toBe(1);
    expect(cashierPrefill(data, 'purchase', 'variant', '-100').line?.quantity).toBe(1);
  });
  it('returns every exact normalized scanner match so ambiguous codes cannot silently select a product', () => {
    const variants = [...data.variants, { ...data.variants[0]!, id: 'other', sku: 'sku-2' }];
    expect(exactCashierMatches(variants, ' 00123 ')).toEqual(['variant', 'other']);
    expect(exactCashierMatches(variants, ' sku-1 ')).toEqual(['variant']);
    expect(exactCashierMatches(variants, 'SKU')).toEqual([]);
    expect(exactCashierMatches(variants, ' ')).toEqual([]);
  });
  it('selects the same exact variant with its internal and manufacturer codes', () => {
    const variants = [{ ...data.variants[0]!, barcode_aliases: ['6946087393113'] }];
    expect(exactCashierMatches(variants, ' 6946087393113 ')).toEqual(['variant']);
    expect(exactCashierMatches(variants, '00123')).toEqual(['variant']);
    expect(exactCashierMatches(variants, '6946087')).toEqual([]);
  });
});
