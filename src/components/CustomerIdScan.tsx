import { useState } from 'react';
import { ScanLine } from 'lucide-react';
import type { CustomerScan, ScanMode } from '../lib/customerIdScanner';
export function CustomerIdScan({onApply,disabled}:{onApply:(scan:CustomerScan)=>void;disabled:boolean}) {
 const [open,setOpen]=useState(false);
 const [file,setFile]=useState<File|null>(null);
 const [mode,setMode]=useState<ScanMode>('auto');
 const [result,setResult]=useState<CustomerScan|null>(null);
 const [status,setStatus]=useState('');
 const [busy,setBusy]=useState(false);
 async function analyze(){
  if(!file||busy)return;setBusy(true);setResult(null);setStatus('Preparando imagen…');
  try{const {scanCustomerId}=await import('../lib/customerIdScanner');const r=await scanCustomerId(file,mode,setStatus);setResult(r);setStatus(r.warning||'Lectura terminada. Revisa los datos antes de aplicarlos.');}
  catch{setStatus('No se pudo leer la foto. Intenta una imagen original, selecciona el formato o registra los datos manualmente.');}
  finally{setBusy(false);}
 }
 function reset(){setFile(null);setResult(null);setStatus('');setOpen(false);}
 function select(f:File|undefined){setFile(f??null);setResult(null);setStatus(f?'Imagen lista para analizar.':'');}
 return <section className="stack" aria-label="Escáner de cédula">
 <button type="button" className="button secondary" disabled={disabled||busy} onClick={()=>open?reset():setOpen(true)}><ScanLine size={18}/> {open?'Cerrar escáner':'Escanear cédula'}</button>
 {open&&<div className="stack"><p className="muted">Fotografía el reverso con autorización del cliente. La imagen se procesa en este dispositivo y no se guarda. Usa el frente si faltan los nombres.</p>
 <label>Tomar foto<input type="file" accept="image/*" capture="environment" disabled={busy} onChange={e=>select(e.target.files?.[0])}/></label>
 <label>Seleccionar imagen<input type="file" accept="image/*" disabled={busy} onChange={e=>select(e.target.files?.[0])}/></label>
 <label>Formato<select value={mode} disabled={busy} onChange={e=>setMode(e.target.value as ScanMode)}><option value="auto">Automático</option><option value="new">Nueva cédula</option><option value="old">Cédula anterior</option><option value="front">Frente</option><option value="combined">Frente y reverso</option></select></label>
 <button type="button" className="button primary" disabled={!file||busy||disabled} onClick={()=>void analyze()}>{busy?'Analizando…':'Analizar fotografía'}</button>
 <p role="status" className="muted">{status}</p>
 {result&&<div className="stack"><label>Cédula<input value={result.ced} onChange={e=>setResult({...result,ced:e.target.value})}/></label><label>Nombre completo<input value={result.full} onChange={e=>setResult({...result,full:e.target.value})}/></label><label>Dirección de residencia<textarea rows={3} value={result.address} onChange={e=>setResult({...result,address:e.target.value})}/></label><label>Sector<input value={result.sector} onChange={e=>setResult({...result,sector:e.target.value})}/></label><label>Municipio<input value={result.municipio} onChange={e=>setResult({...result,municipio:e.target.value})}/></label><p className="muted">Comprueba números de edificio y apartamento. La dirección de entrega puede ser distinta. Si faltan nombres, completa el formulario manualmente.</p><button type="button" className="button primary" disabled={disabled||busy} onClick={()=>{onApply(result);reset();}}>Aplicar datos al formulario</button></div>}
 </div>}
 </section>;
}
