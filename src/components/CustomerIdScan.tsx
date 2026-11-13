import { useState } from 'react';
import { CustomerLiveScanner } from './CustomerLiveScanner';
import type {LiveIdentity} from '../lib/customerLiveIdentity';
import './barcode-scanner.css';
import { ScanLine } from 'lucide-react';
import type { CustomerScan, ScanMode } from '../lib/customerIdScanner';
export function CustomerIdScan({onApply,disabled}:{onApply:(scan:CustomerScan)=>void;disabled:boolean}) {
 const [open,setOpen]=useState(false);
 const [live,setLive]=useState(false);
 const [file,setFile]=useState<File|null>(null);
 const [mode,setMode]=useState<ScanMode>('auto');
 const [result,setResult]=useState<CustomerScan|null>(null);
 const [status,setStatus]=useState('');
 const [busy,setBusy]=useState(false);
 async function analyze(photo=file,scanMode=mode,identity?:LiveIdentity){
  if(!photo||busy)return;setBusy(true);setResult(null);setStatus(identity?'Cédula detectada. Leyendo dirección…':'Preparando imagen…');
  let base:CustomerScan|null=null;
  if(identity){base={ced:identity.ced.slice(0,3)+'-'+identity.ced.slice(3,10)+'-'+identity.ced.slice(10),first:identity.first,last:identity.last,full:identity.full,address:'',sector:'',municipio:'',sources:{ced:identity.source,full:identity.source},warning:''};}
  try{
    const {scanCustomerId}=await import('../lib/customerIdScanner');const r=await scanCustomerId(photo,scanMode,setStatus);
    if(base){
      // The verified live code always wins; reject very short OCR noise and a conflicting document ID.
      const conflict=!!r.ced&&r.ced.replace(/\D/g,'')!==identity!.ced;
      const validAddress=r.address.trim().length>=6&&/\p{L}{3}/u.test(r.address);
      if(!conflict){base={...r,...base,full:base.full||r.full,first:base.first||r.first,last:base.last||r.last,address:validAddress?r.address:'',sector:r.sector,municipio:r.municipio,sources:{...r.sources,...base.sources}};}
      base.warning=conflict||!base.address?'Identificación leída. Revisa o completa la dirección; puedes subir una foto original si no se reconoce.':'';
      setResult(base);setStatus(base.warning||'Cédula detectada. Revisa los datos antes de aplicarlos.');
    }else{setResult(r);setStatus(r.warning||'Lectura terminada. Revisa los datos antes de aplicarlos.');}
  }catch{if(base){setResult({...base,warning:'Completa los campos que faltan.'});setStatus('Identificación leída. No se pudo leer la dirección; complétala manualmente o sube una foto.');}
    else setStatus('No se pudo leer la foto. Intenta una imagen original, selecciona el formato o registra los datos manualmente.');}
  finally{setBusy(false);}
 }
 function reset(){setLive(false);setFile(null);setResult(null);setStatus('');setOpen(false);}
 function select(f:File|undefined){setFile(f??null);setResult(null);setStatus(f?'Imagen lista para analizar.':'');}
 return <section className="stack" aria-label="Escáner de cédula">
 <button type="button" className="button secondary" disabled={disabled||busy} onClick={()=>open?reset():setOpen(true)}><ScanLine size={18}/> {open?'Cerrar escáner':'Escanear cédula'}</button>
 {open&&<div className="stack"><p className="muted">Fotografía el reverso con autorización del cliente. La imagen se procesa en este dispositivo y no se guarda. Usa el frente si faltan los nombres.</p>
 {!live&&<button type="button" className="button primary" disabled={busy||disabled} onClick={()=>{setLive(true);setFile(null);setResult(null);setStatus("");}}><ScanLine size={17}/> Escanear en vivo</button>}
 {live&&<CustomerLiveScanner onClose={()=>setLive(false)} onCapture={(photo,id)=>{setLive(false);void analyze(photo,id.mode,id);}}/>}
 {!live&&<>
 <label>Seleccionar imagen<input type="file" accept="image/*" disabled={busy} onChange={e=>select(e.target.files?.[0])}/></label>
 <label>Formato<select value={mode} disabled={busy} onChange={e=>setMode(e.target.value as ScanMode)}><option value="auto">Automático</option><option value="new">Nueva cédula</option><option value="old">Cédula anterior</option><option value="front">Frente</option><option value="combined">Frente y reverso</option></select></label>
 <button type="button" className="button primary" disabled={!file||busy||disabled} onClick={()=>void analyze(file,mode)}>{busy?'Analizando…':'Analizar fotografía'}</button></>}
 <p role="status" className="muted">{status}</p>
 {result&&<div className="stack"><label>Cédula<input value={result.ced} onChange={e=>setResult({...result,ced:e.target.value})}/></label><label>Nombre completo<input value={result.full} onChange={e=>setResult({...result,full:e.target.value})}/></label><label>Dirección de residencia<textarea rows={3} value={result.address} onChange={e=>setResult({...result,address:e.target.value})}/></label><label>Sector<input value={result.sector} onChange={e=>setResult({...result,sector:e.target.value})}/></label><label>Municipio<input value={result.municipio} onChange={e=>setResult({...result,municipio:e.target.value})}/></label><p className="muted">Comprueba números de edificio y apartamento. La dirección de entrega puede ser distinta. Si faltan nombres, completa el formulario manualmente.</p><button type="button" className="button primary" disabled={disabled||busy} onClick={()=>{onApply(result);reset();}}>Aplicar datos al formulario</button></div>}
 </div>}
 </section>;
}
