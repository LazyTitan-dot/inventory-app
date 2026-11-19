import { describe, expect, it } from 'vitest';
import { priceDocument, estimatedRefund, calculatePriceFromTotal, calculateUnitPrice, inventoryFinancialSummary, isValidCatalogAmount, MAX_CATALOG_PRICE, potentialUnitProfit, suggestFinalPrice } from './pricing';

describe('precio unitario con ITBIS', () => {
  it('muestra base, ITBIS y total sin convertir el precio almacenado en precio incluido', () => {
    expect(calculateUnitPrice(2000, 18)).toEqual({
      base: 2000,
      tax: 360,
      total: 2360,
      taxRate: 18,
    });
    expect(calculateUnitPrice(99.99, 18)).toEqual({
      base: 99.99,
      tax: 18,
      total: 117.99,
      taxRate: 18,
    });
  });
  it('redondea medios centavos hacia arriba como numeric de PostgreSQL', () => {
    expect(calculateUnitPrice(0.05, 10)?.tax).toBe(0.01);
    expect(calculateUnitPrice(0.15, 10)?.tax).toBe(0.02);
    expect(calculateUnitPrice(0.25, 10)?.total).toBe(0.28);
    expect(calculateUnitPrice(1.15, 10)?.tax).toBe(0.12);
  });
  it('admite tasa cero, tasa fraccionaria y límites sin perder centavos', () => {
    expect(calculateUnitPrice(100, 0)?.total).toBe(100);
    expect(calculateUnitPrice(20, 16.25)?.total).toBe(23.25);
    expect(calculateUnitPrice(MAX_CATALOG_PRICE, 100)?.total).toBe(1_999_999_999.98);
  });
  it('conserva cero como precio pendiente y rechaza entradas vacías o fuera de rango', () => {
    expect(calculateUnitPrice(0, 18)).toBeNull();
    for (const base of [NaN, Infinity, -1, MAX_CATALOG_PRICE + 1, 1.005])
      expect(calculateUnitPrice(base, 18)).toBeNull();
    for (const rate of [NaN, Infinity, -1, 100.01, 18.001])
      expect(calculateUnitPrice(100, rate)).toBeNull();
    expect(isValidCatalogAmount(0)).toBe(true);
    expect(isValidCatalogAmount(0.29)).toBe(true);
    expect(isValidCatalogAmount(0.001)).toBe(false);
  });
  it('redondea cada precio unitario antes de aplicarlo a una cantidad', () => {
    expect(calculateUnitPrice(0.05, 10)?.total).toBe(0.06);
    expect(calculateUnitPrice(0.1, 10)?.total).toBe(0.11);
  });
});

describe('final-price entry and cost suggestions', () => {
  it('suggests cost plus 25% as the complete final amount, without adding ITBIS twice', () => {
    expect(suggestFinalPrice(100, 18)).toMatchObject({ base: 105.93, tax: 19.07, total: 125, requestedTotal: 125 });
    expect(suggestFinalPrice(100, 0)).toMatchObject({ base: 125, tax: 0, total: 125 });
    expect(suggestFinalPrice(5000, 18)?.total).toBe(6250);
  });
  it('converts a manually chosen final amount to the existing net-price contract', () => {
    expect(calculatePriceFromTotal(150, 18)).toMatchObject({ base: 127.12, tax: 22.88, total: 150, roundingAdjustment: 0 });
  });
  it('reports the one-cent adjustment when net-price precision cannot represent a final cent', () => {
    const converted = calculatePriceFromTotal(100, 18)!;
    expect(converted).toMatchObject({ requestedTotal: 100, total: 99.99, roundingAdjustment: -0.01 });
    expect(calculateUnitPrice(converted.base, 18)?.total).toBe(converted.total);
  });
  it('keeps final entries and displayed tax breakdown consistent across rates', () => {
    for (const rate of [0, 10, 16.25, 18, 100]) for (let cents = 1; cents <= 1000; cents++) {
      const price = calculatePriceFromTotal(cents / 100, rate)!;
      expect(calculateUnitPrice(price.base, rate)?.total).toBe(price.total);
      expect(Math.abs(price.roundingAdjustment)).toBeLessThanOrEqual(0.01);
    }
  });
  it('keeps zero pending and rejects invalid or unrepresentable prices', () => {
    expect(suggestFinalPrice(0, 18)?.total).toBe(0);
    for (const value of [NaN, Infinity, -1, 0.001]) {
      expect(suggestFinalPrice(value, 18)).toBeNull();
      expect(calculatePriceFromTotal(value, 18)).toBeNull();
    }
    expect(suggestFinalPrice(MAX_CATALOG_PRICE, 18)).toBeNull();
    expect(calculatePriceFromTotal(100, 101)).toBeNull();
  });
  it('uses final price minus cost for potential gain and leaves unpriced variants pending', () => {
    expect(potentialUnitProfit(100, 80, 18)).toMatchObject({ finalPrice: 118, profit: 38 });
    expect(potentialUnitProfit(100, 130, 18)?.profit).toBe(-12);
    expect(potentialUnitProfit(0, 80, 18)).toBeNull();
  });
});

describe('resumen financiero compartido', () => {
  it('conserva la convención de Inventario, excluye precios pendientes y usa existencias disponibles', () => {
    const totals = inventoryFinancialSummary([
      { available: 3, variant: { price: 8000, cost: 5000 } },
      { available: 2, variant: { price: 0, cost: 1000 } },
      { available: 0, variant: { price: 500, cost: 100 } },
    ], 18);
    expect(totals).toEqual({value: 17000, revenue: 28320, potentialProfit: 13320});
  });
});

describe('importes comerciales por precio final de catálogo', () => {
  const ac = { variantId: 'b', unitPrice: 14830.51, quantity: 1, eligible: true };
  const grill = { variantId: 'a', unitPrice: 2457.63, quantity: 1, eligible: true };
  const fixed = (value: number) => ({ kind: 'amount' as const, value });

  it('concilia el catálogo, las dos líneas y el total del documento', () => {
    expect(priceDocument([ac, grill], 18, fixed(0))).toEqual({
      subtotal: 17288.14, eligible: 17288.14, discount: 0, tax: 3111.86, total: 20400,
    });
    expect(priceDocument([{ ...grill, quantity: 3 }], 18, fixed(100))).toMatchObject({
      subtotal: 7372.89, discount: 100, tax: 1309.11, total: 8582,
    });
  });

  it('respeta elegibilidad, orden de adición, porcentaje, exención y descuento completo', () => {
    const scoped = [{ ...ac, eligible: false }, grill];
    const percent = { kind: 'percent' as const, value: 10 };
    expect(priceDocument(scoped, 18, percent)).toEqual({
      subtotal: 17288.14, eligible: 2457.63, discount: 245.76, tax: 3067.62, total: 20110,
    });
    expect(priceDocument(scoped, 18, percent)).toEqual(priceDocument([...scoped].reverse(), 18, percent));
    expect(priceDocument([ac], 0, fixed(100)).total).toBe(14730.51);
    expect(priceDocument([grill], 18, fixed(2457.63))).toMatchObject({ total: 0, tax: 0 });
    expect(priceDocument([{ ...grill, quantity: 0 }], 18, fixed(100)).total).toBe(0);
    expect(priceDocument([{ ...grill, unitPrice: 0.02, quantity: 999999 }], 18, fixed(0)).total).toBe(19999.98);
  });

  it('reparte el total cobrado sin superar el saldo, independientemente de la agrupación', () => {
    const item = { product_snapshot: { catalog_unit_rounding: true }, unit_price: 2457.63,
      quantity: 3, returned_quantity: 0, discount: 100, tax: 1309.11, line_total: 8582 };
    expect([0, 1, 2].map(n => estimatedRefund({ ...item, returned_quantity: n }, 1)))
      .toEqual([2860.67, 2860.66, 2860.67]);
    expect(estimatedRefund(item, 2)).toBe(5721.33);
    expect(estimatedRefund(item, 3)).toBe(8582);
    expect(estimatedRefund({ ...item, returned_quantity: 2 }, 2)).toBe(0);
    expect(estimatedRefund({ ...item, product_snapshot: {}, tax: 1309.12, line_total: 8582.01,
      returned_quantity: 1 }, 1)).toBe(2860.67);
  });
});
