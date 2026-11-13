import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentItem, RetailData, RetailDocument } from '../lib/contracts';
import { ClosePurchaseShort, PurchaseReceiptHistory, ReceivePurchase } from './PurchaseReceiving';

let data: RetailData;
vi.mock('../state/useRetail', () => ({ useRetail: () => ({ data, notify: vi.fn(), refresh: vi.fn() }) }));
const stamp = '2026-11-11T12:00:00Z';
const doc: RetailDocument = {
  id: 'purchase', type: 'purchase', number: 'COM-00001', status: 'partial',
  contact_id: 'supplier', contact_snapshot: { name: 'Proveedor' },
  subtotal: 100, discount: 0, tax_rate: 0, tax: 0, total: 100, currency: 'DOP',
  payment_method: null, tendered: null, change_amount: null, notes: null,
  parent_id: null, promotion_id: null, expires_at: null, created_by: 'owner', created_at: stamp, updated_at: stamp,
};
const items: DocumentItem[] = [{
  id: 'line', document_id: doc.id, variant_id: 'variant',
  product_snapshot: { category: 'other', brand: 'Marca', model: 'Modelo', name: 'Estándar', sku: 'SKU-A', barcode: 'BAR-A', warranty_months: 12 },
  quantity: 5, received_quantity: 2, damaged_quantity: 1, returned_quantity: 0,
  unit_price: 20, unit_cost: 20, discount: 0, tax: 0, line_total: 100, parent_item_id: null,
}];
const operation = { run: vi.fn(), busy: false, error: '', clearError: vi.fn() };
const form = () => renderToStaticMarkup(<ReceivePurchase document={doc} items={items} operation={operation} onDone={vi.fn()} />);

beforeEach(() => {
  data = {
    profile: { id: 'owner', email: 'owner@example.test', display_name: 'Equipo', role: 'owner' },
    permissions: { manage_catalog: true, view_costs: true, sell: true, purchase: true, refund: true, manage_business: true, manage_team: true, view_audit: true },
    settings: { id: 'global', business_name: 'Tienda', tax_id: null, phone: null, email: null, address: null, currency: 'DOP', timezone: 'America/Santo_Domingo', tax_rate: 18, max_sale_discount_percent: 10, receipt_footer: null, updated_at: stamp },
    products: [], variants: [], stocks: [], contacts: [], documents: [doc], document_items: items,
    movements: [], deliveries: [], promotions: [], audit: [], team: [], features: ['purchase_receipts_v1'],
    purchase_receipts: [{ id: 'receipt', purchase_id: doc.id, operation_id: 'operation', received_by: 'owner', notes: '<img src=x onerror=alert(1)>', items: [{ item_id: 'line', variant_id: 'variant', quantity: 1, damaged_quantity: 1, unit_cost: 997.45 }], created_at: stamp }],
  };
});

describe('purchase receiving capability and safety presentation', () => {
  it('shows separate conforming and quarantine counts on an updated backend', () => {
    const html = form();
    expect(html).toContain('Conformes recibidas hoy');
    expect(html).toContain('Dañadas recibidas hoy');
    expect(html).toContain('sin aumentar el stock disponible');
    expect(html).toContain('Código de barras o SKU de esta orden');
    expect(html).toContain('Cámara continua');
    expect(html).toContain('0 / 3 unidades');
  });
  it('retains the previous quantity-only form on an older backend', () => {
    data.features = undefined;
    const html = form();
    expect(html).toContain('Recibidas hoy');
    expect(html).not.toContain('Dañadas recibidas hoy');
    expect(renderToStaticMarkup(<PurchaseReceiptHistory purchaseId={doc.id} />)).toBe('');
  });
  it('blocks saving against a stale order while retaining the review action', () => {
    data.documents = [{ ...doc, updated_at: '2026-11-11T13:00:00Z' }];
    const html = form();
    expect(html).toContain('La orden cambió');
    expect(html).toContain('Descartar conteo y cargar versión actual');
    expect(html).toMatch(/<fieldset disabled=""/);
  });
  it('cannot submit a terminal purchase or an unauthorized receive form', () => {
    data.documents = [{ ...doc, status: 'received' }];
    expect(form()).toContain('ya no admite recepciones');
    data.documents = [doc];data.permissions.purchase = false;
    expect(form()).toContain('no tiene permiso');
    expect(renderToStaticMarkup(<PurchaseReceiptHistory purchaseId={doc.id} />)).toBe('');
  });
  it('describes explicit irreversible shortage closure with the exact remaining units', () => {
    const html = renderToStaticMarkup(<ClosePurchaseShort document={doc} items={items} operation={operation} onDone={vi.fn()} />);
    expect(html).toContain('3 unidades sin recibir');
    expect(html).toContain('Motivo del cierre');
    expect(html).toContain('Confirmar cierre con faltantes');
    expect(html).toContain('No podrás registrar más recepciones');
  });
  it('does not expose shortage-closure actions on an old backend', () => {
    data.features = [];
    const html = renderToStaticMarkup(<ClosePurchaseShort document={doc} items={items} operation={operation} onDone={vi.fn()} />);
    expect(html).not.toContain('Confirmar cierre');
  });
  it('renders durable receipt details with escaped notes and permission-bound costs', () => {
    const html = renderToStaticMarkup(<PurchaseReceiptHistory purchaseId={doc.id} />);
    expect(html).toContain('1 conformes · 1 dañadas en cuarentena');
    expect(html).toContain('997.45');
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<img');
    data.permissions.view_costs = false;
    expect(renderToStaticMarkup(<PurchaseReceiptHistory purchaseId={doc.id} />)).not.toContain('997.45');
  });
});
