import { describe, expect, it } from 'vitest';
import type { Delivery } from './contracts';
import { buildDeliveryTrackingSummary, deliveryMapsUrl, trackingSteps } from './deliveryTracking';

const delivery: Delivery = {
  id: '01010101-0101-4101-8101-010101010101', sale_id: '02020202-0202-4202-8202-020202020202',
  status: 'scheduled', address: 'Calle 1, Santo Domingo', phone: '8095550101', contact_name: 'Cliente de prueba',
  scheduled_at: '2026-11-12T14:00:00Z', assignee: 'Equipo de entrega', notes: 'Nota privada',
  received_by: null, delivered_at: null, created_at: '2026-11-11T12:00:00Z', updated_at: '2026-11-11T12:00:00Z',
  history: [],
};

describe('operational delivery tracking', () => {
  it('never marks a failed or cancelled delivery as delivered', () => {
    expect(trackingSteps({ ...delivery, status: 'failed', history: [{ at: '', actor: null, status: 'in_transit', note: '' }] }).map((step) => step.state)).toEqual(['done', 'current', 'pending']);
    expect(trackingSteps({ ...delivery, status: 'cancelled' }).every((step) => step.state === 'pending')).toBe(true);
    expect(trackingSteps({ ...delivery, status: 'delivered' }).every((step) => step.state === 'done')).toBe(true);
  });
  it('constructs a fixed HTTPS Maps origin with escaped destination data', () => {
    const link = deliveryMapsUrl({ ...delivery, address: 'javascript:alert(1) & Calle 2' });
    expect(new URL(link!).origin).toBe('https://www.google.com');
    expect(new URL(link!).searchParams.get('query')).toContain('javascript:alert(1) & Calle 2');
    expect(deliveryMapsUrl({ address: '', address_snapshot: null })).toBeNull();
  });
  it('shares recorded states without internal notes, contact details or made-up GPS estimates', () => {
    const message = buildDeliveryTrackingSummary(delivery, 'Tienda de prueba', 'VEN-001');
    expect(message).toContain('VEN-001');
    expect(message).toContain('no incluye ubicación GPS');
    expect(message).toContain('Puedes escribirnos por este mismo chat');
    expect(message).not.toContain('Consulta con la tienda');
    for (const privateValue of [delivery.id, delivery.phone, delivery.notes, delivery.address]) expect(message).not.toContain(privateValue);
  });
});
