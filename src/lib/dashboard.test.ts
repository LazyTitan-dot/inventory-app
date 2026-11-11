import { describe, expect, it } from 'vitest';
import type { RetailData, RetailDocument } from './contracts';
import { calendarDaysEnding, dashboardActivity, dashboardTasks, salesTrend } from './dashboard';

const document = (id: string, type: RetailDocument['type'], created_at: string, total: number, status = 'completed') => ({ id, type, created_at, total, status, number: id, contact_snapshot: {} } as RetailDocument);
function fixture(): RetailData {
  return { permissions: { sell: false, manage_business: false, purchase: false, view_costs: false }, products: [], variants: [], stocks: [], documents: [], document_items: [], deliveries: [], movements: [] } as unknown as RetailData;
}

describe('real dashboard data', () => {
  it('builds calendar buckets across month/year boundaries independently of local timezone', () => {
    expect(calendarDaysEnding('2027-01-03', 7)).toEqual(['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03']);
  });

  it('uses Dominican dates, nets returns at their own date, and excludes voided/future sales', () => {
    const rows = salesTrend([
      document('prior-day', 'sale', '2026-11-11T02:00:00Z', 100),
      document('sale', 'sale', '2026-11-11T05:00:00Z', 250, 'returned'),
      document('return', 'return', '2026-11-11T12:00:00Z', 300),
      document('void', 'sale', '2026-11-11T12:00:00Z', 999, 'voided'),
      document('future', 'sale', '2026-11-12T12:00:00Z', 999),
    ], '2026-11-11', 7);
    expect(rows).toHaveLength(7);
    expect(rows.at(-2)).toEqual({ day: '2026-11-10', amount: 100 });
    expect(rows.at(-1)).toEqual({ day: '2026-11-11', amount: -50 });
    expect(rows[0]?.amount).toBe(0);
  });

  it('does not surface purchases or deliveries as tasks without the corresponding permissions', () => {
    const data = fixture();
    data.documents = [document('purchase', 'purchase', '2026-11-11T12:00:00Z', 500, 'pending')];
    data.deliveries = [{ id: 'delivery', scheduled_at: '2026-11-10T12:00:00Z', status: 'failed', contact_name: 'Customer', address: 'Private address' }] as RetailData['deliveries'];
    expect(dashboardTasks(data, new Date('2026-11-11T12:00:00Z'))).toEqual([]);
    data.permissions.purchase = true;
    expect(dashboardTasks(data, new Date('2026-11-11T12:00:00Z')).map((task) => task.kind)).toEqual(['delivery', 'purchase']);
  });

  it('omits unrelated document activity and purchase amounts without cost visibility', () => {
    const data = fixture();
    data.documents = [document('sale', 'sale', '2026-11-11T12:00:00Z', 250), document('purchase', 'purchase', '2026-11-11T12:00:00Z', 150, 'pending')];
    expect(dashboardActivity(data)).toEqual([]);
    data.permissions.purchase = true;
    const rows = dashboardActivity(data);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.title).toContain('Compra');
    expect(rows[0]?.amount).toBeNull();
  });
});
