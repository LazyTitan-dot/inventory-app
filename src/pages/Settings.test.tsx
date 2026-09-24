import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RetailData } from '../lib/contracts';
import { AuditPage } from './Settings';

const search = vi.hoisted(() => ({ query: '' }));
vi.mock('react', async importOriginal => {
  const react = await importOriginal<typeof import('react')>();
  return { ...react, useState: (initial: unknown) => react.useState(initial === '' ? search.query : initial) };
});
let audit: RetailData['audit'];
vi.mock('../state/useRetail', () => ({ useRetail: () => ({ data: { audit } }) }));
vi.mock('../lib/supabase', () => ({ supabase: null }));

const newActions = [
  ['update_quote', 'Cotización actualizada'],
  ['cancel_quote', 'Cotización cancelada'],
  ['confirm_purchase_draft', 'Borrador de compra confirmado'],
  ['cancel_purchase', 'Compra cancelada'],
  ['link_historical_item', 'Artículo del sistema anterior vinculado'],
  ['cancel_legacy_sale', 'Venta anterior cancelada sin mover inventario'],
  ['legacy_import', 'Datos del sistema anterior importados'],
] as const;

beforeEach(() => {
  search.query = '';
  audit = newActions.map(([action], index) => ({ id: index + 1, action, entity_id: null, operation_id: null, actor_id: null, actor_email: `${index}@example.test`, details: {}, created_at: '2026-09-24T12:00:00Z' }));
});

describe('Audit action labels and search', () => {
  it('renders every new operation in Spanish without exposing command identifiers', () => {
    const html = renderToStaticMarkup(<AuditPage />);
    for (const [action, label] of newActions) { expect(html).toContain(label); expect(html).not.toContain(action); }
  });

  it.each(newActions)('finds %s by its Spanish label, without requiring accents or casing', (action, label) => {
    search.query = label.normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase();
    const html = renderToStaticMarkup(<AuditPage />);
    expect(html).toContain(`<td>${label}</td>`);
    expect(html).not.toContain(action);
    expect(html.match(/<tbody><tr>|<\/tr><tr>/g)).toHaveLength(1);
  });

  it('keeps searching by the actor email', () => {
    search.query = '4@example.test';
    const html = renderToStaticMarkup(<AuditPage />);
    expect(html).toContain('Artículo del sistema anterior vinculado');
    expect(html).not.toContain('Cotización actualizada');
  });

  it('uses a Spanish fallback for an unknown future command instead of showing technical text', () => {
    audit[0] = { ...audit[0]!, action: 'future_internal_action' };
    search.query = 'operacion registrada';
    const html = renderToStaticMarkup(<AuditPage />);
    expect(html).toContain('Operación registrada'); expect(html).not.toContain('future_internal_action');
  });
});
