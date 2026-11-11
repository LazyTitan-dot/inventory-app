import { describe, expect, it } from 'vitest';
import { pendingPurchaseUnits, replenishmentQuantity, stockHealth } from './catalog';
import type { RetailData } from './contracts';

describe('inventory stock health and replenishment', () => {
  it('keeps exhausted stock separate from low stock, including a zero minimum', () => {
    expect(stockHealth(0, 0)).toBe('out');
    expect(stockHealth(1, 0)).toBe('available');
    expect(stockHealth(3, 3)).toBe('low');
  });
  it('subtracts only outstanding committed purchase units from the replenishment target', () => {
    const data = {
      documents: [
        { id: 'pending', type: 'purchase', status: 'pending' },
        { id: 'partial', type: 'purchase', status: 'partial' },
        { id: 'draft', type: 'purchase', status: 'draft' },
        { id: 'cancelled', type: 'purchase', status: 'cancelled' },
        { id: 'closed', type: 'purchase', status: 'partial', closed_short: true },
      ],
      document_items: ['pending', 'partial', 'draft', 'cancelled', 'closed'].map((id, index) => ({
        document_id: id,
        variant_id: 'variant',
        quantity: 5,
        received_quantity: index === 1 ? 3 : 0,
      })),
    } as Pick<RetailData, 'documents' | 'document_items'>;
    expect(pendingPurchaseUnits(data, 'variant')).toBe(7);
    expect(replenishmentQuantity(12, 3, 7)).toBe(2);
    expect(replenishmentQuantity(3, 3, 7)).toBe(0);
  });
});
