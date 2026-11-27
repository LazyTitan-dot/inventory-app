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

export interface Variant {
  id: string;
  name: string;
  base: number;
  stock: number;
  active: boolean;
  visible: boolean;
}
export interface Media {
  id: string;
  asset: string;
  approved: boolean;
}
export interface Product {
  id: string;
  brand: string;
  model: string;
  category: string;
  slug: string;
  variants: Variant[];
  media: Media[];
  pendingMedia?: number[];
  published: boolean;
  featured: boolean;
  showOut: boolean;
  active: boolean;
  order: number;
}
export interface Banner {
  id: string;
  title: string;
  subtitle: string;
  slot: string;
  active: boolean;
  start: string;
  end: string;
  target: string;
  asset: string;
}
export interface Promotion {
  id: string;
  title: string;
  code: string;
  kind: string;
  value: number;
  start: string;
  end: string;
  scope: string;
  scopeLabel?: string | null;
  scopeAvailable?: boolean;
  active: boolean;
  web: boolean;
}
export interface AdminData {
  products: Product[];
  banners: Banner[];
  promos: Promotion[];
  bannerAssets?: { id: string; asset: string }[];
}
export type Role = 'owner' | 'admin' | 'sales' | 'inventory' | 'viewer';
export interface Session {
  actor: string;
  role: Role;
  manage_storefront: boolean;
}
export interface Audit {
  revision: number;
  actor: string;
  action: string;
  target: string;
  at: string;
}
export interface AdminState {
  taxBasisPoints: number;
  asOf: string;
  data: AdminData;
  revision: number;
  audit: Audit[];
}
export type Command =
  | {
      type: 'publication';
      revision: number;
      id: string;
      slug: string;
      published: boolean;
      featured: boolean;
      showOut: boolean;
      variants: { id: string; visible: boolean }[];
      media: { id: string; approved: boolean }[];
    }
  | { type: 'featured'; revision: number; ids: string[] }
  | { type: 'banner'; revision: number; banner: Banner }
  | { type: 'promotion'; revision: number; id: string; web: boolean };
export const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
export const gross = (n: number, taxBasisPoints: number) =>
  n > 0 ? grossMinor(n, taxBasisPoints) : 0;
export const approved = (p: Product) => p.media.filter((m) => m.approved);
export const eligible = (p: Product) =>
  p.active &&
  p.variants.some((v) => v.active && v.base > 0 && v.visible && (p.showOut || v.stock > 0));
export const visible = (p: Product) => p.published && eligible(p) && approved(p).length > 0;
export const businessDay = (instant: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santo_Domingo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
export function campaignStatus(
  x: Banner | Promotion,
  isBanner: boolean,
  data: AdminData,
  day: string,
) {
  if (!x.active || (!isBanner && !(x as Promotion).web)) return 'Desactivado';
  if (x.start > day) return 'Programado';
  if (x.end < day) return 'Vencido';
  if (
    isBanner &&
    (x as Banner).target !== 'catalogo' &&
    !data.products.some((p) => p.id === (x as Banner).target && visible(p))
  )
    return 'Bloqueado';
  if (
    !isBanner &&
    (x as Promotion).scope !== 'all' &&
    (x as Promotion).scopeAvailable !== true &&
    !data.products.some((p) => p.id === (x as Promotion).scope && visible(p))
  )
    return 'Bloqueado';
  return 'Vigente';
}
