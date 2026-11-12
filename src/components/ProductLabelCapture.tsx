import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Camera, ScanLine } from 'lucide-react';
import type { Product, Variant } from '../lib/contracts';
import { barcodeMatches } from '../lib/barcode';
import { categoryLabels } from '../lib/format';
import { isValidProductGtin, parseProductLabel, type ProductLabelSuggestions } from '../lib/productLabel';
import { BarcodeScanner } from './BarcodeScanner';
import { ErrorNotice, Field, Modal } from './ui';
import './product-label-capture.css';

const fieldNames: Record<keyof ProductLabelSuggestions, string> = {
  brand: 'Marca', model: 'Modelo', category: 'Categoría', variantName: 'Opción o variante', barcode: 'Código del fabricante',
};
const fields = Object.keys(fieldNames) as Array<keyof ProductLabelSuggestions>;

export function ProductLabelCapture({ onClose, onApply, onExisting, products = [], variants = [], currentVariantId }: {
  onClose: () => void;
  onApply: (suggestions: ProductLabelSuggestions) => void;
  onExisting?: (variantId: string) => void;
  products?: Product[];
  variants?: Variant[];
  currentVariantId?: string;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [scanner, setScanner] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [review, setReview] = useState<ProductLabelSuggestions | null>(null);
  const [selected, setSelected] = useState<Set<keyof ProductLabelSuggestions>>(new Set());
  const [choices, setChoices] = useState<string[]>([]);
  const controller = useRef<AbortController | null>(null);
  const previewUrl = useRef('');
  const progressRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => () => { controller.current?.abort(); if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); }, []);

  const code = review?.barcode?.trim() ?? '';
  const known = useMemo(() => code ? variants.filter((variant) => barcodeMatches(variant, code)) : [], [code, variants]);
  const knownVariant = known.length === 1 ? known[0] : undefined;
  const ownCode = knownVariant?.id === currentVariantId;
  const knownProduct = products.find((product) => product.id === knownVariant?.product_id);

  function startReview(suggestions: ProductLabelSuggestions, codes: string[] = []) {
    setReview(suggestions);
    setChoices(codes);
    setSelected(new Set(fields.filter((key) => Boolean(suggestions[key]))));
    setError('');
    requestAnimationFrame(() => progressRef.current?.focus());
  }
  function close() { controller.current?.abort(); onClose(); }
  async function readPhoto() {
    if (!file || busy) return;
    controller.current?.abort();
    const task = new AbortController();
    controller.current = task;
    setBusy(true); setError(''); setReview(null); setProgress(0);
    try {
      const { readProductLabelPhoto } = await import('../lib/labelOcr');
      if (task.signal.aborted) return;
      const result = await readProductLabelPhoto(file, { signal: task.signal, onProgress: setProgress });
      if (!task.signal.aborted) startReview(result.suggestions, result.barcodes);
    } catch (cause) {
      if (!task.signal.aborted) setError(cause instanceof Error && /^(?:Elige |La foto |No pudimos |La lectura )/.test(cause.message) ? cause.message : 'No pudimos leer la foto. Vuelve a intentar con una foto clara o introduce los datos manualmente.');
    } finally {
      if (!task.signal.aborted) setBusy(false);
    }
  }
  function update(key: keyof ProductLabelSuggestions, value: string) {
    setReview((current) => ({ ...current, [key]: value }));
    if (value.trim()) setSelected((current) => new Set([...current, key]));
  }
  function apply(event: FormEvent) {
    event.preventDefault();
    if ((known.length && !ownCode) || !review) return;
    const next: ProductLabelSuggestions = {};
    for (const key of selected) if (review[key]?.trim()) next[key] = review[key]!.trim();
    if (next.barcode && !isValidProductGtin(next.barcode) && !ownCode) { setError('Revisa el código EAN/UPC y su dígito de control. Los códigos de lote o serie se guardan por separado.'); return; }
    if (!Object.keys(next).length) { setError('Selecciona al menos un dato para aplicar.'); return; }
    onApply(next);
  }
  return <Modal title="Escanear etiqueta" onClose={close}>
    <div className="product-label-capture stack">
      <p className="product-label-note">Lee los datos esenciales y revísalos antes de usarlos. La foto se procesa en este dispositivo; no se envía ni se guarda.</p>
      {!review && <>
        <div className="product-label-source-actions">
          <label className={`button secondary product-label-file ${busy ? 'is-disabled' : ''}`}>
            <Camera size={17} /> Tomar o elegir foto
            <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={busy} aria-label="Foto de la etiqueta" onChange={(event) => {
              const next = event.target.files?.[0] ?? null;
              if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
              previewUrl.current = next ? URL.createObjectURL(next) : '';
              setPreview(previewUrl.current);
              setFile(next); setError(''); setReview(null);
              event.target.value = '';
            }} />
          </label>
          <button type="button" className="button secondary" disabled={busy} onClick={() => setScanner(true)}><ScanLine size={17} /> Leer código</button>
        </div>
        {file && <figure className="product-label-photo">
          {preview && <img src={preview} alt="Etiqueta elegida para lectura" />}
          <figcaption>{file.name}</figcaption>
        </figure>}
        {!busy && <p className="product-label-note">Incluye el modelo y el código de barras, con buena luz y sin reflejos. La capacidad se propone solo si está escrita en la etiqueta.</p>}
        {busy && <div className="product-label-progress" role="status" aria-live="polite">
          <strong>{progress < .25 ? 'Preparando lectura local…' : 'Leyendo etiqueta…'}</strong>
          <progress max={1} value={progress} aria-label="Progreso de lectura" />
          <small>La primera lectura descarga los recursos de reconocimiento de la app.</small>
          <button type="button" className="button secondary" onClick={() => { controller.current?.abort(); setBusy(false); }}>Cancelar lectura</button>
        </div>}
        {!busy && <div className="row-actions">
          <button type="button" className="button primary" disabled={!file} onClick={() => void readPhoto()}>Leer etiqueta</button>
          <button type="button" className="button ghost" onClick={() => startReview({})}>Introducir datos manualmente</button>
        </div>}
      </>}
      {review && <form onSubmit={apply} className="stack">
        <h3 ref={progressRef} tabIndex={-1}>Revisar datos</h3>
        <p className="product-label-note">Corrige lo necesario y elige qué datos pasar al producto. Aplicar no guarda el producto.</p>
        {choices.length > 1 && <Field label="Códigos de producto encontrados" hint="Elige el EAN/UPC del producto que estás registrando.">
          <select value={code} onChange={(event) => update('barcode', event.target.value)}><option value="">Seleccionar código</option>{choices.map((value) => <option key={value} value={value}>{value}</option>)}</select>
        </Field>}
        <div className="product-label-review">
          {fields.map((key) => <div key={key} className="product-label-review-row">
            <label className="product-label-include"><input type="checkbox" checked={selected.has(key)} aria-label={`Incluir ${fieldNames[key].toLowerCase()}`} onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(key); else next.delete(key); return next; })} /></label>
            <Field label={fieldNames[key]}>
              {key === 'category' ? <select value={review[key] ?? ''} onChange={(event) => update(key, event.target.value)}><option value="">Sin identificar</option>{Object.entries(categoryLabels).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select> : <input value={review[key] ?? ''} maxLength={key === 'model' ? 160 : key === 'barcode' ? 14 : 100} autoComplete="off" onChange={(event) => update(key, event.target.value)} />}
            </Field>
          </div>)}
        </div>
        {knownVariant && !ownCode && <section className="product-label-known" aria-label="Producto reconocido">
          <strong>{knownProduct ? `${knownProduct.brand} ${knownProduct.model}` : knownVariant.sku}</strong>
          <span>{knownVariant.name} · {knownVariant.sku}{!knownVariant.active || knownProduct?.active === false ? ' · Archivado' : ''}</span>
          <p>Este código ya pertenece a un producto. Ábrelo para revisar la ficha o recibir existencias.</p>
          {onExisting && <button type="button" className="button primary" onClick={() => onExisting(knownVariant.id)}>Abrir producto existente</button>}
        </section>}
        {known.length > 1 && <ErrorNotice message="El código coincide con más de una referencia. Revísalo en el inventario antes de continuar." />}
        <ErrorNotice message={error} />
        <div className="modal-footer">
          <button type="button" className="button secondary" onClick={() => { setReview(null); setError(''); }}>Otra lectura</button>
          {(!known.length || ownCode) && <button type="submit" className="button primary">Aplicar al formulario</button>}
        </div>
      </form>}
      {!review && <ErrorNotice message={error} />}
    </div>
    {scanner && <BarcodeScanner title="Leer código de la etiqueta" onDetected={(value) => {
      const existing = variants.some((variant) => barcodeMatches(variant, value));
      if (existing) startReview({ barcode: value });
      else {
        const result = parseProductLabel('', [value]);
        startReview(result.suggestions, result.barcodes);
        if (!result.suggestions.barcode) setError('Este código no es un EAN/UPC de producto válido. Fotografía la etiqueta o revisa los datos manualmente.');
      }
    }} onClose={() => setScanner(false)} />}
  </Modal>;
}
