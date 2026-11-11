import { test as base, expect } from '@playwright/test';
import type { RetailData, Role } from '../../src/lib/contracts';

const userId = '10000000-0000-4000-8000-000000000001';
const productId = '10000000-0000-4000-8000-000000000002';
const variantId = '10000000-0000-4000-8000-000000000003';
const timestamp = '2026-11-11T12:00:00Z';

export function retailFixture(role: Role): RetailData {
  const admin = role === 'owner' || role === 'admin';
  const sales = admin || role === 'sales';
  const inventory = admin || role === 'inventory';
  return {
    profile: { id: userId, email: 'shell@example.test', display_name: 'Equipo de prueba', role },
    permissions: {
      manage_catalog: inventory, view_costs: inventory, sell: sales, purchase: inventory,
      refund: admin, manage_business: admin, manage_team: admin, view_audit: admin,
    },
    settings: {
      id: 'global', business_name: 'Tienda de prueba local', tax_id: null, phone: null,
      email: null, address: null, currency: 'DOP', timezone: 'America/Santo_Domingo',
      tax_rate: 18, max_sale_discount_percent: 10, receipt_footer: null, updated_at: timestamp,
    },
    products: [{
      id: productId, category: 'refrigerator', brand: 'Fixture', model: 'Nevera de prueba',
      description: 'Producto ficticio para verificar la interfaz.', warranty_months: 12,
      images: [], active: true, created_at: timestamp, updated_at: timestamp,
    }],
    variants: [{
      id: variantId, product_id: productId, name: 'Blanco', sku: 'FIXTURE-001',
      barcode: 'TEST0001', ...(inventory ? { cost: 5000 } : {}), price: 8000,
      min_stock: 2, reorder_target: 5, active: true, created_at: timestamp, updated_at: timestamp,
    }],
    stocks: [{ variant_id: variantId, available: 3, quarantine: 0, updated_at: timestamp }],
    contacts: [], documents: [], document_items: [], movements: [], deliveries: [],
    promotions: [], audit: [], team: [],
  };
}

interface Backend {
  bootstrapRequests: number;
  loginRequests: number;
  recoverRequests: number;
  logoutRequests: number;
}

type Options = { role: Role; signedIn: boolean; themeStorageBlocked: boolean };
export const test = base.extend<Options & { backend: Backend }>({
  role: ['admin', { option: true }],
  signedIn: [true, { option: true }],
  themeStorageBlocked: [false, { option: true }],
  backend: [async ({ context, page, role, signedIn, themeStorageBlocked }, use) => {
    const blocked: string[] = [];
    const errors: string[] = [];
    const backend: Backend = { bootstrapRequests: 0, loginRequests: 0, recoverRequests: 0, logoutRequests: 0 };
    const user = {
      id: userId, aud: 'authenticated', role: 'authenticated', email: 'shell@example.test',
      app_metadata: {}, user_metadata: {}, created_at: timestamp,
    };
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const session = {
      access_token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: userId, aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.local-fixture-signature`,
      refresh_token: 'local-fixture-refresh-token', token_type: 'bearer',
      expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user,
    };
    page.on('pageerror', error => errors.push(error.message));
    await context.routeWebSocket('**/*', socket => {
      const url = new URL(socket.url());
      if (!['127.0.0.1', 'phase5-fixture.supabase.co'].includes(url.hostname)) blocked.push(socket.url());
      // Realtime is irrelevant to shell fixtures; never connect to a remote server.
      socket.close();
    });
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin === 'http://127.0.0.1:4178') return route.continue();
      // Legacy styles import Google Fonts. Keep this suite offline; the shell uses system fonts.
      if (url.origin === 'https://fonts.googleapis.com' && url.pathname === '/css2') {
        return route.fulfill({ contentType: 'text/css', body: '/* Local font fixture: use system fallbacks. */' });
      }
      if (url.origin !== 'https://phase5-fixture.supabase.co') {
        blocked.push(route.request().url());
        return route.abort('blockedbyclient');
      }
      const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      const respond = (json: unknown, status = 200) => route.fulfill({ status, headers, json });
      if (url.pathname === '/rest/v1/rpc/retail_bootstrap') {
        backend.bootstrapRequests++;
        return respond(retailFixture(role));
      }
      if (url.pathname === '/auth/v1/token') {
        backend.loginRequests++;
        return respond(session);
      }
      if (url.pathname === '/auth/v1/user') return respond(user);
      if (url.pathname === '/auth/v1/recover') {
        backend.recoverRequests++;
        return respond({});
      }
      if (url.pathname === '/auth/v1/logout') {
        backend.logoutRequests++;
        return route.fulfill({ status: 204, headers });
      }
      blocked.push(route.request().url());
      return route.abort('blockedbyclient');
    });
    await context.addInitScript(({ signedIn, session, themeStorageBlocked }) => {
      if (signedIn && !sessionStorage.getItem('shell-fixture-seeded')) {
        localStorage.setItem('sb-phase5-fixture-auth-token', JSON.stringify(session));
        sessionStorage.setItem('shell-fixture-seeded', 'yes');
      }
      if (themeStorageBlocked) {
        const originalGet = Storage.prototype.getItem;
        const originalSet = Storage.prototype.setItem;
        Storage.prototype.getItem = function (key) {
          if (key === 'smartliving-theme') throw new DOMException('Storage unavailable', 'SecurityError');
          return originalGet.call(this, key);
        };
        Storage.prototype.setItem = function (key, value) {
          if (key === 'smartliving-theme') throw new DOMException('Storage unavailable', 'SecurityError');
          return originalSet.call(this, key, value);
        };
      }
    }, { signedIn, session, themeStorageBlocked });
    await use(backend);
    expect(blocked, 'No external requests or business writes are allowed in shell tests').toEqual([]);
    expect(errors, 'No uncaught JavaScript exceptions').toEqual([]);
  }, { auto: true }],
});

export { expect };
