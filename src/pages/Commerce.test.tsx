import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RetailData, RetailDocument } from '../lib/contracts';
import { CommercePage } from './Commerce';

let data: RetailData;
vi.mock('../state/useRetail', () => ({
  useRetail: () => ({ data, refresh: vi.fn(), notify: vi.fn() }),
}));
vi.mock('../state/useOperation', () => ({
  useOperation: () => ({ run: vi.fn(), busy: false, error: '', clearError: vi.fn() }),
}));
vi.mock('../lib/supabase', () => ({ supabase: null }));

const created = '2026-09-24T12:00:00Z';
const future = '2099-09-24T23:59:59-04:00';
const document = (type: RetailDocument['type'], status: string): RetailDocument => ({
  id: 'document',
  number: 'DOC-0000001',
  type,
  status,
  contact_id: 'contact',
  contact_snapshot: { name: 'Contacto original' },
  subtotal: 200,
  discount: 10,
  tax_rate: 18,
  tax: 34.2,
  total: 224.2,
  currency: 'DOP',
  payment_method: null,
  tendered: null,
  change_amount: 0,
  notes: 'Nota original <cliente>',
  parent_id: null,
  promotion_id: null,
  expires_at: type === 'quote' ? future : null,
  created_by: 'owner',
  created_at: created,
  updated_at: created,
});

function markup(kind: 'sale' | 'purchase' | 'quote', query = '?documento=document') {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[`/${kind}${query}`]}>
      <CommercePage kind={kind} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  data = {
    profile: {
      id: 'owner',
      email: 'owner@example.test',
      display_name: 'Administrador',
      role: 'owner',
    },
    permissions: {
      manage_catalog: true,
      view_costs: true,
      sell: true,
      purchase: true,
      refund: true,
      manage_business: true,
      manage_team: true,
      view_audit: true,
    },
    settings: {
      id: 'global',
      business_name: 'Tienda de prueba',
      tax_id: null,
      phone: null,
      email: null,
      address: null,
      currency: 'DOP',
      timezone: 'America/Santo_Domingo',
      tax_rate: 18,
      max_sale_discount_percent: 10,
      receipt_footer: null,
      updated_at: created,
    },
    products: [
      {
        id: 'product',
        category: 'Neveras',
        brand: 'Marca',
        model: 'Modelo',
        description: '',
        warranty_months: 12,
        images: [],
        active: true,
        created_at: created,
        updated_at: created,
      },
    ],
    variants: [
      {
        id: 'variant',
        product_id: 'product',
        name: 'Blanca',
        sku: 'SKU-1',
        barcode: null,
        cost: 50,
        price: 100,
        min_stock: 0,
        reorder_target: 0,
        active: true,
        created_at: created,
        updated_at: created,
      },
    ],
    stocks: [{ variant_id: 'variant', available: 10, quarantine: 0, updated_at: created }],
    contacts: [
      {
        id: 'contact',
        kind: 'supplier',
        name: 'Contacto original',
        email: null,
        phone: null,
        tax_id: null,
        address: null,
        notes: null,
        active: true,
        created_at: created,
        updated_at: created,
      },
    ],
    documents: [document('quote', 'open')],
    document_items: [
      {
        id: 'item',
        document_id: 'document',
        variant_id: 'variant',
        product_snapshot: {
          category: 'Neveras',
          brand: 'Marca',
          model: 'Modelo',
          name: 'Blanca',
          sku: 'SKU-1',
          barcode: null,
          warranty_months: 12,
        },
        quantity: 2,
        received_quantity: 0,
        returned_quantity: 0,
        unit_price: 100,
        unit_cost: 50,
        discount: 10,
        tax: 34.2,
        line_total: 224.2,
        parent_item_id: null,
      },
    ],
    movements: [],
    deliveries: [],
    promotions: [],
    audit: [],
    team: [],
  };
});

describe('Commerce lifecycle controls', () => {
  it('allows an open quote to be edited or cancelled, and removes those actions after conversion', () => {
    expect(markup('quote')).toContain('Editar cotización');
    expect(markup('quote')).toContain('Cancelar cotización');
    data.documents[0]!.status = 'converted';
    expect(markup('quote')).not.toContain('Editar cotización');
    expect(markup('quote')).not.toContain('Cancelar cotización');
  });

  it('opens the original quote in one editor, preserving quantities and requiring changed prices to be reviewed', () => {
    data.contacts[0]!.kind = 'customer';
    data.variants[0]!.price = 120;
    const html = markup('quote', '?documento=document&editar=1');
    expect(html).toContain('Editar DOC-0000001');
    expect(html).toContain('Aceptar precios actualizados');
    expect(html).toContain('value="2"');
    expect(html).toContain('value="10"');
    expect(html).toContain('Nota original &lt;cliente&gt;');
    expect(html).toContain('Guardar cambios de cotización');
    expect(html.match(/<form\b/g)).toHaveLength(1);
    expect(html.match(/<dialog\b/g)).toHaveLength(1);
  });

  it('keeps draft purchases out of receiving until confirmation, while allowing cancellation', () => {
    data.documents = [document('purchase', 'draft')];
    const html = markup('purchase');
    expect(html).toContain('Cancelar borrador');
    expect(html).toMatch(/<button class="button primary">[^]*?Confirmar orden<\/button>/);
    expect(html).not.toContain('Recibir mercancía');
  });

  it('blocks confirmation for a missing supplier and exposes explicit linking for unlinked historical items', () => {
    data.documents = [
      { ...document('purchase', 'draft'), legacy: { source: 'purchase_orders' }, contact_id: null },
    ];
    data.document_items[0]!.variant_id = null;
    const html = markup('purchase');
    expect(html).toContain('El borrador necesita un proveedor activo');
    expect(html).toContain('Vincular artículo');
    expect(html).toMatch(
      /<button class="button primary" disabled="">[^]*?Confirmar orden<\/button>/,
    );
  });

  it('does not expose editing, linking or draft confirmation to a read-only user, even through an edit URL', () => {
    data.profile.role = 'viewer';
    data.permissions.sell = false;
    data.permissions.purchase = false;
    data.permissions.manage_business = false;
    data.documents[0]!.legacy = { source: 'quotes' };
    data.document_items[0]!.variant_id = null;
    const html = markup('quote', '?documento=document&editar=1');
    expect(html).not.toContain('Guardar cambios de cotización');
    expect(html).not.toContain('Cancelar cotización');
    expect(html).not.toContain('Vincular artículo');
  });

  it('marks catalog prices of zero as pending for sales and quotes while purchases remain available', () => {
    data.variants[0]!.price = 0;
    for (const kind of ['sale', 'quote'] as const) {
      const html = markup(kind, '?nuevo=1');
      expect(html).toContain('Precio pendiente');
      expect(html).toMatch(/<button type="button" class="commerce-product" disabled="">/);
    }
    const purchase = markup('purchase', '?nuevo=1');
    expect(purchase).not.toContain('Precio pendiente');
    expect(purchase).not.toMatch(/<button type="button" class="commerce-product" disabled="">/);
  });

  it('shows the recorded cancellation reason without offering a new confirmation or receipt', () => {
    data.documents = [
      { ...document('purchase', 'cancelled'), status_reason: 'Proveedor sin disponibilidad' },
    ];
    const html = markup('purchase');
    expect(html).toContain('Proveedor sin disponibilidad');
    expect(html).not.toContain('Confirmar orden');
    expect(html).not.toContain('Recibir mercancía');
  });
});
