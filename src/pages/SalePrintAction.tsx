import { useEffect, useRef, useState, type RefObject } from 'react';
import { FileDown, Printer, Share2 } from 'lucide-react';
import { ErrorNotice } from '../components/ui';
import { createReceiptPdf } from '../lib/receiptPdf';

export const RECEIPT_LOGO = '/brand/alternate_light.png';

export function ReceiptBrand() {
  return <img className="sales-receipt-logo" src={RECEIPT_LOGO} alt="S-mart Living" decoding="async" />;
}

/** iPadOS can report a desktop Macintosh user agent. */
function isAppleMobile() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (/Mac/i.test(navigator.platform) && navigator.maxTouchPoints > 1);
}

export function SalePrintAction({ receiptRef, number }: {
  receiptRef: RefObject<HTMLElement | null>;
  number: string;
}) {
  const [busy, setBusy] = useState(false);
  const [prepared, setPrepared] = useState<{ file: File; url: string } | null>(null);
  const [error, setError] = useState('');
  const active = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  useEffect(() => () => { if (prepared) URL.revokeObjectURL(prepared.url); }, [prepared]);

  async function prepare() {
    if (busy) return;
    if (!isAppleMobile()) { window.print(); return; }
    if (!receiptRef.current) { setError('No se encontró el recibo. Vuelve a abrirlo.'); return; }
    setBusy(true); setError('');
    try {
      const blob = await createReceiptPdf(receiptRef.current, number);
      if (!active.current) return;
      const safeNumber = number.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 100) || 'venta';
      const file = new File([blob], `Recibo-${safeNumber}.pdf`, { type: 'application/pdf' });
      setPrepared({ file, url: URL.createObjectURL(file) });
    } catch {
      if (active.current) setError('No se pudo preparar el PDF. Revisa tu conexión y vuelve a intentar.');
    } finally {
      if (active.current) setBusy(false);
    }
  }

  async function share() {
    if (!prepared) return;
    setError('');
    try {
      if (!navigator.share || !navigator.canShare?.({ files: [prepared.file] })) {
        setError('Este navegador no permite compartir archivos directamente. Abre o guarda el PDF y usa Compartir > Imprimir.');
        return;
      }
      // Called synchronously from a second tap: native share requires user activation.
      await navigator.share({ files: [prepared.file], title: `Recibo ${number}` });
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      if (active.current) setError('No se abrió el menú de compartir. Abre o guarda el PDF y usa las opciones de iOS.');
    }
  }

  return <>
    <button type="button" className="button secondary" disabled={busy} onClick={() => void prepare()}>
      <Printer size={17} aria-hidden="true" />{busy ? 'Preparando PDF…' : 'Imprimir'}
    </button>
    {prepared && <section className="sales-pdf-ready" aria-label="Recibo PDF">
      <div role="status"><strong>PDF preparado</strong><p>Comparte el recibo y selecciona Imprimir en iOS. También puedes abrirlo o guardarlo en Archivos.</p></div>
      <div className="sales-pdf-actions">
        <button type="button" className="button primary" onClick={() => void share()}><Share2 size={17} aria-hidden="true"/> Compartir / imprimir PDF</button>
        <a className="button secondary" href={prepared.url} target="_blank" rel="noopener noreferrer">Abrir PDF</a>
        <a className="button secondary" href={prepared.url} download={prepared.file.name}><FileDown size={17} aria-hidden="true"/> Guardar PDF</a>
      </div>
    </section>}
    {error && <div className="sales-pdf-error"><ErrorNotice message={error}/></div>}
  </>;
}
