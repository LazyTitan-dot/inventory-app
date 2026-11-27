import { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useRetail } from '../state/useRetail';
import { money } from '../lib/format';
import { EmptyState, ErrorNotice, Field, Modal, PageHeader, ConfirmButton } from '../components/ui';
import { SaleSerialPicker } from '../components/SerialSalePicker';

type Item={variant_id:string;label:string;quantity:number;price_minor:number};
type Order={id:string;status:'pending'|'confirmed'|'cancelled'|'converted';customer_name:string;phone:string;email:string;address:string;total_minor:number;created_at:string;sale_id:string|null;items:Item[]};
const labels={pending:'Pendiente',confirmed:'Reservado',cancelled:'Cancelado',converted:'Convertido a venta'} as const;
const readOrders=async():Promise<Order[]>=>{
 if(!supabase)throw Error('Conexión no disponible.');
 const r=await supabase.rpc('storefront_list_orders_v1');
 if(r.error)throw Error(r.error.message);
 if(!Array.isArray(r.data))throw Error('No se pudieron leer los pedidos.');
 return r.data as Order[];
};
function OrderDetail({order,onClose,onChange}:{order:Order;onClose:()=>void;onChange:()=>Promise<void>}){
 const {data,notify,refresh}=useRetail();
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const [contactId,setContactId]=useState(''),[payment,setPayment]=useState('transfer'),[paid,setPaid]=useState(false);
 const [serials,setSerials]=useState<Record<string,string[]>>({});
 const [currentStatus,setCurrentStatus]=useState(order.status);
 const [saleId,setSaleId]=useState(order.sale_id);
 async function command(action:'confirm'|'cancel'|'convert'){
  if(busy)return;
  setBusy(true);setError('');
  try{
   if(!supabase)throw Error('Conexión no disponible.');
   const cmd=action==='convert'?{id:order.id,action,contactId,paymentMethod:payment,paymentConfirmed:paid,serialAssignments:order.items.map(i=>({variant_id:i.variant_id,serial_ids:serials[i.variant_id]??[]})).filter(i=>i.serial_ids.length)}:{id:order.id,action};
   const r=await supabase.rpc('storefront_order_command_v1',{command:cmd});
   if(r.error)throw Error(r.error.message);
   const status=r.data?.status as Order['status'];
   if(!status||!(status in labels))throw Error('Respuesta inválida. Actualiza los pedidos.');
   setCurrentStatus(status);setSaleId(r.data?.sale_id??null);notify(labels[status]);
   const results=await Promise.allSettled([onChange(),refresh()]);
   if(results.some(r=>r.status==='rejected'))setError('La operación fue guardada. Actualiza los datos para ver el resultado.');
  }catch(e){setError(e instanceof Error?e.message:'No se completó la operación.');throw e;}
  finally{setBusy(false);}
 }
 return <Modal title="Pedido web" onClose={()=>{if(!busy)onClose();}} wide>
  <div style={{display:'grid',gap:16,minWidth:0}}>
   <div style={{overflowWrap:'anywhere'}}><strong>{labels[currentStatus]}</strong><p>Referencia: {order.id}</p><p>{order.customer_name} · {order.phone}</p>{order.email&&<p>{order.email}</p>}<p>Entrega: {order.address}</p></div>
   {order.items.map(i=><div key={i.variant_id} style={{display:'grid',gap:6,borderTop:'1px solid var(--line)',paddingTop:12}}>
     <strong>{i.label}</strong><span>{i.quantity} × {money(i.price_minor/100)} = {money(i.quantity*i.price_minor/100)}</span>
     {currentStatus==='confirmed'&&<SaleSerialPicker variantId={i.variant_id} quantity={i.quantity} selected={serials[i.variant_id]??[]} onChange={ids=>setSerials(old=>({...old,[i.variant_id]:ids}))} disabled={busy}/>}
   </div>)}
   <h3>Total: {money(order.total_minor/100)} (ITBIS incluido)</h3>
   {currentStatus==='pending'&&<><p>Confirma con el cliente disponibilidad y condiciones de entrega antes de reservar.</p><ConfirmButton label="Confirmar y reservar" message="Se reservarán todas las unidades de forma atómica." onConfirm={()=>command('confirm')} disabled={busy}/></>}
   {currentStatus==='confirmed'&&<div style={{display:'grid',gap:12}}>
    <Field label="Cliente en Inventory Manager" hint="Si no existe, créalo en Clientes antes de convertir."><select value={contactId} disabled={busy} onChange={e=>setContactId(e.target.value)}><option value="">Seleccionar cliente</option>{data.contacts.filter(c=>c.kind==='customer'&&c.active).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
    <Field label="Medio de pago recibido"><select value={payment} disabled={busy} onChange={e=>{setPayment(e.target.value);setPaid(false);}}><option value="transfer">Transferencia</option><option value="cash">Efectivo (importe exacto)</option><option value="card">Tarjeta</option><option value="other">Otro</option></select></Field>
    <label style={{display:'flex',gap:8,alignItems:'center'}}><input type="checkbox" checked={paid} disabled={busy} onChange={e=>setPaid(e.target.checked)}/> Confirmo que se recibió el importe completo.</label>
    <ConfirmButton label="Convertir a venta" message="Registrará una venta real con el motor de caja. Verifica el cliente, el pago y las series." disabled={busy||!contactId||!paid} onConfirm={()=>command('convert')}/>
   </div>}
   {(currentStatus==='pending'||currentStatus==='confirmed')&&<ConfirmButton label="Cancelar pedido" message="Si existe una reserva, liberará las unidades." onConfirm={()=>command('cancel')} disabled={busy}/>}
   {saleId&&<p style={{overflowWrap:'anywhere'}}>Venta vinculada: {saleId}. Disponible en Ventas.</p>}
   <ErrorNotice message={error}/>
  </div>
 </Modal>;
}
export function WebOrdersPanel(){
 const [orders,setOrders]=useState<Order[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[selected,setSelected]=useState<Order|null>(null);
 const [filter,setFilter]=useState<'all'|Order['status']>('all');
 useEffect(()=>{let alive=true;void readOrders().then(rows=>{if(alive){setOrders(rows);setLoading(false);}}).catch(e=>{if(alive){setError(e instanceof Error?e.message:'Error de lectura');setLoading(false);}});return()=>{alive=false;};},[]);
 async function reload(){setLoading(true);setError('');try{setOrders(await readOrders());}catch(e){setError(e instanceof Error?e.message:'Error de lectura');throw e;}finally{setLoading(false);}}
 const visible=orders.filter(o=>filter==='all'||o.status===filter);
 return <section style={{display:'grid',gap:16,minWidth:0}}>
  <PageHeader eyebrow="Tienda online" title="Pedidos web" description="Solicitudes de clientes, reservas y ventas." actions={<button type="button" className="button secondary" disabled={loading} onClick={()=>void reload().catch(()=>{})}>Actualizar</button>}/>
  <Field label="Estado"><select value={filter} onChange={e=>setFilter(e.target.value as typeof filter)}><option value="all">Todos</option>{Object.entries(labels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></Field>
  <ErrorNotice message={error}/>
  {loading?<p role="status">Cargando pedidos…</p>:visible.length===0?<EmptyState title="No hay pedidos" description="Los pedidos recibidos desde el Storefront aparecerán aquí."/>:visible.map(o=><button key={o.id} type="button" className="button secondary" onClick={()=>setSelected(o)} style={{display:'flex',justifyContent:'space-between',alignItems:'center',textAlign:'left',height:'auto',minHeight:64,padding:14,whiteSpace:'normal',gap:12}}>
   <span style={{display:'grid',gap:4,minWidth:0,overflowWrap:'anywhere'}}><strong>{o.customer_name}</strong><span>{labels[o.status]} · {o.items.reduce((a,i)=>a+i.quantity,0)} unidades · {money(o.total_minor/100)}</span><small>{new Date(o.created_at).toLocaleString('es-DO',{timeZone:'America/Santo_Domingo'})}</small></span><ChevronRight size={20} style={{flexShrink:0}}/>
  </button>)}
  {selected&&<OrderDetail key={selected.id} order={selected} onClose={()=>setSelected(null)} onChange={reload}/>}
 </section>;
}
