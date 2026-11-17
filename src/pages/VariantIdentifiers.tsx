import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Barcode, Camera, CheckCircle2, History, Keyboard, Pencil, ScanLine, Trash2 } from 'lucide-react';
import { BarcodeScanner } from '../components/BarcodeScanner';
import { ErrorNotice, Field, Modal } from '../components/ui';
import { supabase } from '../lib/supabase';
import type { Variant } from '../lib/contracts';
import { useOperation } from '../state/useOperation';
import { useRetail } from '../state/useRetail';
import { dateTime } from '../lib/format';
import { serialCandidates } from '../lib/serials';
import { generateInternalBarcode, getVariantBarcodes } from '../lib/barcode';
import './variant-identifiers.css';

type Source = 'manual' | 'barcode' | 'qr' | 'ocr' | 'usb';
type CodeKind = 'internal' | 'manufacturer' | 'unclassified';
type SerialRow = { id: string; variant_id: string; serial: string; source: Source; created_at: string; updated_at: string };
type CodeRow = { code: string; kind: CodeKind; primary: boolean };
type BarcodeHistory = { id: number; previous_codes: {primary?: string|null; additional?: string[]}; current_codes: {primary?: string|null; additional?: string[]}; changed_at: string };
type Snapshot = {
 variant_id: string; available: number; identified: number; pending: number; reconciliation: number;
 total_matching: number; serials: SerialRow[]; codes: CodeRow[]; barcode_history: BarcodeHistory[];
};
type SerialEvent = { event: string; previous_serial: string|null; current_serial: string|null; reason: string; created_at: string };
const KIND_LABELS: Record<CodeKind,string> = { internal:'Interno S-mart Living',manufacturer:'Fabricante',unclassified:'Sin clasificar' };
const clean = (s:string) => s.trim();
const readError = (reason: unknown) => reason instanceof Error ? reason.message : String(reason);
const PAGE_SIZE = 50;

/** An additive, on-demand view: absent feature flags keep older installations unchanged. */
export function VariantIdentifiers({ variant, onClose }: { variant: Variant; onClose: () => void }) {
 const { data, notify } = useRetail();
 const { run, busy, error: commandError, clearError } = useOperation();
 const [tab,setTab] = useState<'serials'|'codes'>('serials');
 const [snapshot,setSnapshot] = useState<Snapshot|null>(null);
 const [loading,setLoading] = useState(true);
 const [error,setError] = useState('');
 const [query,setQuery] = useState('');
 const [offset,setOffset] = useState(0);
 const [serial,setSerial] = useState('');
 const [source,setSource] = useState<Source>('manual');
 const [scanner,setScanner] = useState<'serial'|'barcode'|null>(null);
 const [captureNotice,setCaptureNotice] = useState('');
 const audio = useRef<AudioContext|null>(null);
 const [editing,setEditing] = useState<SerialRow|null>(null);
 const [reason,setReason] = useState('');
 const [historyId,setHistoryId] = useState<string|null>(null);
 const [events,setEvents] = useState<SerialEvent[]|null>(null);
 const [ocrBusy,setOcrBusy] = useState(false);
 const [ocrText,setOcrText] = useState('');
 const [ocrCandidates,setOcrCandidates] = useState<string[]>([]);
 const [newCode,setNewCode] = useState('');
 const [kind,setKind] = useState<CodeKind>('manufacturer');
 const [makePrimary,setMakePrimary] = useState(false);
 const [replacing,setReplacing] = useState<string|null>(null);
 const [confirmRemove,setConfirmRemove] = useState<string|null>(null);

 const load = useCallback(async () => {
   if (!supabase) { setError('No hay conexión configurada.');setLoading(false);return; }
   setLoading(true);
   const response = await supabase.rpc('retail_identifiers', { p_variant_id:variant.id,p_search:query,p_offset:offset });
   if (response.error) setError(response.error.message);
   else { setSnapshot(response.data as Snapshot); setError(''); }
   setLoading(false);
 },[variant.id,query,offset]);
 useEffect(() => { let alive=true; void (async()=>{
    if (!supabase) { if(alive) {setError('No hay conexión configurada.');setLoading(false);}return; }
    const response=await supabase.rpc('retail_identifiers',{p_variant_id:variant.id,p_search:query,p_offset:offset});
    if (!alive) return;
    if(response.error) setError(response.error.message);
    else {setSnapshot(response.data as Snapshot);setError('');}
    setLoading(false);
 })();return ()=>{alive=false;}; },[variant.id,query,offset]);

 async function saveSerial(event: FormEvent) {
   event.preventDefault();
   const value=clean(serial);
   if (!value || value.length>160) {setError('La serie debe tener entre 1 y 160 caracteres.');return;}
   if (editing && reason.trim().length<5) {setError('Explica la corrección en al menos cinco caracteres.');return;}
   try {
     await run(editing?'correct_unit_serial':'add_unit_serial',{
       variant_id:variant.id,serial:value,
       ...(editing?{serial_id:editing.id,expected_updated_at:editing.updated_at,reason:reason.trim()}:{source})
     });
     setSerial('');setEditing(null);setReason('');setSource('manual');setOcrText('');setOcrCandidates([]);
     notify(editing?'Número de serie corregido. Se conservó el historial.':'Número de serie registrado sin alterar las existencias.');
     await load();
   } catch { /* useOperation retains actionable error */ }
 }
 async function removeSerial() {
   if (!editing || reason.trim().length<5) {setError('Escribe un motivo de al menos cinco caracteres.');return;}
   try {
     await run('remove_unit_serial',{variant_id:variant.id,serial_id:editing.id,
       expected_updated_at:editing.updated_at,reason:reason.trim()});
     setEditing(null);setSerial('');setReason('');
     notify('Serie desvinculada. El historial permanece disponible.');
     await load();
   } catch { /* show command error */ }
 }
 async function showHistory(id: string) {
   setHistoryId(id);setEvents(null);
   if (!supabase) return;
   const response=await supabase.rpc('retail_serial_history',{p_serial_id:id});
   if (response.error) setError(response.error.message);
   else setEvents(response.data as SerialEvent[]);
 }
 async function readPhoto(event:ChangeEvent<HTMLInputElement>) {
   const file=event.target.files?.[0];event.target.value='';
   if(!file)return;
   const controller=new AbortController();
   setOcrBusy(true);setError('');
   try {
     const { readSerialTextPhoto }=await import('../lib/labelOcr');
     const recognized=await readSerialTextPhoto(file,{signal:controller.signal});
     const options=serialCandidates(recognized);
     setOcrText(recognized);setOcrCandidates(options);
     if(options.length===1){setSerial(options[0]!);setSource('ocr');}
     else setError('Revisa el texto reconocido y selecciona o escribe la serie correcta.');
   }catch(cause){setError(readError(cause));}
   finally{setOcrBusy(false);}
 }
 async function manageCode(mode:'add'|'replace'|'remove'|'set_primary'|'set_kind',code:string,previousCode?:string,codeKind:CodeKind=kind) {
   try {
     await run('manage_variant_barcode',{
       variant_id:variant.id,mode,code:clean(code),kind:codeKind,
       ...(previousCode?{previous_code:previousCode}:{}),
       ...(mode==='add'?{make_primary:makePrimary}:{})
     });
     setNewCode('');setReplacing(null);setConfirmRemove(null);setMakePrimary(false);
     notify('Códigos actualizados. Las existencias y las operaciones anteriores no cambian.');
     await load();
   }catch{ /* operation notice */ }
 }
 function unlockAudio() {
   try {
     audio.current ??= new window.AudioContext();
     void audio.current.resume();
   } catch { /* Camera and keyboard remain usable without sound. */ }
 }
 function playCaptureSound() {
   const context=audio.current;
   if (!context || context.state!=='running') return;
   const note=context.createOscillator(),gain=context.createGain();
   note.type='sine';note.frequency.value=880;
   gain.gain.setValueAtTime(.0001,context.currentTime);
   gain.gain.exponentialRampToValueAtTime(.12,context.currentTime+.015);
   gain.gain.exponentialRampToValueAtTime(.0001,context.currentTime+.17);
   note.connect(gain);gain.connect(context.destination);
   note.start();note.stop(context.currentTime+.18);
 }
 function chooseScan(value:string) {
   if(scanner==='serial'){setSerial(clean(value));setSource('barcode');}
   else setNewCode(clean(value));
   setCaptureNotice('Código capturado. Revisa y confirma antes de guardar.');
   playCaptureSound();
   setScanner(null);
 }
 const canManage=data.permissions.manage_catalog;
 const totalPages=Math.max(1,Math.ceil((snapshot?.total_matching??0)/PAGE_SIZE));
 const currentPage=Math.floor(offset/PAGE_SIZE)+1;
 return (
  <Modal title={'Identificación · '+variant.sku} onClose={()=>{if(!busy&&!ocrBusy)onClose();}} variant="drawer" className="sl-identifiers sl-refined-theme">
   <div className="sl-identifiers-content stack">
    <div className="sl-identifiers-tabs" role="group" aria-label="Tipo de identificación">
     <button type="button" aria-pressed={tab==='serials'} onClick={()=>{setTab('serials');clearError();}}><ScanLine size={17}/> Números de serie</button>
     <button type="button" aria-pressed={tab==='codes'} onClick={()=>{setTab('codes');clearError();}}><Barcode size={17}/> Códigos de barras</button>
    </div>
    {captureNotice&&<p className="sl-identifiers-help" role="status">{captureNotice}</p>}
    {tab==='serials' ? <>
     <div className="sl-identifiers-stats" aria-label="Identificación progresiva">
      <div><span>Disponibles</span><strong>{snapshot?.available??'—'}</strong></div>
      <div><span>Identificadas</span><strong>{snapshot?.identified??'—'}</strong></div>
      <div><span>Pendientes</span><strong>{snapshot?.pending??'—'}</strong></div>
     </div>
     <div className="sl-identifiers-progress" role="progressbar" aria-label="Unidades identificadas" aria-valuemin={0} aria-valuemax={Math.max(snapshot?.available??1,1)} aria-valuenow={Math.min(snapshot?.identified??0,Math.max(snapshot?.available??1,1))}>
      <span style={{width: Math.min(100,Math.round(100*(snapshot?.identified??0)/Math.max(1,snapshot?.available??1)))+'%'}}/>
     </div>
     <p className="sl-identifiers-help">{snapshot?.identified??0} de {snapshot?.available??0} unidades identificadas. Puedes continuar otro día.</p>
     {Boolean(snapshot?.reconciliation) && <div className="sl-identifiers-warning" role="status">
       <strong>Conciliación pendiente: {snapshot?.reconciliation} unidad(es)</strong>
       <p>Hay más series activas que existencias disponibles. Revisa las últimas ventas y ajustes para decidir cuáles desvincular. No se selecciona ninguna automáticamente.</p>
      </div>}
     {canManage && <form className="stack sl-identifiers-editor" onSubmit={saveSerial}>
      <strong>{editing?'Corregir identificación':'Registrar una unidad'}</strong>
      <Field label="Número de serie"><input autoComplete="off" autoCapitalize="off" spellCheck={false}
        maxLength={160} value={serial} onChange={e=>{setSerial(e.target.value);if(!editing)setSource('manual');}} placeholder="S/N del fabricante" /></Field>
      <div className="sl-identifiers-actions">
       <button className="button secondary" type="button" disabled={busy||ocrBusy} onClick={()=>setScanner('serial')}><ScanLine size={16}/> Escanear código / QR</button>
       <label className="button secondary sl-identifiers-photo"><Camera size={16}/> {ocrBusy?'Reconociendo…':'Leer texto (OCR)'}
        <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={busy||ocrBusy} onChange={e=>void readPhoto(e)}/>
       </label>
      </div>
      {ocrCandidates.length>0 && <Field label="Posibles series detectadas"><select value={ocrCandidates.includes(serial)?serial:''} onChange={e=>{setSerial(e.target.value);setSource('ocr');}}>
       <option value="">Selecciona y confirma el resultado</option>
       {ocrCandidates.map(c=><option key={c} value={c}>{c}</option>)}
      </select></Field>}
      {ocrText && <details className="sl-identifiers-ocr-review"><summary>Revisar texto leído por OCR</summary><pre>{ocrText.slice(0,4000)}</pre></details>}
      {editing && <>
       <Field label="Motivo de la corrección o desvinculación"><textarea value={reason} minLength={5} maxLength={500} onChange={e=>setReason(e.target.value)} placeholder="Describe qué se corrigió y por qué." /></Field>
       <div className="sl-identifiers-actions">
        <button type="button" className="button secondary" disabled={busy} onClick={()=>{setEditing(null);setSerial('');setReason('');}}>Cancelar edición</button>
        <button type="button" className="button secondary danger-text" disabled={busy||reason.trim().length<5} onClick={()=>void removeSerial()}><Trash2 size={16}/> Desvincular con motivo</button>
       </div>
      </>}
      <button type="submit" className="button primary" disabled={busy||ocrBusy||!clean(serial)||(!editing&&!!snapshot&&!snapshot.pending)}>
       <CheckCircle2 size={17}/> {busy?'Guardando…':editing?'Guardar corrección':'Guardar número de serie'}
      </button>
      {!editing&&<small className="muted">El registro nunca aumenta ni disminuye el stock. Confirma la lectura antes de guardar.</small>}
     </form>}
     <div className="sl-identifiers-list-head"><strong>Unidades identificadas</strong><span>{snapshot?.identified??0} registros activos</span></div>
     <Field label="Buscar número de serie"><input value={query} onChange={e=>{setQuery(e.target.value);setOffset(0);}} placeholder="Buscar serie…" /></Field>
     {loading && <p role="status" className="muted">Consultando identificaciones…</p>}
     {!loading && !snapshot?.serials.length && <p className="muted">No encontramos series con ese filtro.</p>}
     <div className="sl-identifiers-list">
      {snapshot?.serials.map(s=><article key={s.id} className="sl-identifiers-item">
       <div><strong>{s.serial}</strong><small>{dateTime(s.created_at)} · {s.source.toUpperCase()}</small></div>
       <div className="sl-identifiers-actions">
        <button type="button" className="icon-button" aria-label={'Ver historial de '+s.serial} onClick={()=>void showHistory(s.id)}><History size={17}/></button>
        {canManage&&<button type="button" className="icon-button" aria-label={'Corregir serie '+s.serial} onClick={()=>{setEditing(s);setSerial(s.serial);setReason('');setOcrText('');clearError();}}><Pencil size={17}/></button>}
       </div>
      </article>)}
     </div>
     {totalPages>1&&<div className="sl-identifiers-pagination"><button className="button secondary" disabled={!offset} onClick={()=>setOffset(Math.max(0,offset-PAGE_SIZE))}>Anterior</button><span>Página {currentPage} de {totalPages}</span><button className="button secondary" disabled={currentPage>=totalPages} onClick={()=>setOffset(offset+PAGE_SIZE)}>Siguiente</button></div>}
     {historyId && <div className="sl-identifiers-history" role="region" aria-label="Historial del número de serie">
      <div className="sl-identifiers-list-head"><strong>Historial de cambios</strong><button type="button" className="button secondary" onClick={()=>{setHistoryId(null);setEvents(null);}}>Cerrar</button></div>
      {events===null?<p className="muted">Consultando historial…</p>:events.map((e,i)=><p key={i}><strong>{e.event}</strong> · {dateTime(e.created_at)} · {e.previous_serial||'—'} → {e.current_serial||'—'} {e.reason&&<small>{e.reason}</small>}</p>)}
     </div>}
    </> : <>
     <p className="sl-identifiers-help">Un código de producto identifica la variante. Los números de serie identifican unidades individuales y no se registran aquí.</p>
     {canManage&&<div className="sl-identifiers-editor stack">
      <strong>{replacing?'Reemplazar código':'Añadir código de barras'}</strong>
      {replacing && <p>Reemplazando <code>{replacing}</code>. El historial se conservará.</p>}
      <Field label="Código de barras"><input autoComplete="off" spellCheck={false} autoCapitalize="off" maxLength={80} value={newCode} onChange={e=>setNewCode(e.target.value)} placeholder="Introduce o escanea el código" /></Field>
      <div className="sl-identifiers-actions"><button type="button" className="button secondary" disabled={busy} onClick={()=>setScanner('barcode')}><ScanLine size={16}/> Escanear código</button>
       <button type="button" className="button secondary" disabled={busy} onClick={()=>{
         try { setNewCode(generateInternalBarcode(variant.id,data.variants.flatMap(getVariantBarcodes)));setKind('internal');setCaptureNotice('Código interno generado. Revisa y confirma antes de guardar.'); }
         catch (cause) { setError(readError(cause)); }
       }}><Barcode size={16}/> Generar código interno</button></div>
      <Field label="Tipo de código"><select value={kind} onChange={e=>setKind(e.target.value as CodeKind)}>
       <option value="manufacturer">Código del fabricante</option><option value="internal">Código interno</option>
      </select></Field>
      {!replacing&&<label className="sl-identifiers-checkbox"><input type="checkbox" checked={makePrimary} onChange={e=>setMakePrimary(e.target.checked)}/> Establecer como código principal</label>}
      <div className="sl-identifiers-actions">
       {replacing&&<button type="button" className="button secondary" onClick={()=>{setReplacing(null);setNewCode('');}}>Cancelar reemplazo</button>}
       <button type="button" className="button primary" disabled={busy||!clean(newCode)} onClick={()=>void manageCode(replacing?'replace':'add',newCode,replacing||undefined)}>{busy?'Guardando…':replacing?'Confirmar reemplazo':'Añadir código'}</button>
      </div>
     </div>}
     <div className="sl-identifiers-list-head"><strong>Códigos asociados a la variante</strong><span>{snapshot?.codes.length??0}</span></div>
     {!loading&&!snapshot?.codes.length&&<p className="muted">Todavía no hay códigos asociados. Puedes agregarlos ahora.</p>}
     <div className="sl-identifiers-list">
      {snapshot?.codes.map(c=><article key={c.code} className="sl-identifiers-code">
       <div><strong>{c.code}</strong><small>{KIND_LABELS[c.kind]} · {c.primary?'Principal':'Adicional'}</small></div>
       {canManage&&<div className="sl-identifiers-actions sl-identifiers-code-buttons">
        {!c.primary&&<button className="button secondary" disabled={busy} onClick={()=>void manageCode('set_primary',c.code,undefined,c.kind)}>Hacer principal</button>}
        <select aria-label={'Cambiar tipo de '+c.code} disabled={busy} value={c.kind} onChange={e=>void manageCode('set_kind',c.code,undefined,e.target.value as CodeKind)}>
         <option value="unclassified">Sin clasificar</option><option value="manufacturer">Fabricante</option><option value="internal">Interno</option>
        </select>
        <button type="button" className="icon-button" aria-label={'Reemplazar '+c.code} disabled={busy} onClick={()=>{setReplacing(c.code);setKind(c.kind==='unclassified'?'manufacturer':c.kind);setNewCode('');}}><Pencil size={16}/></button>
        <button type="button" className="icon-button" aria-label={'Remover '+c.code} disabled={busy} onClick={()=>setConfirmRemove(c.code)}><Trash2 size={16}/></button>
       </div>}
      </article>)}
     </div>
     {confirmRemove&&<div className="sl-identifiers-warning" role="alertdialog" aria-label="Confirmar desvinculación del código">
      <strong>¿Desvincular {confirmRemove}?</strong>
      <p>Este código dejará de localizar la variante. No se eliminará el producto ni cambiarán sus existencias.</p>
      <div className="sl-identifiers-actions"><button className="button secondary" type="button" onClick={()=>setConfirmRemove(null)}>Cancelar</button>
       <button className="button primary" disabled={busy} onClick={()=>void manageCode('remove',confirmRemove)}>Confirmar remoción</button></div>
     </div>}
     <details className="sl-identifiers-ocr-review"><summary>Historial de cambios de códigos</summary>
      {snapshot?.barcode_history.map(h=><p key={h.id}><small>{dateTime(h.changed_at)}</small><span>Principal: {h.previous_codes?.primary??'—'} → {h.current_codes?.primary??'—'}</span></p>)}
      {!snapshot?.barcode_history.length&&<p className="muted">Sin cambios registrados.</p>}
     </details>
    </>}
    <ErrorNotice message={error||commandError}/>
    <div className="sl-identifiers-footer"><Keyboard size={15}/><span>Compatible con cámara de iPhone y lectores USB en Windows.</span></div>
   </div>
   {scanner && <BarcodeScanner title={scanner==='serial'?'Escanear número de serie':'Escanear código de producto'} onDetected={value=>chooseScan(value)} onClose={()=>setScanner(null)} onActivate={unlockAudio} />}
  </Modal>
 );
}
