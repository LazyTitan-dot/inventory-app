import { describe, expect, it } from 'vitest';
import { calculateUnitPrice, isValidCatalogAmount, MAX_CATALOG_PRICE } from './pricing';

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
