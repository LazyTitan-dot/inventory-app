import { useRef, useState, type FormEvent } from 'react';
import type { Product } from '../data/contracts';
import './web-order.css';

type Line = {p: Product; n: number};
export function WebOrderForm({lines,onReceipt}:{lines:Line[];onReceipt:(id:string)=>void}) {
  const [open,setOpen]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const attempt=useRef<{body:string;id:string}|null>(null);
  const running=useRef(false);
  const valid=lines.length>0&&lines.length<=20&&lines.every(({p,n})=>p.source==='commercial'&&typeof p.variantId==='string'&&Number.isSafeInteger(p.priceMinor)&&Number.isInteger(n)&&n>=1&&n<=(p.maxQuantity??0));
  async function submit(e:FormEvent<HTMLFormElement>) {
    e.preventDefault(); if(running.current||!valid)return;
    const f=new FormData(e.currentTarget);
    const items=lines.map(({p,n})=>({variantId:p.variantId,quantity:n,priceMinor:p.priceMinor}));
    const input={name:String(f.get('name')??'').trim(),phone:String(f.get('phone')??'').trim(),email:String(f.get('email')??'').trim(),address:String(f.get('address')??'').trim(),items,expectedTotalMinor:items.reduce((a,i)=>a+i.quantity*(i.priceMinor??0),0)};
    if(!f.get('consent')) {setError('Autoriza el uso de tus datos para gestionar el pedido.');return;}
    const body=JSON.stringify(input);
    if(attempt.current?.body!==body)attempt.current={body,id:crypto.randomUUID()};
    const id=attempt.current.id;
    running.current=true;setBusy(true);setError('');
    try {
      const r=await fetch('/api/orders/v1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...input,id}),cache:'no-store',signal:AbortSignal.timeout(20000)});
      if(!r.ok){setError(r.status===409?'El precio o las existencias cambiaron. Actualiza el catálogo y revisa tu carrito.':r.status===429?'Hay demasiadas solicitudes. Inténtalo más tarde.':'No se pudo enviar el pedido. Inténtalo nuevamente sin cambiar los datos.');return;}
      const result:unknown=await r.json();
      if(!result||typeof result!=='object'||!('id' in result)||result.id!==id||!('status' in result)||result.status!=='received')throw Error('Respuesta inválida');
      onReceipt(id);
    } catch {setError('No se pudo confirmar la recepción. Intenta de nuevo sin cambiar los datos para evitar duplicados.');}
    finally{running.current=false;setBusy(false);}
  }
  if(!valid)return <p role="status">Revisa los artículos y cantidades antes de solicitar un pedido.</p>;
  if(!open)return <button type="button" className="commerce-primary web-order-submit" onClick={()=>setOpen(true)}>Solicitar pedido</button>;
  return <form className="web-order-form" onSubmit={(e)=>void submit(e)}>
    <h3>Contacto y entrega</h3>
    <fieldset disabled={busy}>
      <label>Nombre completo<input name="name" autoComplete="name" required minLength={2} maxLength={160}/></label>
      <label>Teléfono / WhatsApp<input name="phone" type="tel" autoComplete="tel" required minLength={8} maxLength={30}/></label>
      <label>Correo electrónico (opcional)<input name="email" type="email" autoComplete="email" maxLength={254}/></label>
      <label>Dirección de entrega<textarea name="address" autoComplete="street-address" required minLength={5} maxLength={1000} rows={3}/></label>
      <label className="web-order-consent"><input name="consent" type="checkbox" required/> Autorizo a S-mart Living a utilizar estos datos exclusivamente para gestionar mi pedido y contactarme.</label>
      <p>No ingreses datos de tarjetas. El pedido queda pendiente de confirmación.</p>
      <button className="commerce-primary web-order-submit" type="submit">{busy?'Enviando…':'Enviar pedido'}</button>
      <button type="button" className="commerce-secondary" onClick={()=>setOpen(false)}>Volver</button>
    </fieldset>
    {error&&<p role="alert" className="web-order-error">{error}</p>}
  </form>;
}
