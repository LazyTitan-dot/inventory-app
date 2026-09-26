export const MAX_CATALOG_PRICE = 999_999_999.99;

function cents(value: number, maximum: number): bigint | null {
  if (!Number.isFinite(value) || value < 0 || value > maximum) return null;
  const decimal = value.toFixed(2);
  if (Number(decimal) !== value) return null;
  return BigInt(decimal.replace('.', ''));
}

export function isValidCatalogAmount(value: number): boolean {
  return cents(value, MAX_CATALOG_PRICE) !== null;
}

export interface UnitPrice {
  base: number;
  tax: number;
  total: number;
  taxRate: number;
}

/** One unit without a discount: PostgreSQL round(base * rate / 100, 2), half up.
 * Document totals can round differently when several units/discounts are combined.
 * Zero remains a pending catalog price, not an offer of a free product.
 */
export function calculateUnitPrice(basePrice: number, taxRate: number): UnitPrice | null {
  const base = cents(basePrice, MAX_CATALOG_PRICE);
  const rate = cents(taxRate, 100);
  if (base === null || rate === null || base === 0n) return null;
  const tax = (base * rate + 5_000n) / 10_000n;
  return {
    base: Number(base) / 100,
    tax: Number(tax) / 100,
    total: Number(base + tax) / 100,
    taxRate,
  };
}
