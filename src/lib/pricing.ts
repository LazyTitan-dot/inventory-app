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

export const SUGGESTED_PRICE_MARKUP = 25;

export interface FinalPrice extends UnitPrice {
  requestedTotal: number;
  roundingAdjustment: number;
}

/** Convert a tax-inclusive entry to the existing two-decimal net-price contract.
 * A few gross cents cannot be represented by that contract. Pick the closest
 * supported total (the lower one on a tie) and expose the adjustment to the UI.
 */
export function calculatePriceFromTotal(totalPrice: number, taxRate: number): FinalPrice | null {
  const total = cents(totalPrice, MAX_CATALOG_PRICE * 2);
  const rate = cents(taxRate, 100);
  if (total === null || rate === null) return null;
  if (total === 0n) return { base: 0, tax: 0, total: 0, taxRate, requestedTotal: 0, roundingAdjustment: 0 };
  const divisor = 10_000n + rate;
  const estimate = (total * 10_000n + divisor / 2n) / divisor;
  const maximum = cents(MAX_CATALOG_PRICE, MAX_CATALOG_PRICE)!;
  let best: { base: bigint; tax: bigint; total: bigint; difference: bigint } | null = null;
  for (const base of [estimate - 1n, estimate, estimate + 1n]) {
    if (base <= 0n || base > maximum) continue;
    const tax = (base * rate + 5_000n) / 10_000n;
    const candidate = base + tax;
    const difference = candidate >= total ? candidate - total : total - candidate;
    if (!best || difference < best.difference || (difference === best.difference && candidate < best.total))
      best = { base, tax, total: candidate, difference };
  }
  if (!best || best.difference > 1n) return null;
  return {
    base: Number(best.base) / 100,
    tax: Number(best.tax) / 100,
    total: Number(best.total) / 100,
    taxRate,
    requestedTotal: totalPrice,
    roundingAdjustment: Number(best.total - total) / 100,
  };
}

/** The agreed 25% is already part of the final selling amount, including ITBIS. */
export function suggestFinalPrice(cost: number, taxRate: number): FinalPrice | null {
  const value = cents(cost, MAX_CATALOG_PRICE);
  if (value === null) return null;
  const target = (value * 125n + 50n) / 100n;
  return calculatePriceFromTotal(Number(target) / 100, taxRate);
}

/** Display estimate requested by the business: final selling price minus cost. */
export function potentialUnitProfit(basePrice: number, cost: number, taxRate: number) {
  const price = calculateUnitPrice(basePrice, taxRate);
  const costCents = cents(cost, MAX_CATALOG_PRICE);
  if (!price || costCents === null) return null;
  const finalCents = cents(price.total, MAX_CATALOG_PRICE * 2)!;
  const profit = Number(finalCents - costCents) / 100;
  return { finalPrice: price.total, profit, margin: (profit / price.total) * 100 };
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
