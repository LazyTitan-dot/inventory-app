import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { RetailData, Role } from '../lib/contracts';
import { AuthPage } from './Auth';
import { DashboardPage, ReportsPage } from './Dashboard';

let data: RetailData;
vi.mock('../state/useRetail', () => ({ useRetail: () => ({ data }) }));
vi.mock('../lib/supabase', () => ({ configured: true, supabase: null }));

function fixture(role: Role): RetailData {
  const admin = ['owner', 'admin'].includes(role);
  const sales = admin || role === 'sales';
  const purchase = admin || role === 'inventory';
  return {
    profile: { id: 'user', email: 'user@example.test', display_name: 'Equipo', role },
    permissions: {
      sell: sales,
      purchase,
      manage_business: admin,
      view_costs: purchase,
      manage_catalog: purchase,
      refund: admin,
      manage_team: admin,
      view_audit: admin,
    },
    settings: {
      id: 'global',
      business_name: 'SmartLiving',
      tax_id: null,
      phone: null,
      email: null,
      address: null,
      currency: 'DOP',
      timezone: 'America/Santo_Domingo',
      tax_rate: 18,
      max_sale_discount_percent: 10,
      receipt_footer: null,
      updated_at: '2026-09-24T12:00:00Z',
    },
    products: [],
    variants: [],
    stocks: [],
    contacts: [],
    documents: [],
    document_items: [],
    movements: [],
    deliveries: [],
    promotions: [],
    audit: [],
    team: [],
  };
}
const renderPage = (component: typeof DashboardPage) =>
  renderToStaticMarkup(createElement(MemoryRouter, null, createElement(component)));

describe('dashboard permission boundaries', () => {
  it('does not present restricted zero sales, purchasing figures, or links to a viewer', () => {
    data = fixture('viewer');
    const html = renderPage(DashboardPage);
    expect(html).not.toContain('Ventas de hoy');
    expect(html).not.toContain('Ganancia potencial');
    expect(html).not.toContain('Compras pendientes');
    expect(html).not.toContain('href="/ventas');
    expect(html).not.toContain('href="/compras');
    expect(html).not.toContain('href="/entregas');
    expect(html).toContain('Consultar inventario');
  });

  it('shows purchasing activity to inventory staff without sales figures or sales actions', () => {
    data = fixture('inventory');
    const html = renderPage(DashboardPage);
    expect(html).toContain('Compras recientes');
    expect(html).toContain('Ganancia potencial');
    expect(html).toContain('href="/compras?nuevo=1"');
    expect(html).toContain('href="/entregas"');
    expect(html).not.toContain('Ventas de hoy');
    expect(html).not.toContain('href="/ventas');
  });

  it('shows sales actions to sellers without pretending purchasing data is zero', () => {
    data = fixture('sales');
    const html = renderPage(DashboardPage);
    expect(html).toContain('Ventas de hoy');
    expect(html).not.toContain('Ganancia potencial');
    expect(html).toContain('href="/ventas?nuevo=1"');
    expect(html).not.toContain('Compras pendientes');
    expect(html).not.toContain('href="/compras');
  });

  it('retains both sales and purchasing metrics for an administrator', () => {
    data = fixture('admin');
    const html = renderPage(DashboardPage);
    expect(html).toContain('Ventas de hoy');
    expect(html).toContain('Compras pendientes');
    expect(html).toContain('Ganancia potencial');
  });

  it('denies financial reports when the page is rendered outside the route guard', () => {
    data = fixture('inventory');
    const html = renderPage(ReportsPage);
    expect(html).toContain('Tu rol no tiene acceso');
    expect(html).not.toContain('Ingresos netos sin ITBIS');
    expect(html).not.toContain('Exportar detalle');
  });
});

describe('authentication screens', () => {
  it('offers a fresh email link instead of a password update for invalid recovery', () => {
    const html = renderToStaticMarkup(
      createElement(AuthPage, { recoveryInvalid: true, onExitRecovery: () => undefined }),
    );
    expect(html).toContain('Enviar instrucciones');
    expect(html).not.toContain('name="password"');
    expect(html).toContain('Salir de la recuperación');
  });

  it('requires password confirmation during authorized recovery', () => {
    const html = renderToStaticMarkup(createElement(AuthPage, { recovery: true }));
    expect(html).toContain('name="password-confirmation"');
    expect(html).toContain('minLength="12"');
  });

  it('provides a visible retry action after session bootstrap failure', () => {
    const html = renderToStaticMarkup(
      createElement(AuthPage, {
        sessionError: 'No pudimos comprobar tu sesión.',
        onRetrySession: () => undefined,
      }),
    );
    expect(html).toContain('Volver a comprobar sesión');
    expect(html).toContain('role="alert"');
  });
});
