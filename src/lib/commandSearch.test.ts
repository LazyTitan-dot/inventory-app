import { describe, expect, it } from 'vitest';
import type { RetailData } from './contracts';
import { commandResults } from './commandSearch';

function fixture(): RetailData {
  return { permissions: { sell: false, manage_business: false, purchase: false, manage_catalog: false, view_audit: false }, products: [], variants: [], contacts: [], documents: [] } as unknown as RetailData;
}

describe('permission-aware command search', () => {
  it('offers only granted pages/actions even if restricted data is present', () => {
    const data = fixture();
    data.contacts = [{ id: 'customer', kind: 'customer', active: true, name: 'Sensitive client' }] as RetailData['contacts'];
    data.documents = [{ id: 'sale', type: 'sale', number: 'VEN-SECRET', created_at: '2026-11-11T12:00:00Z', contact_snapshot: {} }] as RetailData['documents'];
    expect(commandResults(data, '').map((result) => result.to)).toEqual(['/', '/inventario']);
    expect(commandResults(data, 'sensitive')).toEqual([]);
    expect(commandResults(data, 'VEN-SECRET')).toEqual([]);
    expect(commandResults(data, 'configuracion')).toEqual([]);
  });

  it('searches exact SKU/barcode and links the exact active variant without cost information', () => {
    const data = fixture();
    data.products = [{ id: 'p', active: true, brand: 'Ártico', model: 'Breeze', category: 'air_conditioner' }] as RetailData['products'];
    data.variants = [{ id: 'v', product_id: 'p', active: true, name: 'White', sku: 'ART-WHT-01', barcode: '12345', cost: 4200 }] as RetailData['variants'];
    const results = commandResults(data, 'artico');
    expect(results[0]?.to).toBe('/inventario?variante=v');
    expect(commandResults(data, '12345')[0]?.id).toBe('product-v');
    expect(JSON.stringify(results)).not.toContain('4200');
    data.products[0]!.active = false;
    expect(commandResults(data, 'artico')).toEqual([]);
  });

  it('separates seller and purchasing document/contact results by permission flags', () => {
    const data = fixture();data.permissions.sell = true;
    data.contacts = [{ id: 'c', kind: 'customer', active: true, name: 'Acme customer' }, { id: 's', kind: 'supplier', active: true, name: 'Acme supplier' }] as RetailData['contacts'];
    expect(commandResults(data, 'Acme').map((result) => result.id)).toEqual(['contact-c']);
    expect(commandResults(data, '').some((result) => result.to === '/ventas?nuevo=1')).toBe(true);
    expect(commandResults(data, '').some((result) => result.to === '/compras?nuevo=1')).toBe(false);
    data.permissions.sell = false;data.permissions.purchase = true;
    expect(commandResults(data, 'Acme').map((result) => result.id)).toEqual(['contact-s']);
  });
});
