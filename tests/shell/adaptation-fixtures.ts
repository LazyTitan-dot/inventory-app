import { test as shell, expect, retailFixture } from './fixtures';
import type { RetailData, RetailDocument, DocumentItem } from '../../src/lib/contracts';

export const customerId = '20000000-0000-4000-8000-000000000001';
export const supplierId = '20000000-0000-4000-8000-000000000002';
export const addressId = '20000000-0000-4000-8000-000000000003';
export const saleId = '20000000-0000-4000-8000-000000000004';
export const availableSaleId = '20000000-0000-4000-8000-000000000005';
export const purchaseId = '20000000-0000-4000-8000-000000000006';
export const purchaseItemId = '20000000-0000-4000-8000-000000000007';
export const deliveryId = '20000000-0000-4000-8000-000000000008';
const stamp = '2026-11-11T12:00:00Z';

function populatedFixture(): RetailData {
  const data = retailFixture('owner');
  data.features = ['customer_addresses_v1', 'purchase_receipts_v1'];
  data.contacts = [
    { id: customerId, kind: 'customer', name: 'Cliente de prueba', email: null, phone: '8095550101', tax_id: null, address: 'Dirección histórica', notes: null, active: true, created_at: stamp, updated_at: stamp },
    { id: supplierId, kind: 'supplier', name: 'Proveedor de prueba', email: null, phone: '8095550102', tax_id: null, address: null, notes: null, active: true, created_at: stamp, updated_at: stamp },
  ];
  data.customer_addresses = [{ id: addressId, contact_id: customerId, label: 'Casa', street: 'Dirección nueva del perfil', sector: 'Centro', city: 'Santo Domingo', province: 'Distrito Nacional', phone: '8095550101', reference: 'Portón azul', is_default: true, active: true, created_at: stamp, updated_at: stamp }];
  const document = (id: string, type: RetailDocument['type'], number: string): RetailDocument => ({
    id, number, type, status: type === 'purchase' ? 'partial' : 'completed', contact_id: type === 'purchase' ? supplierId : customerId,
    contact_snapshot: { name: type === 'purchase' ? 'Proveedor de prueba' : 'Cliente de prueba', phone: '8095550101' },
    subtotal: 8000, discount: 0, tax_rate: 18, tax: 1440, total: 9440, currency: 'DOP', payment_method: type === 'purchase' ? null : 'cash',
    tendered: type === 'purchase' ? null : 10000, change_amount: type === 'purchase' ? null : 560,
    notes: null, parent_id: null, promotion_id: null, expires_at: null, created_by: data.profile.id, created_at: stamp, updated_at: stamp,
    ...(type === 'purchase' ? { expected_at: '2026-11-12', closed_short: false } : {}),
  });
  data.documents = [document(saleId, 'sale', 'VEN-PRUEBA-001'), document(availableSaleId, 'sale', 'VEN-PRUEBA-002'), document(purchaseId, 'purchase', 'COM-PRUEBA-001')];
  const item = (id: string, documentId: string, purchase: boolean): DocumentItem => ({
    id, document_id: documentId, variant_id: data.variants[0]!.id,
    product_snapshot: { category: 'refrigerator', brand: 'Fixture', model: 'Nevera de prueba', name: 'Blanco', sku: 'FIXTURE-001', barcode: 'TEST0001', warranty_months: 12 },
    quantity: purchase ? 5 : 1, received_quantity: purchase ? 1 : 0, damaged_quantity: 0, returned_quantity: 0,
    unit_price: 8000, unit_cost: 5000, discount: 0, tax: 1440, line_total: 9440, parent_item_id: null,
  });
  data.document_items = [item('20000000-0000-4000-8000-000000000010', saleId, false), item(purchaseItemId, purchaseId, true)];
  data.deliveries = [{
    id: deliveryId, sale_id: saleId, status: 'scheduled', address: 'Destino original de la entrega, Santo Domingo', phone: '8095550101', contact_name: 'Cliente de prueba',
    customer_address_id: addressId, address_snapshot: { street: 'Destino original de la entrega', sector: 'Centro', city: 'Santo Domingo', province: 'Distrito Nacional', phone: '8095550101', reference: 'Tocar el timbre' },
    proof: '', scheduled_at: '2026-11-12T16:00:00Z', assignee: 'Equipo de prueba', notes: null, received_by: null, delivered_at: null,
    created_at: stamp, updated_at: stamp, history: [{ at: stamp, actor: data.profile.id, status: 'scheduled', note: 'Entrega programada' }],
  }];
  data.purchase_receipts = [];
  return data;
}

export const test = shell.extend<{ featureData: RetailData }>({
  featureData: [async ({ page, backend }, use) => {
    void backend;
    const data = populatedFixture();
    await page.route('https://phase5-fixture.supabase.co/rest/v1/rpc/retail_bootstrap', (route) => route.fulfill({ json: data, headers: { 'access-control-allow-origin': '*' } }));
    await use(data);
  }, { auto: true }],
});

export { expect };
