import { useState } from 'react';
import {readPaddleAddress} from '../lib/customerPaddleClient';
import { CustomerLiveScanner } from './CustomerLiveScanner';
import {usableLiveAddress,usablePlace} from '../lib/customerLiveQuality';
import type {LiveIdentity} from '../lib/customerLiveIdentity';
import './barcode-scanner.css';
import { ScanLine } from 'lucide-react';
import type { CustomerScan, ScanMode } from '../lib/customerIdScanner';
export function CustomerIdScan({onApply,disabled}:{onApply:(scan:CustomerScan)=>void;disabled:boolean}) {
 const [open,setOpen]=useState(false);
 const [live,setLive]=useState(false);
 const [liveIdentity,setLiveIdentity]=useState<LiveIdentity|null>(null);
 const [file,setFile]=useState<File|null>(null);
 const [mode,setMode]=useState<ScanMode>('auto');
 const [result,setResult]=useState<CustomerScan|null>(null);
 const [status,setStatus]=useState('');
 const [busy,setBusy]=useState(false);
 async function analyze(photo:File|null=file,scanMode=mode,identity?:LiveIdentity,fromUpload=false){
  if(busy||(!photo&&!identity))return;
  let base:CustomerScan|null=null;
  if(identity){base={ced:identity.ced.slice(0,3)+'-'+identity.ced.slice(3,10)+'-'+identity.ced.slice(10),first:identity.first,last:identity.last,full:identity.full,address:'',sector:'',municipio:'',sources:{ced:identity.source,full:identity.source},warning:''};}
  if(!photo&&base){setResult(base);setStatus('Identificación leída. Sube una foto del mismo reverso para completar la dirección o escríbela.');return;}
  if(!photo)return;
  setBusy(true);setResult(null);setStatus(identity?'Cédula detectada. Leyendo dirección…':'Preparando imagen…');
  try{
    if(base&&!fromUpload){const addr=await readPaddleAddress(photo,setStatus);setResult({...base,...addr});setStatus(addr.warning||'Dirección leída. Confirma los datos antes de aplicarlos.');return;}
    const {scanCustomerId}=await import('../lib/customerIdScanner');const r=await scanCustomerId(photo,scanMode,setStatus,"upload");
    if(base){
      const conflict=!!r.ced&&r.ced.replace(/\D/g,'')!==identity!.ced;
      const same=!conflict&&(!fromUpload||!!r.ced);
      const t=r.address.trim();
      const validAddress=usableLiveAddress(t,r.sector,r.municipio);
      if(same){base={...r,...base,full:base.full||r.full,first:base.first||r.first,last:base.last||r.last,address:validAddress?t:'',sector:usablePlace(r.sector)?r.sector:'',municipio:usablePlace(r.municipio)?r.municipio:'',sources:{...r.sources,...base.sources}};}
      base.warning=!same?'La foto no pudo confirmarse como la misma cédula. Conservamos la identificación; selecciona el reverso correcto.':!base.address?'Identificación leída. No pudimos leer la dirección con suficiente calidad. Sube una foto original del reverso o complétala manualmente.':'';
      setResult(base);setStatus(base.warning||'Cédula detectada. Confirma la dirección y los datos antes de aplicarlos.');
    }else{setResult(r);setStatus(r.warning||'Lectura terminada. Revisa los datos antes de aplicarlos.');}
  }catch{if(base){setResult({...base,warning:'Completa los campos que faltan.'});setStatus('Identificación leída. No se pudo leer la dirección; complétala manualmente o sube una foto.');}
    else setStatus('No se pudo leer la foto. Intenta una imagen original, selecciona el formato o registra los datos manualmente.');}
  finally{setBusy(false);}
 }
 function reset(){setLive(false);setLiveIdentity(null);setFile(null);setResult(null);setStatus('');setOpen(false);}
 function select(f:File|undefined){setFile(f??null);if(!liveIdentity)setResult(null);setStatus(f?'Imagen lista para analizar.':'');}
 return <section className="stack" aria-label="Escáner de cédula">
 <button type="button" className="button secondary" disabled={disabled||busy} onClick={()=>open?reset():setOpen(true)}><ScanLine size={18}/> {open?'Cerrar escáner':'Escanear cédula'}</button>
 {open&&<div className="stack"><p className="muted">Fotografía el reverso con autorización del cliente. La imagen se procesa en este dispositivo y no se guarda. Usa el frente si faltan los nombres.</p>
 {!live&&<button type="button" className="button primary" disabled={busy||disabled} onClick={()=>{setLive(true);setLiveIdentity(null);setFile(null);setResult(null);setStatus("");}}><ScanLine size={17}/> Escanear en vivo</button>}
 {live&&<CustomerLiveScanner initialIdentity={liveIdentity} onClose={()=>setLive(false)} onCapture={(photo,id)=>{setLive(false);setLiveIdentity(id);void analyze(photo,id.mode,id);}}/>}
 {!live&&<>
 <label>{liveIdentity?"Subir foto del reverso (misma cédula)":"Seleccionar imagen"}<input type="file" accept="image/*" disabled={busy} onChange={e=>select(e.target.files?.[0])}/></label>
 <label>Formato<select value={mode} disabled={busy} onChange={e=>setMode(e.target.value as ScanMode)}><option value="auto">Automático</option><option value="new">Nueva cédula</option><option value="old">Cédula anterior</option><option value="front">Frente</option><option value="combined">Frente y reverso</option></select></label>
 <button type="button" className="button primary" disabled={!file||busy||disabled} onClick={()=>void analyze(file,mode,liveIdentity??undefined,!!liveIdentity)}>{busy?'Analizando…':'Analizar fotografía'}</button></>}
 <p role="status" className="muted">{status}</p>
 {result&&!live&&<div className="stack">{liveIdentity&&<button type="button" className="button secondary" disabled={busy} onClick={()=>setLive(true)}>Repetir solo dirección</button>}<label>Cédula<input value={result.ced} onChange={e=>setResult({...result,ced:e.target.value})}/></label><label>Nombre completo<input value={result.full} onChange={e=>setResult({...result,full:e.target.value})}/></label><label>Dirección de residencia<textarea rows={3} value={result.address} onChange={e=>setResult({...result,address:e.target.value})}/></label><label>Sector<input value={result.sector} onChange={e=>setResult({...result,sector:e.target.value})}/></label><label>Municipio<input value={result.municipio} onChange={e=>setResult({...result,municipio:e.target.value})}/></label><p className="muted">Comprueba números de edificio y apartamento. La dirección de entrega puede ser distinta. Si faltan nombres, completa el formulario manualmente.</p><button type="button" className="button primary" disabled={disabled||busy} onClick={()=>{onApply(result);reset();}}>Aplicar datos al formulario</button></div>}
 </div>}
 </section>;
}
