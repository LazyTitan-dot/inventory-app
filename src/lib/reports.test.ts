import { describe, expect, it } from 'vitest';
import type { DocumentItem, RetailDocument } from './contracts';
import { businessDate, matches, money } from './format';
import { reportForPeriod, stockOverview } from './reports';

const createdAt = '2026-09-24T15:00:00Z';
function document(id: string, patch: Partial<RetailDocument> = {}): RetailDocument {
  return { id, number: `VTA-${id}`, type: 'sale', status: 'completed', contact_id: null, contact_snapshot: {}, subtotal: 1000, discount: 100, tax_rate: 18, tax: 162, total: 1062, currency: 'DOP', payment_method: 'cash', tendered: 1100, change_amount: 38, notes: '', parent_id: null, promotion_id: null, expires_at: null, created_by: null, created_at: createdAt, updated_at: createdAt, ...patch };
}
function item(id: string, documentId: string, patch: Partial<DocumentItem> = {}): DocumentItem {
  return { id, document_id: documentId, variant_id: 'variant', product_snapshot: { category: 'tv', brand: 'Marca', model: 'Modelo', name: 'Estándar', sku: 'SKU', barcode: null, warranty_months: 12 }, quantity: 2, received_quantity: 0, returned_quantity: 0, unit_price: 500, unit_cost: 300, discount: 100, tax: 162, line_total: 1062, parent_item_id: null, ...patch };
}
describe('reportes de operación', () => {
  it('resta las devoluciones en su fecha y concilia ingresos, impuestos, categoría y cobros', () => {
    const data = { documents: [document('sale'),document('return',{ type: 'return', subtotal:500,discount:50,tax:81,total:531,parent_id:'sale' })], document_items: [item('sale-item','sale'),item('return-item','return',{quantity:1,discount:50,tax:81,line_total:531,parent_item_id:'sale-item'})] };
    const report = reportForPeriod(data,'2026-09-24','2026-09-24');
    expect(report.total).toBe(531); expect(report.tax).toBe(81); expect(report.netRevenue).toBe(450);
    expect(report.cost).toBe(300); expect(report.profit).toBe(150);
    expect(report.categories).toEqual([['tv',450]]); expect(report.payments).toEqual([['cash',531]]);
  });
  it('excluye anulaciones, cotizaciones, pendientes legadas y ventas de otro día', () => {
    const docs = [document('void',{status:'voided'}),document('quote',{type:'quote',status:'open'}),document('pending',{status:'legacy_pending'}),document('other',{created_at:'2026-09-24T03:59:59Z'})];
    expect(reportForPeriod({documents:docs,document_items:[]},'2026-09-24','2026-09-24').included).toHaveLength(0);
  });
  it('puede mostrar reembolsos de ventas anteriores sin inventar ingresos del período', () => {
    const report = reportForPeriod({documents:[document('sale',{created_at:'2026-09-01T15:00:00Z'}),document('return',{type:'return'})],document_items:[]},'2026-09-24','2026-09-24');
    expect(report.total).toBe(-1062); expect(report.sales).toHaveLength(0); expect(report.refunds).toHaveLength(1);
  });
  it('descuenta solo lo pendiente de órdenes confirmadas al sugerir una reposición', () => {
    const result = stockOverview({ products:[{id:'product',brand:'Marca',model:'Modelo',category:'tv',description:'',warranty_months:12,images:[],active:true,created_at:createdAt,updated_at:createdAt}], variants:[{id:'variant',product_id:'product',name:'Estándar',sku:'SKU',barcode:null,price:500,cost:300,min_stock:3,reorder_target:10,active:true,created_at:createdAt,updated_at:createdAt}],stocks:[{variant_id:'variant',available:2,quarantine:5,updated_at:createdAt}],documents:[document('open',{type:'purchase',status:'partial'}),document('cancelled',{type:'purchase',status:'cancelled'}),document('draft',{type:'purchase',status:'draft'})],document_items:[item('a','open',{quantity:6,received_quantity:2}),item('b','cancelled',{quantity:100}),item('c','draft',{quantity:100})] });
    expect(result[0]?.incoming).toBe(4); expect(result[0]?.suggested).toBe(4);
  });
});
describe('presentación dominicana', () => {
  it('usa el día comercial de RD a ambos lados de la medianoche UTC', () => {
    expect(businessDate(new Date('2026-09-24T03:59:59Z'))).toBe('2026-09-23');
    expect(businessDate(new Date('2026-09-24T04:00:00Z'))).toBe('2026-09-24');
  });
  it('busca sin distinguir tildes y marca explícitamente los pesos dominicanos', () => {
    expect(matches('refrigeracion','Refrigeración')).toBe(true);
    expect(money(1250.5)).toContain('RD$'); expect(money(1250.5)).toContain('1,250.50');
  });
});
