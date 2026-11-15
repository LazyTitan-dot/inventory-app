import { useState } from 'react';
import { Package, CheckCircle2 } from 'lucide-react';
import { ProductImage } from '../components/ProductImage';
import type { Delivery, DeliveryItem, RetailData } from '../lib/contracts';
import { categoryName } from '../lib/format';

function readChecks(key: string): Record<string, boolean> {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(key) ?? '{}');
    if (value && typeof value === 'object' && !Array.isArray(value))
      return Object.fromEntries(Object.entries(value).filter(([, checked]) => checked === true));
  } catch { /* Optional device-local checklist still works without storage. */ }
  return {};
}

export function DeliveryItems({delivery, data}: {delivery: Delivery; data: RetailData}) {
  const items = data.delivery_items?.filter(item => item.delivery_id === delivery.id);
  const terminal = delivery.status === 'delivered' || delivery.status === 'cancelled';
  const version = items?.map(item => `${item.item_id}:${item.current_quantity}`).sort().join(',') ?? '';
  const storageKey = `sl:delivery-load:${data.profile.id}:${delivery.id}:${delivery.scheduled_at}:${version}`;
  return <DeliveryItemList key={storageKey} items={items} data={data} terminal={terminal} storageKey={storageKey}
    canCheck={['owner','admin','sales','inventory'].includes(data.profile.role) && (data.permissions.sell || data.permissions.purchase) && !terminal}/>;
}

function DeliveryItemList({items,data,terminal,storageKey,canCheck}: {
  items: DeliveryItem[] | undefined; data: RetailData; terminal: boolean; storageKey: string; canCheck: boolean;
}) {
  const [checks,setChecks] = useState<Record<string,boolean>>(() => readChecks(storageKey));
  const units = items?.reduce((sum,item)=>sum+(terminal?item.quantity:item.current_quantity),0) ?? 0;
  const loadable = items?.filter(item=>item.current_quantity>0) ?? [];
  const marked = loadable.filter(item=>checks[item.item_id]).reduce((sum,item)=>sum+item.current_quantity,0);
  function toggle(itemId: string, checked: boolean) {
    const next = {...checks,[itemId]:checked};
    setChecks(next);
    try { sessionStorage.setItem(storageKey,JSON.stringify(next)); } catch { /* optional persistence */ }
  }
  return <section className="delivery-items-card" aria-label="Artículos de la entrega">
    <div className="delivery-items-heading"><h3><Package size={21} aria-hidden="true"/> Artículos de la entrega</h3>{items && <span className="badge">{units} {units===1?'unidad':'unidades'}</span>}</div>
    <p className="delivery-items-caption">{terminal?'Mercancía original de la venta. No constituye un comprobante de cantidades efectivamente recibidas.':'Mercancía de la venta vinculada · cantidades vigentes, descontando devoluciones.'}</p>
    {items === undefined ? <p className="operations-callout">La lista de artículos no está disponible. Actualiza la información para consultarla.</p> :
     items.length === 0 ? <p className="operations-callout">No hay artículos registrados para esta entrega.</p> :
     <>
       <ul className="delivery-items-list">{items.map(item=>{
         const variant = data.variants.find(v=>v.id===item.variant_id);
         const product = variant && data.products.find(p=>p.id===variant.product_id);
         const title = [item.brand,item.model].filter(Boolean).join(' ') || categoryName(item.category) || 'Artículo';
         const quantity = terminal ? item.quantity : item.current_quantity;
         return <li className="delivery-item-row" key={item.item_id}>
           <ProductImage productId={product?.id ?? item.item_id} source={product?.images[0]} alt={`Imagen de ${title}`} className="delivery-item-image"/>
           <div className="delivery-item-description"><strong>{title}</strong><small>{[categoryName(item.category),item.name].filter(Boolean).join(' · ')}</small>{item.sku && <small>SKU: {item.sku}</small>}{item.returned_quantity>0 && <small>{item.returned_quantity} {item.returned_quantity===1?'unidad devuelta':'unidades devueltas'}</small>}</div>
           <div className="delivery-item-quantity"><strong>×{quantity}</strong><small>{!terminal && quantity===0?'No cargar':'Unid.'}</small></div>
           {canCheck && quantity>0 && <label className="delivery-load-check"><input type="checkbox" checked={Boolean(checks[item.item_id])} onChange={event=>toggle(item.item_id,event.target.checked)}/><span>Cargado <span className="sr-only">{title} {item.name} · {quantity} unidades</span></span></label>}
         </li>;
       })}</ul>
       {canCheck && loadable.length>0 && <div className="delivery-load-summary">
          <div><strong><CheckCircle2 size={17} aria-hidden="true"/> Checklist de carga</strong><span role="status">{marked} de {units} unidades marcadas</span></div>
          <progress value={marked} max={units} aria-label="Progreso de carga"/>
          <small>Opcional · marcas de esta pestaña y usuario; no cambian inventario ni estado de entrega.</small>
       </div>}
     </>}
  </section>;
}
