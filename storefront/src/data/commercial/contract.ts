import type { Product, CatalogRepository } from '../contracts';
export interface CommercialVariant extends Product {
  source: 'commercial';
  productId: string;
  slug: string;
  variantId: string;
  variantName: string;
  model: string;
  warrantyMonths: number;
  currency: 'DOP';
  priceMinor: number;
  maxQuantity: number;
  featured: boolean;
  images: readonly string[];
}
export interface CommercialSnapshot {
  mode: 'commercial';
  products: CommercialVariant[];
}
export interface CommercialRepository extends CatalogRepository {
  snapshot(): Promise<CommercialSnapshot>;
}
export const commercialMoney = (minor: number) =>
  'RD$ ' +
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    minor / 100,
  );
/** Use integer centavos; avoid binary floating point rounding in commercial totals. */
export function grossMinor(baseMinor: number, taxBasisPoints: number) {
  if (
    !Number.isSafeInteger(baseMinor) ||
    baseMinor <= 0 ||
    baseMinor > 99_999_999_999 ||
    !Number.isInteger(taxBasisPoints) ||
    taxBasisPoints < 0 ||
    taxBasisPoints > 10000
  )
    throw Error('Importe o tasa inválidos');
  return Number((BigInt(baseMinor) * BigInt(10000 + taxBasisPoints) + 5000n) / 10000n);
}
export function commercialSubtotal(lines: readonly { p: Product; n: number }[]) {
  return (
    lines.reduce((sum, l) => sum + l.n * (l.p.priceMinor ?? Math.round(l.p.price * 100)), 0) / 100
  );
}
export function isCommercial(p: Product): p is CommercialVariant {
  return p.source === 'commercial';
}
