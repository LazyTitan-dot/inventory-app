import { ChevronRight } from 'lucide-react';
import type { RetailDocument } from '../lib/contracts';
import { documentNumber, money, paymentLabels, shortDate } from '../lib/format';
import { StatusBadge } from '../components/ui';
const customer = (doc: RetailDocument) => String(doc.contact_snapshot.name || 'Cliente de mostrador');
const payment = (doc: RetailDocument) => doc.payment_method ? paymentLabels[doc.payment_method] || doc.payment_method : 'No registrado';
export function SalesHistory({documents,onOpen}:{documents:readonly RetailDocument[];onOpen:(id:string)=>void}){
 return <>
  <div className="table-wrap sales-desktop-history">
   <table className="data-table sales-history-table">
    <colgroup><col style={{width:'36%'}}/><col style={{width:'17%'}}/><col style={{width:'17%'}}/><col style={{width:'21%'}}/><col style={{width:'9%'}}/></colgroup>
    <thead><tr><th scope="col">Documento / cliente</th><th scope="col">Estado</th><th scope="col">Medio de pago</th><th scope="col" className="number">Total</th><th scope="col"><span className="sr-only">Acciones</span></th></tr></thead>
    <tbody>{documents.map(doc=><tr key={doc.id}>
     <td><strong>{documentNumber(doc)}</strong><small>{customer(doc)} · {shortDate(doc.created_at)}</small></td>
     <td><StatusBadge status={doc.status}/></td><td>{payment(doc)}</td><td className="number"><strong>{money(doc.total)}</strong></td>
     <td><button type="button" className="button ghost sales-history-open" aria-label={`Ver ${documentNumber(doc)}`} onClick={()=>onOpen(doc.id)}><ChevronRight size={19}/></button></td>
    </tr>)}</tbody>
   </table>
  </div>
  <div className="sales-mobile-history">{documents.map(doc=><button type="button" className="sales-history-card" key={doc.id} aria-label={`Ver ${documentNumber(doc)}`} onClick={()=>onOpen(doc.id)}>
   <span className="sales-history-card-top"><span><strong>{documentNumber(doc)}</strong><small>{customer(doc)}</small></span><StatusBadge status={doc.status}/></span>
   <span className="sales-history-card-bottom"><span>{shortDate(doc.created_at)} · {payment(doc)}</span><strong>{money(doc.total)}</strong></span>
  </button>)}</div>
 </>;
}
