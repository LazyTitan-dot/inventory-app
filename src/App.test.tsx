import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { Shell } from './App';
import type { RetailData, Role } from './lib/contracts';

let data: RetailData;
vi.mock('./state/useRetail', () => ({
  useRetail: () => ({
    data,
    refresh: async () => undefined,
    refreshing: false,
    lastUpdated: new Date('2026-11-10T12:00:00Z'),
    notify: () => undefined,
  }),
}));
vi.mock('./lib/supabase', () => ({ configured: false, supabase: null }));

function fixture(role: Role): RetailData {
  const admin = role === 'owner' || role === 'admin';
  const purchase = admin || role === 'inventory';
  return {
    profile: { id: 'test-user', email: 'team@example.test', display_name: 'Equipo', role },
    permissions: {
      sell: admin || role === 'sales',
      purchase,
      manage_business: admin,
      view_costs: purchase,
      manage_catalog: purchase,
      refund: admin,
      manage_team: admin,
      view_audit: admin,
    },
    settings: {
      id: 'global', business_name: 'Negocio de prueba', tax_id: null, phone: null,
      email: null, address: null, currency: 'DOP', timezone: 'America/Santo_Domingo',
      tax_rate: 18, max_sale_discount_percent: 10, receipt_footer: null,
      updated_at: '2026-11-10T12:00:00Z',
    },
    products: [], variants: [], stocks: [], contacts: [], documents: [], document_items: [],
    movements: [], deliveries: [], promotions: [], audit: [], team: [],
  };
}

function renderShell() {
  // An unknown route exercises the shell without mounting an operational page.
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/__shell_test']}><Shell /></MemoryRouter>,
  );
}

function dock(html: string) {
  const navigation = html.match(/<nav class="sl-bottom-dock"[\s\S]*?<\/nav>/)?.[0];
  expect(navigation).toBeDefined();
  return navigation!;
}

describe('Phase 5 permission-aware application shell', () => {
  it.each(['owner', 'admin'] as const)('keeps every operational section for %s', (role) => {
    data = fixture(role);
    const html = renderShell();
    for (const path of ['ventas', 'compras', 'clientes', 'proveedores', 'cotizaciones',
      'posventa', 'entregas', 'promociones', 'reportes', 'auditoria', 'configuracion']) {
      expect(html).toContain(`href="/${path}"`);
    }
    expect(dock(html)).toContain('href="/ventas"');
    // Purchasing remains available in Más, rather than adding a fifth dock tab.
    expect(dock(html)).not.toContain('href="/compras"');
  });

  it('offers sales navigation without purchase or administration links to sellers', () => {
    data = fixture('sales');
    const html = renderShell();
    for (const path of ['ventas', 'clientes', 'cotizaciones', 'posventa', 'entregas', 'promociones']) {
      expect(html).toContain(`href="/${path}"`);
    }
    for (const path of ['compras', 'proveedores', 'reportes', 'auditoria', 'configuracion']) {
      expect(html).not.toContain(`href="/${path}"`);
    }
    expect(dock(html)).toContain('href="/ventas"');
  });

  it('substitutes purchasing in the dock for inventory staff and retains deliveries', () => {
    data = fixture('inventory');
    const html = renderShell();
    expect(dock(html)).toContain('href="/compras"');
    expect(html).toContain('href="/proveedores"');
    expect(html).toContain('href="/entregas"');
    for (const path of ['ventas', 'clientes', 'cotizaciones', 'posventa', 'promociones',
      'reportes', 'auditoria', 'configuracion']) {
      expect(html).not.toContain(`href="/${path}"`);
    }
  });

  it('exposes only summary, inventory, and Más to a viewer', () => {
    data = fixture('viewer');
    const html = renderShell();
    const paths = [...html.matchAll(/<a\b[^>]*\bhref="([^"#]+)"/g)].map((match) => match[1]);
    expect(new Set(paths)).toEqual(new Set(['/', '/inventario']));
    expect(dock(html)).toContain('Más');
    expect(dock(html)).not.toContain('Ventas');
    expect(dock(html)).not.toContain('Compras');
  });

  it('uses permission flags rather than an owner role label to grant navigation', () => {
    data = fixture('viewer');
    data.profile.role = 'owner';
    const html = renderShell();
    for (const path of ['ventas', 'compras', 'reportes', 'auditoria', 'configuracion']) {
      expect(html).not.toContain(`href="/${path}"`);
    }
  });

  it('honors server-granted management and audit flags independently of the role label', () => {
    data = fixture('viewer');
    data.permissions.manage_business = true;
    data.permissions.view_audit = true;
    const html = renderShell();
    expect(dock(html)).toContain('href="/ventas"');
    expect(html).toContain('href="/reportes"');
    expect(html).toContain('href="/configuracion"');
    expect(html).toContain('href="/auditoria"');
    expect(html).not.toContain('href="/compras"');
  });

  it('retains named controls, a keyboard content target, and the approved brand', () => {
    data = fixture('viewer');
    const html = renderShell();
    expect(html).toContain('src="/brand/primary_dark.png" alt="S-Mart Living"');
    expect(html).toContain('src="/brand/square_icon.png" alt=""');
    expect(html).toContain('Negocio de prueba');
    expect(html).toContain('href="#contenido"');
    expect(html).toContain('id="contenido" tabindex="-1"');
    expect(html).toContain('aria-label="Navegación principal"');
    expect(html).toContain('aria-label="Navegación móvil"');
    expect(html).toContain('aria-label="Más secciones" aria-controls="menu-principal" aria-expanded="false"');
    expect(html).toContain('aria-label="Activar modo oscuro"');
    expect(html).toContain('aria-label="Actualizar información"');
    expect(html).toContain('aria-label="Cerrar sesión"');
  });
});
