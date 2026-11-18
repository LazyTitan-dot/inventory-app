import { ChevronRight } from 'lucide-react';
import type { DocumentItem, RetailDocument } from '../lib/contracts';
import { documentNumber, integer, money, shortDate } from '../lib/format';
import { StatusBadge } from '../components/ui';

function quantities(items: readonly DocumentItem[]) {
  const ordered = items.reduce((n, item) => n + item.quantity, 0);
  const received = items.reduce((n, item) => n + item.received_quantity, 0);
  const damaged = items.reduce((n, item) => n + (item.damaged_quantity ?? 0), 0);
  return { ordered, received, damaged, good: Math.max(0, received - damaged), remaining: items.reduce((n, item) => n + Math.max(0, item.quantity - item.received_quantity), 0) };
}
const open = (doc: RetailDocument) => ['pending','partial'].includes(doc.status);
function remainderLabel(doc: RetailDocument, remaining: number) {
  if (open(doc)) return `${integer(remaining)} pendientes`;
  if (doc.status === 'closed_short') return `${integer(remaining)} faltantes al cierre`;
  if (doc.status === 'received') return 'Recepción completa';
  if (doc.status === 'draft') return 'Sin confirmar';
  if (doc.status === 'cancelled') return 'Orden cancelada';
  return 'Historial de recepción';
}
function Progress({ doc, items }: { doc: RetailDocument; items: readonly DocumentItem[] }) {
  const q = quantities(items);
  if (!items.length || q.ordered <= 0) return <span className="purchase-progress-missing">Sin cantidades registradas</span>;
  return <span className="purchase-progress">
    <strong>{integer(q.received)} / {integer(q.ordered)}</strong>
    <progress max={q.ordered} value={Math.min(q.ordered, Math.max(0,q.received))} aria-label={`Unidades contabilizadas de ${documentNumber(doc)}`} />
    <small>{remainderLabel(doc, q.remaining)}</small>
  </span>;
}
export function PurchaseOrderProgress({ document: doc, items }: { document: RetailDocument; items: readonly DocumentItem[] }) {
  const q = quantities(items);
  return <section className="purchase-order-progress" aria-label="Progreso de la orden">
    <div className="purchase-order-progress-head"><h3>Progreso de la orden</h3><Progress doc={doc} items={items} /></div>
    {items.length > 0 && <div className="purchase-progress-metrics">
      <div><span>Conformes contabilizadas</span><strong>{integer(q.good)}</strong></div>
      <div><span>Dañadas registradas</span><strong>{integer(q.damaged)}</strong></div>
      <div><span>{open(doc) ? 'Pendientes' : doc.status === 'closed_short' ? 'Faltantes al cierre' : 'Sin contabilizar'}</span><strong>{integer(q.remaining)}</strong></div>
    </div>}
  </section>;
}
export function PurchaseOrdersList({ documents, items, isLate, onOpen }: { documents: readonly RetailDocument[]; items: readonly DocumentItem[]; isLate: (doc: RetailDocument) => boolean; onOpen: (id: string) => void }) {
  const byOrder = new Map<string, DocumentItem[]>();
  for (const item of items) {
    const group = byOrder.get(item.document_id) ?? [];
    group.push(item); byOrder.set(item.document_id, group);
  }
  const supplier = (doc: RetailDocument) => String(doc.contact_snapshot.name || 'Proveedor');
  const expected = (doc: RetailDocument) => doc.expected_at ? shortDate(`${doc.expected_at}T12:00:00-04:00`) : 'Sin fecha esperada';
  return <>
    <div className="table-wrap purchase-desktop-list">
      <table className="data-table purchase-table">
        <colgroup><col style={{width:'26%'}}/><col style={{width:'19%'}}/><col style={{width:'19%'}}/><col style={{width:'15%'}}/><col style={{width:'14%'}}/><col style={{width:'7%'}}/></colgroup>
        <thead><tr><th scope="col">Orden / proveedor</th><th scope="col">Fechas</th><th scope="col">Recepción</th><th scope="col">Estado</th><th scope="col" className="number">Total RD$</th><th scope="col"><span className="sr-only">Acciones</span></th></tr></thead>
        <tbody>{documents.map(doc => <tr key={doc.id}>
          <td><button type="button" className="purchase-order-link" aria-label={`Ver ${documentNumber(doc)}`} onClick={() => onOpen(doc.id)}><strong>{documentNumber(doc)}</strong><small>{supplier(doc)}</small></button></td>
          <td><span>{shortDate(doc.created_at)}</span><small className={isLate(doc) ? 'purchase-late' : ''}>Esperada: {expected(doc)}{isLate(doc) ? ' · Atrasada' : ''}</small></td>
          <td><Progress doc={doc} items={byOrder.get(doc.id) ?? []}/></td>
          <td><StatusBadge status={doc.status}/></td>
          <td className="number"><strong>{money(doc.total)}</strong></td>
          <td className="purchase-disclosure-cell"><button type="button" className="purchase-disclosure" aria-label={`Detalle de ${documentNumber(doc)}`} aria-haspopup="dialog" title="Abrir orden" onClick={() => onOpen(doc.id)}><ChevronRight size={23} strokeWidth={2.7} aria-hidden="true"/></button></td>
        </tr>)}</tbody>
      </table>
    </div>
    <div className="purchase-mobile-list">{documents.map(doc => <button type="button" className="purchase-order-card" key={doc.id} aria-label={`Ver ${documentNumber(doc)}`} aria-haspopup="dialog" onClick={() => onOpen(doc.id)}>
      <span className="purchase-card-top"><span><strong>{documentNumber(doc)}</strong><small>{supplier(doc)}</small></span><StatusBadge status={doc.status}/></span>
      <span className="purchase-card-meta"><span className={isLate(doc) ? 'purchase-late' : ''}>{expected(doc)}{isLate(doc) ? ' · Atrasada' : ''}</span><strong>{money(doc.total)}</strong></span>
      <Progress doc={doc} items={byOrder.get(doc.id) ?? []}/><span className="purchase-card-open" aria-hidden="true"><ChevronRight size={23} strokeWidth={2.7}/></span>
    </button>)}</div>
  </>;
}
