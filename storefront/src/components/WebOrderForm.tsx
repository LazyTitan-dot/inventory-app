import { useRef, useState, type FormEvent } from 'react';
import type { Product } from '../data/contracts';
const styles="/* Scoped to the new checkout form; no changes to accepted catalog geometry. */\n.web-order-form{display:grid;gap:12px;margin-top:16px;min-width:0;color:inherit}\n.web-order-form fieldset{border:0;padding:0;margin:0;display:grid;gap:12px;min-width:0}\n.web-order-form label{display:grid;gap:6px;font-size:14px;text-align:left;min-width:0}\n.web-order-form input:not([type=checkbox]),.web-order-form textarea{font:inherit;box-sizing:border-box;width:100%;min-width:0;border:1px solid #abbfd0;background:#fff;color:#13283e;border-radius:10px;padding:11px;min-height:44px}\n.web-order-form textarea{resize:vertical}\n.web-order-form input:focus-visible,.web-order-form textarea:focus-visible,.web-order-submit:focus-visible{outline:3px solid #21bee7;outline-offset:2px}\n.web-order-form .web-order-consent{display:flex;gap:8px;align-items:flex-start}\n.web-order-consent input{flex:none;margin-top:3px;width:18px;height:18px}\n.web-order-submit{width:100%;min-height:44px;background:#0a64bb;color:#fff;border:0;border-radius:12px;padding:12px;font:inherit;font-weight:600;cursor:pointer}\n.web-order-submit:disabled{opacity:.6;cursor:wait}\n.web-order-error{color:#b52d42;overflow-wrap:anywhere}\n";

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
  if(!open)return <><style>{styles}</style><button type="button" className="commerce-primary web-order-submit" onClick={()=>setOpen(true)}>Solicitar pedido</button></>;
  return <><style>{styles}</style><form className="web-order-form" onSubmit={(e)=>void submit(e)}>
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
  </form></>;
}
