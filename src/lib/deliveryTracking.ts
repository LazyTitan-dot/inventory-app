import type { Delivery } from './contracts';
import { buildDeliveryTrackingWhatsAppMessage } from './whatsapp';

export function trackingSteps(delivery: Pick<Delivery, 'status' | 'history'>) {
  const active = delivery.status === 'delivered' ? 2 :
    delivery.status === 'in_transit' || (delivery.status === 'failed' && delivery.history.some((event) => event.status === 'in_transit')) ? 1 : 0;
  return ['Programada', 'En ruta', 'Entregada'].map((label, index) => ({
    label,
    state: delivery.status === 'cancelled' ? 'pending' :
      index < active || (index === 2 && delivery.status === 'delivered') ? 'done' :
        index === active ? 'current' : 'pending',
  }));
}

export function deliveryMapsUrl(delivery: Pick<Delivery, 'address' | 'address_snapshot'>): string | null {
  const snapshot = delivery.address_snapshot;
  const address = snapshot
    ? [snapshot.street, snapshot.sector, snapshot.city, snapshot.province].filter(Boolean).join(', ')
    : delivery.address.trim();
  return address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${address}, República Dominicana`)}` : null;
}

export function buildDeliveryTrackingSummary(delivery: Delivery, businessName: string, saleNumber?: string): string {
  return buildDeliveryTrackingWhatsAppMessage({ delivery, businessName, saleNumber });
}
