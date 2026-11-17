import { useEffect, useMemo, useState } from 'react';
import { Check, ScanLine, Search, ShieldCheck } from 'lucide-react';
import { BarcodeScanner } from './BarcodeScanner';
import { supabase } from '../lib/supabase';
import './serial-sale-picker.css';

export type SaleSerialLink = {
 id: string; sale_id: string; item_id: string; variant_id: string;
 serial_id: string; serial: string; sold_at: string; returned_at: string | null;
 return_id: string | null; return_condition: string | null;
};
type SaleCandidate = { id: string; serial: string };
type Candidates = { variant_id: string; total: number; serials: SaleCandidate[] };

export function useSaleSerials(saleId: string | null, enabled = true) {
 const [result, setResult] = useState<{ saleId: string; rows: SaleSerialLink[]; error: string } | null>(null);
 useEffect(() => {
   if (!saleId || !enabled) return;
   let alive = true;
   void (async () => {
     if (!supabase) { if (alive) setResult({saleId,rows:[],error:'Conexión no disponible.'}); return; }
     const response = await supabase.rpc('retail_sale_serials',{p_sale_id:saleId});
     if (alive) setResult({saleId,rows:(response.data as SaleSerialLink[]) ?? [],error:response.error?.message ?? ''});
   })();
   return () => {alive = false;};
 },[saleId,enabled]);
 return {
  rows: enabled && saleId && result?.saleId === saleId ? result.rows : [] as SaleSerialLink[],
  loading: Boolean(enabled && saleId && result?.saleId !== saleId),
  error: enabled && saleId && result?.saleId === saleId ? result.error : '',
 };
}

export function SaleSerialPicker({
 variantId, quantity, selected, onChange, disabled=false,
}: {
 variantId:string; quantity:number; selected:string[];
 onChange:(ids:string[])=>void; disabled?:boolean;
}) {
 const [lookup,setLookup] = useState('');
 const [result,setResult] = useState<Candidates|null>(null);
 const [known,setKnown] = useState<Record<string,string>>({});
 const [error,setError] = useState('');
 const [scanner,setScanner] = useState(false);
 const [scanBusy,setScanBusy] = useState(false);
 const liveResult=useMemo(() => result?.variant_id===variantId ? result : null,[result,variantId]);
 useEffect(()=>{
  let alive=true;
  void(async()=>{
   if(!supabase){if(alive)setError('No hay conexión con el inventario.');return;}
   const response=await supabase.rpc('retail_available_sale_serials',
     {p_variant_id:variantId,p_search:lookup,p_offset:0});
   if(!alive)return;
   if(response.error){setError(response.error.message);return;}
   const next=response.data as Candidates;
   setResult(next);
   setKnown(previous=>({...previous,...Object.fromEntries(next.serials.map(s=>[s.id,s.serial]))}));
   setError('');
  })();
  return()=>{alive=false;};
 },[variantId,lookup]);
 const choices=liveResult?.serials??[];
 function toggle(s:SaleCandidate){
  if(disabled)return;
  if(selected.includes(s.id)){onChange(selected.filter(id=>id!==s.id));return;}
  if(selected.length>=quantity){setError('Ya elegiste una serie por cada unidad de la venta.');return;}
  setKnown(prev=>({...prev,[s.id]:s.serial}));
  onChange([...selected,s.id]);setError('');
 }
 async function scan(raw:string){
  setScanner(false);
  setScanBusy(true);setError('');
  try{
   if(!supabase)throw new Error('No hay conexión.');
   const code=raw.trim();
   const response=await supabase.rpc('retail_available_sale_serials',
     {p_variant_id:variantId,p_search:code,p_offset:0});
   if(response.error)throw response.error;
   const match=(response.data as Candidates).serials.find(
      s=>s.serial.localeCompare(code,undefined,{sensitivity:'accent'})===0);
   if(!match){setError('Esta serie no está registrada como disponible en esta variante. Revísala en Inventario.');return;}
   toggle(match);
   setLookup('');
  }catch(cause){setError(cause instanceof Error?cause.message:'No se pudo verificar la serie.');}
  finally{setScanBusy(false);}
 }
 return <section className="serial-sale-selector" aria-label="Identificación individual de las unidades">
  <div className="serial-sale-header"><ShieldCheck size={18} aria-hidden="true"/><div>
   <strong>Identificar unidades</strong>
   <small>{selected.length} de {quantity} seleccionadas · Opcional para unidades sin serie</small>
  </div></div>
  <div className="serial-sale-selected" aria-label="Series seleccionadas">
   {selected.map(id=><button type="button" className="serial-sale-chip" key={id} disabled={disabled} onClick={()=>onChange(selected.filter(x=>x!==id))}>
    <Check size={14} aria-hidden="true"/>{known[id]||id} <span aria-hidden="true">×</span>
   </button>)}
  </div>
  <div className="serial-sale-tools">
   <label className="serial-sale-search"><Search size={16}/><span className="sr-only">Buscar serie disponible</span>
     <input value={lookup} disabled={disabled} placeholder="Buscar serie…" onChange={e=>setLookup(e.target.value)}/>
   </label>
   <button type="button" className="button secondary" disabled={disabled||scanBusy} onClick={()=>setScanner(true)}>
    <ScanLine size={17} aria-hidden="true"/> Escanear
   </button>
  </div>
  {liveResult && liveResult.total>200 && <small className="serial-sale-note">Mostrando 200 series. Utiliza el buscador o la cámara para localizar otras.</small>}
  {choices.length>0 ? <div className="serial-sale-options">
    {choices.slice(0,20).map(s=><button type="button" key={s.id}
       className={'serial-sale-option'+(selected.includes(s.id)?' selected':'')}
       disabled={disabled||(!selected.includes(s.id)&&selected.length>=quantity)}
       aria-pressed={selected.includes(s.id)} onClick={()=>toggle(s)}>
       <span>{s.serial}</span>{selected.includes(s.id)?<Check size={17}/>:<span className="serial-sale-circle"/>}
     </button>)}
   </div> : <p className="serial-sale-note">No hay series disponibles con ese filtro. La venta puede continuar sin identificación individual.</p>}
  {error&&<p className="serial-sale-error" role="alert">{error}</p>}
  {scanner&&<BarcodeScanner title="Escanear serie para la venta"
     onDetected={value=>void scan(value)} onClose={()=>setScanner(false)}/>}
 </section>;
}

export function ReturnSerialPicker({
 links, quantity, selected, onChange, disabled=false,
}:{
 links:SaleSerialLink[]; quantity:number; selected:string[];
 onChange:(ids:string[])=>void;disabled?:boolean;
}){
 const remaining=links.filter(x=>!x.returned_at);
 const [scanner,setScanner] = useState(false);
 const [error,setError]=useState('');
 function toggle(id:string) {
  if(selected.includes(id))onChange(selected.filter(x=>x!==id));
  else if(selected.length<quantity)onChange([...selected,id]);
  else setError('Seleccionaste tantas series como unidades a devolver.');
 }
 function scanned(code:string) {
  setScanner(false);
  const x=remaining.find(s=>s.serial.toLowerCase()===code.trim().toLowerCase());
  if(!x){setError('La serie escaneada no corresponde a una unidad vendida y pendiente de devolución.');return;}
  toggle(x.serial_id);setError('');
 }
 if(!remaining.length)return null;
 return <section className="serial-sale-selector" aria-label="Identificar las unidades devueltas">
   <div className="serial-sale-header"><ShieldCheck size={18}/><div><strong>Series de esta venta</strong>
    <small>Indica qué unidad física regresa · {selected.length} de {quantity} seleccionadas</small>
   </div></div>
   <div className="serial-sale-options">
    {remaining.map(s=><button type="button" className={'serial-sale-option'+(selected.includes(s.serial_id)?' selected':'')}
     key={s.id} disabled={disabled||(!selected.includes(s.serial_id)&&selected.length>=quantity)}
     aria-pressed={selected.includes(s.serial_id)} onClick={()=>toggle(s.serial_id)}>
      <span>{s.serial}</span>{selected.includes(s.serial_id)?<Check size={17}/>:<span className="serial-sale-circle"/>}
    </button>)}
   </div>
   <button type="button" className="button secondary" disabled={disabled} onClick={()=>setScanner(true)}><ScanLine size={16}/> Escanear serie devuelta</button>
   {error&&<p className="serial-sale-error" role="alert">{error}</p>}
   {scanner&&<BarcodeScanner title="Serie de unidad devuelta" onDetected={scanned} onClose={()=>setScanner(false)}/>}
 </section>;
}
