import { describe, expect, it } from 'vitest';
import { decodeAdminState } from './repository';
import { campaignStatus } from './presentation';
import type { RetailData } from '../lib/contracts';

describe('contrato real de administración comercial', () => {
  const id = '11111111-1111-4111-8111-111111111111';
  const mediaId = '11111111-1111-f111-1111-111111111111';
  const day = '2026-11-27';
  const product = {
    id,
    brand: 'Marca',
    model: 'Modelo',
    category: 'Otros',
    active: true,
    slug: 'modelo',
    published: true,
    featured: false,
    showOut: false,
    order: 0,
    variants: [{ id, name: 'A', base: 10000, stock: 1, active: true, visible: true }],
    media: [{ id: mediaId, asset: `storage:${id}/foto.webp`, approved: true }],
  };
  const promo = {
    id,
    title: 'Categoría y selección',
    code: null,
    kind: 'fixed',
    value: 25,
    start: day,
    end: day,
    scope: 'multiple',
    active: true,
    web: true,
  };
  const snapshot = {
    taxBasisPoints: 1800,
    asOf: day,
    revision: 0,
    audit: [],
    data: { products: [product], promos: [promo], banners: [] },
  };
  it.each([
    ['tv', id, 'Vigente'],
    ['other', id, 'Bloqueado'],
    ['tv', mediaId, 'Bloqueado'],
  ])('combina categoría %s y selección %s', (category, selected, status) => {
    const productSource = { id, category: 'tv' } as RetailData['products'][number];
    const rule = { id, category, product_ids: [selected] } as RetailData['promotions'][number];
    const { data } = decodeAdminState(snapshot, { products: [productSource], promotions: [rule] });
    expect(data.products[0]?.media[0]?.id).toBe(mediaId);
    expect(campaignStatus(data.promos[0]!, false, data, day)).toBe(status);
  });
});
