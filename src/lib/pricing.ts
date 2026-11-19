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
    const tax = share(base, rate, 10_000n);
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
 * Zero remains a pending catalog price, not an offer of a free product.
 */
export function calculateUnitPrice(basePrice: number, taxRate: number): UnitPrice | null {
  const base = cents(basePrice, MAX_CATALOG_PRICE);
  const rate = cents(taxRate, 100);
  if (base === null || rate === null || base === 0n) return null;
  const tax = share(base, rate, 10_000n);
  return {
    base: Number(base) / 100,
    tax: Number(tax) / 100,
    total: Number(base + tax) / 100,
    taxRate,
  };
}

// All weights and money are integers here. A cumulative share gives the same
// result for a reversal or partial refund regardless of how it was split.
function share(value: bigint, part: bigint, whole: bigint): bigint {
  return whole === 0n ? 0n : (2n * value * part + whole) / (2n * whole);
}

const asMoney = (value: bigint) => Number(value) / 100;
const moneyCents = (value: number) => cents(value, 100_000_000_000_000) ?? 0n;

export function percentageAmount(amount: number, percent: number): number {
  return asMoney(share(moneyCents(amount), cents(percent, 100) ?? 0n, 10_000n));
}

type PriceLine = { variantId: string; unitPrice: number; quantity: number; eligible: boolean };
type Discount = { kind: 'percent' | 'amount'; value: number };

export function priceDocument(lines: PriceLine[], taxRate: number, requested: Discount) {
  const rate = cents(taxRate, 100) ?? 0n;
  const ordered = lines.map((line) => {
    const quantity = Number.isSafeInteger(line.quantity) && line.quantity > 0
      && line.quantity <= 999_999 ? BigInt(line.quantity) : 0n;
    const unit = cents(line.unitPrice, MAX_CATALOG_PRICE) ?? 0n;
    const base = unit * quantity;
    const gross = (unit + share(unit, rate, 10_000n)) * quantity;
    return { id: line.variantId, base, gross, weight: line.eligible ? base : 0n };
  }).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const subtotal = ordered.reduce((sum, line) => sum + line.base, 0n);
  const eligible = ordered.reduce((sum, line) => sum + line.weight, 0n);
  const requestedCents = requested.kind === 'percent'
    ? share(eligible, cents(requested.value, 100) ?? 0n, 10_000n)
    : moneyCents(requested.value);
  const discount = requestedCents < eligible ? requestedCents : eligible;
  let weightThrough = 0n;
  let discountThrough = 0n;
  let total = 0n;
  for (const line of ordered) {
    weightThrough += line.weight;
    const nextDiscount = share(discount, weightThrough, eligible);
    const net = line.base - (nextDiscount - discountThrough);
    total += share(line.gross, net, line.base);
    discountThrough = nextDiscount;
  }
  return {
    subtotal: asMoney(subtotal), eligible: asMoney(eligible), discount: asMoney(discount),
    tax: asMoney(total - (subtotal - discount)), total: asMoney(total),
  };
}

type RefundLine = {
  quantity: number; returned_quantity: number; unit_price: number; discount: number; tax: number;
  line_total: number; product_snapshot: { catalog_unit_rounding?: boolean };
};

export function estimatedRefund(item: RefundLine, quantity: number): number {
  if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > item.quantity - item.returned_quantity) return 0;
  const count = BigInt(item.quantity);
  const before = BigInt(item.returned_quantity);
  const after = before + BigInt(quantity);
  function allocated(amount: number) {
    const value = moneyCents(amount);
    return share(value, after, count) - share(value, before, count);
  }
  if (item.product_snapshot.catalog_unit_rounding) return asMoney(allocated(item.line_total));
  const gross = moneyCents(item.unit_price) * BigInt(quantity) - allocated(item.discount) + allocated(item.tax);
  return asMoney(gross);
}

/** Catalog and dashboard share the same estimate, including the existing gross-price margin convention. */
export function inventoryFinancialSummary(
  rows: readonly { available: number; variant: { price: number; cost?: number | null } }[],
  taxRate: number,
) {
  return rows.reduce((totals, row) => {
    const cost = row.variant.cost ?? 0;
    const price = potentialUnitProfit(row.variant.price, cost, taxRate);
    totals.value += row.available * cost;
    totals.revenue += row.available * (price?.finalPrice ?? 0);
    totals.potentialProfit += row.available * (price?.profit ?? 0);
    return totals;
  }, { value: 0, revenue: 0, potentialProfit: 0 });
}
