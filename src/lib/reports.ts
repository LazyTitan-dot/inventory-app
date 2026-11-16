import type { RetailData } from './contracts';
import { businessDate } from './format';

export function reportForPeriod(
  data: Pick<RetailData, 'documents' | 'document_items'>,
  from: string,
  to: string,
) {
  const included = data.documents.filter((d) => {
    const day = businessDate(new Date(d.created_at));
    return (
      day >= from &&
      day <= to &&
      ((d.type === 'sale' && ['completed', 'partially_returned', 'returned'].includes(d.status)) ||
        d.type === 'return')
    );
  });
  const sales = included.filter((d) => d.type === 'sale');
  const refunds = included.filter((d) => d.type === 'return');
  const sum = (docs: typeof sales, field: 'total' | 'tax' | 'discount' | 'subtotal') =>
    docs.reduce((total, d) => total + d[field], 0);
  const total = sum(sales, 'total') - sum(refunds, 'total');
  const tax = sum(sales, 'tax') - sum(refunds, 'tax');
  const netRevenue = total - tax;
  const byId = new Map(included.map((d) => [d.id, d]));
  const items = data.document_items.filter((item) => byId.has(item.document_id));
  const cost = items.reduce(
    (total, item) =>
      total +
      item.quantity *
        (item.unit_cost ?? 0) *
        (byId.get(item.document_id)?.type === 'return' ? -1 : 1),
    0,
  );
  const categoryMap = new Map<string, number>();
  for (const item of items) {
    const sign = byId.get(item.document_id)?.type === 'return' ? -1 : 1;
    categoryMap.set(
      item.product_snapshot.category,
      (categoryMap.get(item.product_snapshot.category) ?? 0) + (item.line_total - item.tax) * sign,
    );
  }
  const payments = new Map<string, number>();
  for (const doc of included)
    payments.set(
      doc.payment_method ?? 'other',
      (payments.get(doc.payment_method ?? 'other') ?? 0) +
        doc.total * (doc.type === 'return' ? -1 : 1),
    );
  return {
    sales,
    refunds,
    included,
    total,
    tax,
    netRevenue,
    cost,
    profit: netRevenue - cost,
    categories: [...categoryMap.entries()].sort((a, b) => b[1] - a[1]),
    payments: [...payments.entries()],
  };
}

export function stockOverview(
  data: Pick<RetailData, 'products' | 'variants' | 'stocks' | 'documents' | 'document_items'>,
) {
  const activeProducts = new Map(data.products.filter((p) => p.active).map((p) => [p.id, p]));
  const stockById = new Map(data.stocks.map((s) => [s.variant_id, s]));
  const purchaseIds = new Set(
    data.documents
      .filter((d) => d.type === 'purchase' && ['pending', 'partial'].includes(d.status))
      .map((d) => d.id),
  );
  const incoming = new Map<string, number>();
  for (const item of data.document_items)
    if (item.variant_id && purchaseIds.has(item.document_id))
      incoming.set(
        item.variant_id,
        (incoming.get(item.variant_id) ?? 0) + item.quantity - item.received_quantity,
      );
  return data.variants
    .filter((v) => v.active && activeProducts.has(v.product_id))
    .map((v) => {
      const available = stockById.get(v.id)?.available ?? 0;
      const inTransit = incoming.get(v.id) ?? 0;
      return {
        variant: v,
        product: activeProducts.get(v.product_id)!,
        available,
        incoming: inTransit,
        suggested:
          available <= v.min_stock ? Math.max(0, v.reorder_target - available - inTransit) : 0,
      };
    });
}

/** Additional analytics use the same eligible documents and historical lines as the existing report. */
const roundMoney = (value: number) => Math.round(value * 100) / 100;
export function grossMargin(revenue: number, profit: number): number | null {
  return revenue > 0 ? profit / revenue * 100 : null;
}
export function reportPeriod(today: string, preset: 'today' | '7' | '30' | 'month' | 'previous') {
  const date = new Date(today + 'T12:00:00Z');
  const iso = (d: Date) => d.toISOString().slice(0,10);
  if (preset === 'previous') {
    const first = new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()-1,1,12));
    const last = new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),0,12));
    return {from:iso(first),to:iso(last)};
  }
  if (preset === 'month') return {from:today.slice(0,7)+'-01',to:today};
  date.setUTCDate(date.getUTCDate() - (preset === 'today' ? 0 : Number(preset)-1));
  return {from:iso(date),to:today};
}
export function reportAnalytics(data: Pick<RetailData,'documents'|'document_items'>, from: string, to: string) {
  const report = reportForPeriod(data,from,to);
  const docs = new Map(report.included.map(d=>[d.id,d]));
  const lines = data.document_items.filter(i=>docs.has(i.document_id));
  const allLines = new Map(data.document_items.map(i=>[i.id,i]));
  const products = new Map<string,{key:string; snapshot:RetailData['document_items'][number]['product_snapshot']; sold:number; returned:number; revenue:number; cost:number; profit:number; incomplete:boolean}>();
  let incompleteCost = 0;
  for (const i of lines) {
    const original = i.parent_item_id ? allLines.get(i.parent_item_id) ?? i : i;
    const key = original.variant_id ? 'variant:'+original.variant_id : 'historical:'+original.id;
    const row = products.get(key) ?? {key,snapshot:original.product_snapshot,sold:0,returned:0,revenue:0,cost:0,profit:0,incomplete:false};
    const refund = docs.get(i.document_id)?.type === 'return';
    const sign = refund ? -1 : 1;
    if(refund) row.returned += i.quantity; else row.sold += i.quantity;
    row.revenue += (i.line_total-i.tax)*sign;
    row.cost += i.quantity*(i.unit_cost??0)*sign;
    if (i.unit_cost == null || i.unit_cost === 0) {row.incomplete=true;incompleteCost++;}
    products.set(key,row);
  }
  const rows = [...products.values()].map(row=>({...row,revenue:roundMoney(row.revenue),cost:roundMoney(row.cost),profit:roundMoney(row.revenue-row.cost)}));
  const lineRevenue = roundMoney(lines.reduce((sum,i)=>sum+(i.line_total-i.tax)*(docs.get(i.document_id)?.type==='return'?-1:1),0));
  const missingLines = report.included.filter(d=>!lines.some(i=>i.document_id===d.id)).length;
  const residual = roundMoney(report.netRevenue-lineRevenue);
  const days = Math.round((Date.parse(to+'T12:00:00Z')-Date.parse(from+'T12:00:00Z'))/86400000)+1;
  const granularity = days <= 31 ? 'day' : days <= 180 ? 'week' : 'month';
  const buckets = new Map<string,{day:string;end:string;amount:number}>();
  if (days > 0 && Number.isFinite(days)) {
    const cursor = new Date(from+'T12:00:00Z');
    while(cursor.toISOString().slice(0,10)<=to) {
      const day=cursor.toISOString().slice(0,10);
      const next = new Date(cursor);
      if(granularity==='month') next.setUTCMonth(next.getUTCMonth()+1,1);
      else next.setUTCDate(next.getUTCDate()+(granularity==='week'?7:1));
      const last=new Date(next);last.setUTCDate(last.getUTCDate()-1);
      buckets.set(day,{day,end:last.toISOString().slice(0,10)<to?last.toISOString().slice(0,10):to,amount:0});
      cursor.setTime(next.getTime());
    }
    const ordered=[...buckets.values()];
    for(const d of report.included) {
      const day=businessDate(new Date(d.created_at));
      const bucket=ordered.find(b=>b.day<=day&&day<=b.end);
      if(bucket) bucket.amount+=(d.total-d.tax)*(d.type==='return'?-1:1);
    }
  }
  return {report,rows,trend:[...buckets.values()].map(b=>({...b,amount:roundMoney(b.amount)})),granularity,incompleteCost,missingLines,residual};
}
