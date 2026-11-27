import type { CatalogQuery } from '../contracts';
import type { CommercialRepository, CommercialSnapshot, CommercialVariant } from './contract';
const safeImage = (s: unknown): s is string =>
  typeof s === 'string' &&
  /^\/api\/catalog\/v1\/media\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(s);
export function validateSnapshot(value: unknown): CommercialSnapshot {
  if (
    !value ||
    typeof value !== 'object' ||
    !('mode' in value) ||
    value.mode !== 'commercial' ||
    !('products' in value) ||
    !Array.isArray(value.products) ||
    value.products.length > 10000
  )
    throw Error('Catálogo comercial no disponible');
  const seen = new Set<string>();
  const products: CommercialVariant[] = value.products.map((p: CommercialVariant) => {
    if (
      !p ||
      p.source !== 'commercial' ||
      typeof p.id !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,120}$/.test(p.id) ||
      p.id !== p.variantId ||
      seen.has(p.id) ||
      ![p.productId, p.slug, p.variantName, p.brand, p.cat, p.name, p.model, p.spec, p.tag].every(
        (x) => typeof x === 'string',
      ) ||
      p.currency !== 'DOP' ||
      !Number.isSafeInteger(p.priceMinor) ||
      p.priceMinor <= 0 ||
      p.price !== p.priceMinor / 100 ||
      typeof p.available !== 'boolean' ||
      typeof p.offer !== 'boolean' ||
      typeof p.featured !== 'boolean' ||
      !Number.isInteger(p.maxQuantity) ||
      p.maxQuantity < 0 ||
      p.maxQuantity > 9 ||
      p.available !== p.maxQuantity > 0 ||
      !Number.isInteger(p.warrantyMonths) ||
      p.warrantyMonths < 0 ||
      !safeImage(p.img) ||
      !Array.isArray(p.images) ||
      !p.images.length ||
      p.images.length > 8 ||
      !p.images.every(safeImage)
    )
      throw Error('Respuesta comercial inválida');
    seen.add(p.id);
    // Explicit projection, even if upstream adds internal fields.
    return {
      source: p.source,
      id: p.id,
      variantId: p.variantId,
      productId: p.productId,
      slug: p.slug,
      variantName: p.variantName,
      brand: p.brand,
      cat: p.cat,
      name: p.name,
      model: p.model,
      spec: p.spec,
      warrantyMonths: p.warrantyMonths,
      currency: p.currency,
      priceMinor: p.priceMinor,
      price: p.price,
      available: p.available,
      maxQuantity: p.maxQuantity,
      offer: p.offer,
      featured: p.featured,
      tag: p.tag,
      img: p.img,
      images: [...p.images],
    };
  });
  return { mode: 'commercial', products };
}
export class HttpCommercialRepository implements CommercialRepository {
  private readonly request: (url: string) => Promise<Response>;
  constructor(
    request: (url: string) => Promise<Response> = (url) =>
      fetch(url, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000) }),
  ) {
    this.request = request;
  }
  async snapshot() {
    const r = await this.request('/api/catalog/v1/products');
    if (!r.ok) throw Error('Catálogo comercial no disponible');
    return validateSnapshot(await r.json());
  }
  async list(q: CatalogQuery = {}) {
    const { products } = await this.snapshot();
    return products.filter(
      (p) =>
        (!q.category || q.category === 'Todos' || p.cat === q.category) &&
        (!q.brands?.length || q.brands.includes(p.brand)) &&
        (q.maxPrice === undefined || p.price <= q.maxPrice) &&
        (!q.availableOnly || p.available) &&
        (!q.offersOnly || p.offer) &&
        (!q.search ||
          `${p.name} ${p.brand} ${p.spec}`.toLowerCase().includes(q.search.toLowerCase())),
    );
  }
  async get(id: string) {
    return (await this.snapshot()).products.find((p) => p.id === id) ?? null;
  }
}
