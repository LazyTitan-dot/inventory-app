import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RetailData } from '../lib/contracts';
import { ContactsPage } from './Contacts';

let data: RetailData;
vi.mock('../state/useRetail', () => ({
  useRetail: () => ({ data, refresh: vi.fn(), notify: vi.fn() }),
}));
vi.mock('../state/useOperation', () => ({
  useOperation: () => ({ run: vi.fn(), busy: false, error: '', clearError: vi.fn() }),
}));
vi.mock('../lib/supabase', () => ({ supabase: null }));
const timestamp = '2026-11-11T12:00:00Z';

function markup(kind: 'customer' | 'supplier' = 'customer', query = '') {
  return renderToStaticMarkup(<MemoryRouter initialEntries={[`/clientes${query}`]}>
    <ContactsPage kind={kind} />
  </MemoryRouter>);
}

beforeEach(() => {
  data = {
    profile: { id: 'owner', email: 'owner@example.test', display_name: 'Owner', role: 'owner' },
    permissions: { manage_catalog: true, view_costs: true, sell: true, purchase: true,
      refund: true, manage_business: true, manage_team: true, view_audit: true },
    settings: { id: 'global', business_name: 'Tienda', tax_id: null, phone: null,
      email: null, address: null, currency: 'DOP', timezone: 'America/Santo_Domingo',
      tax_rate: 18, max_sale_discount_percent: 10, receipt_footer: null, updated_at: timestamp },
    contacts: [{ id: 'customer-one', kind: 'customer', name: 'Ana <cliente>',
      email: 'ana@example.test', phone: '8095550123', address: 'Dirección anterior',
      tax_id: null, notes: null, active: true, created_at: timestamp, updated_at: timestamp },
    { id: 'supplier-one', kind: 'supplier', name: 'Proveedor existente',
      email: null, phone: '8295550199', address: 'Almacén', tax_id: null, notes: null,
      active: true, created_at: timestamp, updated_at: timestamp }],
    customer_addresses: [{ id: 'address-one', contact_id: 'customer-one', label: 'Casa',
      street: 'Calle Primera 5', sector: 'Centro', city: 'Santo Domingo',
      province: 'Distrito Nacional', phone: '8095550123', reference: 'Puerta azul',
      is_default: true, active: true, created_at: timestamp, updated_at: timestamp },
    { id: 'address-archived', contact_id: 'customer-one', label: 'Oficina antigua',
      street: 'Dirección archivada', sector: '', city: 'Santiago', province: 'Santiago',
      phone: '8095550123', reference: '', is_default: false, active: false,
      created_at: timestamp, updated_at: timestamp }],
    features: ['customer_addresses_v1'],
    products: [], variants: [], stocks: [], documents: [], document_items: [],
    movements: [], deliveries: [], promotions: [], audit: [], team: [],
  };
});

describe('customer directory and saved destinations', () => {
  it('shows active address count and preferred destination without counting archived addresses', () => {
    const html = markup();
    expect(html).toContain('Clientes y direcciones');
    expect(html).toContain('1 dirección guardada');
    expect(html).toContain('Calle Primera 5');
    expect(html).not.toContain('Dirección archivada');
    expect(html).toContain('Ana &lt;cliente&gt;');
    expect(html).not.toContain('Proveedor existente');
  });

  it('opens an exact contact UUID from global search with its address book and historical boundaries', () => {
    const html = markup('customer', '?contacto=customer-one');
    expect(html).toContain('aria-label="Ana &lt;cliente&gt;"');
    expect(html).toContain('Direcciones de entrega');
    expect(html).toContain('Agregar dirección');
    expect(html).toContain('Cada entrega conserva su propia copia.');
    expect(html).toContain('Puerta azul');
    expect(html).toContain('noopener noreferrer');
  });

  it('does not offer address mutations when the role cannot sell or backend lacks the capability', () => {
    data.permissions.sell = false;
    expect(markup('customer', '?contacto=customer-one')).not.toContain('Agregar dirección');
    data.permissions.sell = true;
    data.features = [];
    expect(markup('customer', '?contacto=customer-one')).not.toContain('Direcciones de entrega');
    expect(markup('customer', '?contacto=customer-one')).toContain('Dirección anterior');
  });

  it('preserves supplier editing, purchase link and operations history without customer-address UI', () => {
    const html = markup('supplier', '?contacto=supplier-one');
    expect(html).toContain('Proveedor existente');
    expect(html).toContain('Editar datos');
    expect(html).toContain('/compras?contacto=supplier-one&amp;nuevo=1');
    expect(html).toContain('Historial de operaciones');
    expect(html).not.toContain('Direcciones de entrega');
  });
});
