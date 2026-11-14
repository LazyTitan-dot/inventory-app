import { describe, expect, it } from 'vitest';
import { calculatePriceFromTotal, calculateUnitPrice, inventoryFinancialSummary, isValidCatalogAmount, MAX_CATALOG_PRICE, potentialUnitProfit, suggestFinalPrice } from './pricing';

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
  it('distingue el total unitario del redondeo de una factura con varias unidades', () => {
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
