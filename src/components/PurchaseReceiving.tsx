import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AlertTriangle, Camera, Check, CheckCircle2, CircleDashed, Package, Printer, ScanLine } from 'lucide-react';
import type { DocumentItem, RetailDocument } from '../lib/contracts';
import { dateTime, documentNumber, money } from '../lib/format';
import { printBarcodeLabel } from '../lib/barcode';
import {
  countPurchaseBarcode,
  preparePurchaseReceipt,
  purchaseItemTitle,
  purchaseReferenceProgress,
  remainingPurchaseQuantity,
  type ReceiptDraft,
  type ReceiptScan,
} from '../lib/purchaseReceiving';
import type { useOperation } from '../state/useOperation';
import { useRetail } from '../state/useRetail';
import { BarcodeScanner } from './BarcodeScanner';
import { ErrorNotice, Field } from './ui';
import './purchase-receiving.css';

type PurchaseFormProps = {
  document: RetailDocument;
  items: DocumentItem[];
  operation: ReturnType<typeof useOperation>;
  onDone: () => void;
};

export function PurchaseReferenceProgress({ item, draft, enhanced, recent = false }: { item: DocumentItem; draft: ReceiptDraft; enhanced: boolean; recent?: boolean }) {
  const progress = purchaseReferenceProgress(item, draft, enhanced);
  const label = !progress.valid ? 'Revisa las cantidades' : progress.complete ? 'Referencia completa' : `Faltan ${progress.remaining} ${progress.remaining === 1 ? 'unidad' : 'unidades'}`;
  return (
    <div className={`purchase-reference-progress${progress.complete ? ' complete' : ''}${recent ? ' recent' : ''}`}>
      {progress.complete ? <CheckCircle2 size={22} aria-hidden="true" /> : <CircleDashed size={20} aria-hidden="true" />}
      <div className="purchase-reference-copy">
        <strong>{purchaseItemTitle(item)} · {item.product_snapshot.name}</strong>
        <span>{label}{enhanced && progress.valid && progress.damaged > 0 ? ` · ${progress.damaged} dañadas` : ''}</span>
      </div>
      <strong className="purchase-reference-count">{progress.valid ? progress.total : '—'} / {progress.target}</strong>
    </div>
  );
}

export function ReceivePurchase({ document: doc, items, operation, onDone }: PurchaseFormProps) {
  const { data, notify } = useRetail();
  const { run, busy, error } = operation;
  const enhanced = data.features?.includes('purchase_receipts_v1') ?? false;
  const [openedVersion, setOpenedVersion] = useState(doc.updated_at);
  const [draft, setDraft] = useState<ReceiptDraft>({});
  const draftRef = useRef<ReceiptDraft>({});
  const previousScan = useRef<ReceiptScan | null>(null);
  const codeInput = useRef<HTMLInputElement>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const [code, setCode] = useState('');
  const [notes, setNotes] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [lastItemId, setLastItemId] = useState<string | null>(null);
  const [validation, setValidation] = useState('');
  const current = data.documents.find((document) => document.id === doc.id);
  const stale = !current || current.updated_at !== openedVersion;
  const permitted = data.permissions.purchase && doc.type === 'purchase';
  const open = current && ['pending', 'partial'].includes(current.status);
  const locked = busy || stale || !permitted || !open;
  const pending = items.filter((item) => remainingPurchaseQuantity(item) > 0);
  const result = preparePurchaseReceipt(items, draft, enhanced);
  const pendingUnits = pending.reduce((sum, item) => sum + remainingPurchaseQuantity(item), 0);
  const countedUnits = result.good + result.damaged;
  const complete = pendingUnits > 0 && !result.error && countedUnits === pendingUnits;
  const lastItem = pending.find(item => item.id === lastItemId);
  const completedReferences = pending.filter(item => purchaseReferenceProgress(item, draft, enhanced).complete).length;

  useEffect(() => () => {
    const audio = audioRef.current;
    audioRef.current = null;
    if (audio && audio.state !== 'closed') void audio.close().catch(() => {});
  }, []);

  // Unlock audio from an explicit gesture, including the iPhone camera activation.
  function unlockAudio() {
    try {
      const Audio = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Audio) return;
      const audio = audioRef.current ?? new Audio();
      audioRef.current = audio;
      if (audio.state === 'suspended') void audio.resume().catch(() => {});
    } catch { /* Visual confirmation remains available if audio is blocked. */ }
  }
  function playScanSound() {
    const audio = audioRef.current;
    if (!audio) return;
    const play = () => {
      if (audioRef.current !== audio || audio.state !== 'running') return;
      try {
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        const now = audio.currentTime;
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(1100, now);
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.exponentialRampToValueAtTime(0.65, now + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        oscillator.connect(gain).connect(audio.destination);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
        oscillator.start(now);
        oscillator.stop(now + 0.19);
      } catch { /* Audio failure must never prevent counting a unit. */ }
    };
    if (audio.state === 'running') play();
    else if (audio.state === 'suspended') void audio.resume().then(play).catch(() => {});
  }

  function updateDraft(next: ReceiptDraft) {
    draftRef.current = next;
    setDraft(next);
    setLastItemId(null);
    setFeedback('');
    setValidation('');
  }
  function countCode(value: string) {
    if (locked) return false;
    const counted = countPurchaseBarcode({
      value, items, variants: data.variants, draft: draftRef.current,
      previous: previousScan.current, at: performance.now(),
    });
    if (counted.accepted) {
      updateDraft(counted.draft);
      previousScan.current = counted.scan;
      setCode('');
      playScanSound();
    }
    setLastItemId(counted.accepted ? counted.itemId ?? null : null);
    setFeedback(counted.message);
    if (!scannerOpen) codeInput.current?.focus();
    return counted.accepted;
  }
  function acceptCurrentOrder() {
    if (!current || busy) return;
    updateDraft({});
    previousScan.current = null;
    setOpenedVersion(current.updated_at);
    setFeedback('Se cargó la versión actual. Vuelve a contar la mercancía de esta recepción.');
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked) return;
    const prepared = preparePurchaseReceipt(items, draftRef.current, enhanced);
    setValidation(prepared.error);
    if (prepared.error) return;
    try {
      await run('receive_purchase', {
        id: doc.id,
        ...(enhanced ? { expected_updated_at: openedVersion } : {}),
        items: prepared.lines,
        notes: notes.trim(),
      });
      notify(enhanced
        ? `Recepción registrada: ${prepared.good} conformes y ${prepared.damaged} dañadas en cuarentena.`
        : 'Recepción registrada. Las existencias ya están actualizadas.');
      onDone();
    } catch { /* Keep the provisional count and stable operation payload for a safe retry. */ }
  }

  return (
    <>
      <form onSubmit={submit} className="stack purchase-receiving">
        <div>
          <h3>Recibir mercancía</h3>
          <p className="muted">{documentNumber(doc)} · Registra únicamente lo que llegó. Los faltantes seguirán pendientes.</p>
        </div>
        {!permitted && <ErrorNotice message="Tu cuenta no tiene permiso para recibir esta orden." />}
        {permitted && !open && <ErrorNotice message="Esta orden ya no admite recepciones." />}
        {permitted && stale && open && (
          <div className="warning-notice purchase-receiving-stale" role="alert">
            <span>La orden cambió desde que abriste el conteo. Revisa la versión actual antes de guardar.</span>
            <button type="button" className="button secondary" disabled={busy} onClick={acceptCurrentOrder}>
              Descartar conteo y cargar versión actual
            </button>
          </div>
        )}
        <fieldset disabled={locked} className="purchase-receiving-fieldset">
          <div className="purchase-receiving-scan">
            <Field label="Código de barras o SKU de esta orden">
              <input
                ref={codeInput} value={code} autoComplete="off" autoCapitalize="off" spellCheck={false}
                maxLength={80} placeholder="Escanea con el lector y pulsa Enter"
                onChange={(event) => setCode(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); unlockAudio(); countCode(code); } }}
              />
            </Field>
            <div className="purchase-receiving-scan-actions">
              <button type="button" className="button secondary" onClick={() => { unlockAudio(); countCode(code); }}>
                <ScanLine size={17} /> Contar unidad
              </button>
              <button type="button" className="button secondary" onClick={() => { unlockAudio(); setScannerOpen(true); }}>
                <Camera size={17} /> Cámara continua
              </button>
            </div>
          </div>
          <p className="purchase-receiving-feedback" role="status">
            {complete ? '¡Todas las unidades contabilizadas! Revisa y confirma la recepción.' : feedback || 'El lector suma una unidad conforme al conteo provisional. Los escaneos muy rápidos del mismo código se bloquean.'}
          </p>
          {lastItem && <div role="status" aria-live="polite"><PurchaseReferenceProgress item={lastItem} draft={draft} enhanced={enhanced} recent /></div>}
          <div className="purchase-receiving-summary purchase-receiving-summary-top" role="status" aria-live="polite">
            <span>Conteo provisional</span><strong>{countedUnits} / {pendingUnits} unidades · {result.good} conformes{enhanced ? ` · ${result.damaged} dañadas` : ''}</strong>
          </div>
          <div className="purchase-receiving-lines">
            {pending.map((item) => {
              const remaining = remainingPurchaseQuantity(item);
              const count = draft[item.id] ?? { quantity: '0', damagedQuantity: '0' };
              const barcode = data.variants.find((variant) => variant.id === item.variant_id)?.barcode || item.product_snapshot.barcode;
              const damaged = item.damaged_quantity ?? 0;
              return (
                <article className="purchase-receiving-line" key={item.id}>
                  <div className="purchase-receiving-line-head">
                    {purchaseReferenceProgress(item, draft, enhanced).complete ? <CheckCircle2 className="purchase-line-complete-icon" size={23} aria-hidden="true" /> : <Package size={23} aria-hidden="true" />}
                    <div>
                      <strong>{purchaseItemTitle(item)}</strong>
                      <p className="muted">{item.product_snapshot.name} · {item.product_snapshot.sku}</p>
                      {purchaseReferenceProgress(item, draft, enhanced).complete && <p className="purchase-line-complete-label">Referencia completa · Conteo provisional</p>}
                    </div>
                    <button
                      type="button" className="button ghost" disabled={!barcode}
                      aria-label={`Imprimir etiqueta de ${purchaseItemTitle(item)} ${item.product_snapshot.name}`}
                      title={barcode ? 'Imprimir código de barras' : 'Esta referencia no tiene código de barras'}
                      onClick={() => {
                        if (!barcode) return;
                        const failure = printBarcodeLabel({ barcode, sku: item.product_snapshot.sku, title: purchaseItemTitle(item) });
                        if (failure) setValidation(failure);
                      }}
                    >
                      <Printer size={16} /> Etiqueta
                    </button>
                  </div>
                  <div className="purchase-receiving-quantities">
                    <span>Pedidas <strong>{item.quantity}</strong></span>
                    <span>Contabilizadas <strong>{item.received_quantity}</strong></span>
                    <span>Pendientes <strong>{remaining}</strong></span>
                    {enhanced && damaged > 0 && <span>En cuarentena <strong>{damaged}</strong></span>}
                  </div>
                  {!item.variant_id && <p className="warning-notice">Vincula esta referencia con el inventario antes de recibirla.</p>}
                  <div className="purchase-receiving-counts">
                    <Field label={enhanced ? 'Conformes recibidas hoy' : 'Recibidas hoy'}>
                      <input
                        type="number" inputMode="numeric" min="0" max={remaining} step="1" disabled={!item.variant_id}
                        value={count.quantity}
                        aria-label={`Recibir conformes ${purchaseItemTitle(item)} ${item.product_snapshot.name}`}
                        onChange={(event) => updateDraft({ ...draftRef.current, [item.id]: { ...count, quantity: event.target.value } })}
                      />
                    </Field>
                    {enhanced && (
                      <Field label="Dañadas recibidas hoy" hint="Se registran en cuarentena, sin aumentar el stock disponible.">
                        <input
                          type="number" inputMode="numeric" min="0" max={remaining} step="1" disabled={!item.variant_id}
                          value={count.damagedQuantity}
                          aria-label={`Recibir dañadas ${purchaseItemTitle(item)} ${item.product_snapshot.name}`}
                          onChange={(event) => updateDraft({ ...draftRef.current, [item.id]: { ...count, damagedQuantity: event.target.value } })}
                        />
                      </Field>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
          <Field label="Nota de recepción" hint="Opcional">
            <textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000} placeholder="Referencia de entrega o revisión de mercancía" />
          </Field>
        </fieldset>
        <div className="purchase-receiving-summary" role="status">
          <span>Conteo provisional</span><strong>{countedUnits} / {pendingUnits} unidades · {result.good} conformes{enhanced ? ` · ${result.damaged} dañadas` : ''}</strong>
        </div>
        <ErrorNotice message={validation || error} />
        <div className="modal-footer">
          <button type="button" className="button secondary" disabled={busy} onClick={onDone}>Cancelar</button>
          <button className="button primary" disabled={locked || !pending.some((item) => item.variant_id)}>
            <Check size={17} /> {busy ? 'Registrando…' : 'Confirmar recepción'}
          </button>
        </div>
      </form>
      {scannerOpen && !locked && <BarcodeScanner title="Recepción · Escaneo continuo" continuous complete={complete} onActivate={unlockAudio} onDetected={countCode} onClose={() => setScannerOpen(false)} summary={
        <section className="purchase-scan-live" aria-label="Conteo en vivo">
          <div className="purchase-scan-live-total" role="status" aria-live="polite">
            <span>Conteo provisional</span><strong>{countedUnits} / {pendingUnits}</strong><span>{result.good} conformes{enhanced ? ` · ${result.damaged} dañadas` : ''}</span>
          </div>
          <progress aria-label="Progreso de la recepción" max={Math.max(1, pendingUnits)} value={countedUnits} />
          <p role="status" aria-live="polite">{complete ? 'Conteo completo. No se ha guardado la recepción.' : lastItem ? 'Unidad contabilizada. Recepción sin guardar.' : feedback || 'Aún no se ha guardado la recepción.'} · {Math.max(0, pendingUnits - countedUnits)} pendientes</p>
          {lastItem && <div role="status" aria-live="polite"><PurchaseReferenceProgress item={lastItem} draft={draft} enhanced={enhanced} recent /></div>}
          <p className="muted">Referencias completas: {completedReferences} / {pending.length}</p>
        </section>
      } referenceDetails={
        <section className="purchase-scan-live" aria-label="Progreso por referencia">
          <details open>
            <summary>Conteo por referencia · {completedReferences} / {pending.length} completas</summary>
            <ul className="purchase-reference-list">{pending.map(item => <li key={item.id}><PurchaseReferenceProgress item={item} draft={draft} enhanced={enhanced} /></li>)}</ul>
          </details>
        </section>
      } />}
    </>
  );
}

export function ClosePurchaseShort({ document: doc, items, operation, onDone }: PurchaseFormProps) {
  const { data, notify } = useRetail();
  const [openedVersion] = useState(doc.updated_at);
  const [reason, setReason] = useState('');
  const [validation, setValidation] = useState('');
  const current = data.documents.find((document) => document.id === doc.id);
  const enabled = data.features?.includes('purchase_receipts_v1') && data.permissions.purchase && doc.type === 'purchase';
  const stale = !current || current.updated_at !== openedVersion;
  const open = current && ['pending', 'partial'].includes(current.status);
  const remaining = items.filter((item) => remainingPurchaseQuantity(item) > 0);
  const units = remaining.reduce((sum, item) => sum + remainingPurchaseQuantity(item), 0);
  const locked = operation.busy || !enabled || stale || !open || !units;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked) return;
    if (reason.trim().length < 3) { setValidation('Indica un motivo de al menos tres caracteres.'); return; }
    try {
      await operation.run('close_purchase_short', { id: doc.id, expected_updated_at: openedVersion, reason: reason.trim() });
      notify(`Orden cerrada con ${units} unidades faltantes. El stock recibido se conserva.`);
      onDone();
    } catch { /* Preserve the reason to allow review/retry. */ }
  }
  if (!enabled) return <ErrorNotice message="El cierre con faltantes no está disponible para esta orden." />;
  return (
    <form className="stack purchase-receiving" onSubmit={submit}>
      <div className="warning-notice"><AlertTriangle size={19} /> La orden se cerrará con {units} unidades sin recibir. No podrás registrar más recepciones en ella; el inventario ya recibido se conserva.</div>
      <ul className="purchase-receiving-shortages">
        {remaining.map((item) => <li key={item.id}><span>{purchaseItemTitle(item)} · {item.product_snapshot.name}</span><strong>{remainingPurchaseQuantity(item)} faltantes</strong></li>)}
      </ul>
      <Field label="Motivo del cierre" hint="Quedará registrado en el historial de la orden.">
        <textarea required minLength={3} maxLength={1000} rows={3} disabled={locked} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Por qué no se recibirá la mercancía pendiente" />
      </Field>
      {stale && <ErrorNotice message="La orden cambió. Vuelve al documento y revisa las cantidades actuales antes de cerrarla." />}
      {!open && <ErrorNotice message="Esta orden ya no admite un cierre con faltantes." />}
      <ErrorNotice message={validation || operation.error} />
      <div className="modal-footer">
        <button type="button" className="button secondary" disabled={operation.busy} onClick={onDone}>Volver</button>
        <button className="button danger" disabled={locked}>{operation.busy ? 'Cerrando…' : 'Confirmar cierre con faltantes'}</button>
      </div>
    </form>
  );
}

export function PurchaseReceiptHistory({ purchaseId }: { purchaseId: string }) {
  const { data } = useRetail();
  if (!data.permissions.purchase || !data.features?.includes('purchase_receipts_v1')) return null;
  const receipts = [...(data.purchase_receipts ?? [])].filter((receipt) => receipt.purchase_id === purchaseId).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const doc = data.documents.find((document) => document.id === purchaseId);
  return (
    <section className="purchase-receiving-history" aria-label="Historial de recepciones">
      <h3>Historial de recepciones</h3>
      {!receipts.length && <p className="muted">Aún no hay recepciones registradas.</p>}
      {receipts.map((receipt) => {
        const actor = data.team.find((member) => member.user_id === receipt.received_by);
        const good = receipt.items.reduce((sum, line) => sum + line.quantity, 0);
        const damaged = receipt.items.reduce((sum, line) => sum + line.damaged_quantity, 0);
        return (
          <article className="purchase-receiving-history-item" key={receipt.id}>
            <header><strong>{dateTime(receipt.created_at)}</strong><span>{actor?.display_name || 'Miembro del equipo'}</span></header>
            <p>{good} conformes · {damaged} dañadas en cuarentena</p>
            <ul>
              {receipt.items.map((line) => {
                const item = data.document_items.find((item) => item.id === line.item_id && item.document_id === purchaseId);
                return <li key={line.item_id}><span>{item ? `${purchaseItemTitle(item)} · ${item.product_snapshot.name}` : 'Referencia de la orden'}: {line.quantity} conformes, {line.damaged_quantity} dañadas</span>{data.permissions.view_costs && <span>{money(line.unit_cost)} / unidad</span>}</li>;
              })}
            </ul>
            {receipt.notes && <p className="purchase-receiving-note">{receipt.notes}</p>}
          </article>
        );
      })}
      {doc?.status === 'closed_short' && <div className="warning-notice"><strong>Cerrada con faltantes.</strong> {doc.status_reason || 'Las unidades pendientes no se recibirán en esta orden.'}</div>}
    </section>
  );
}
