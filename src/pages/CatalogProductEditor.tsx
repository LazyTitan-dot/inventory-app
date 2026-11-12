import { useRef, useState, type FormEvent } from 'react';
import { Barcode, Camera, Plus, RefreshCw, ScanLine, Trash2, X } from 'lucide-react';
import { useRetail } from '../state/useRetail';
import { useOperation } from '../state/useOperation';
import type { Product } from '../lib/contracts';
import { categoryLabels, money, taxRateLabel } from '../lib/format';
import { ErrorNotice, Field, Modal } from '../components/ui';
import { ProductImagesEditor } from '../components/ProductImagesEditor';
import { generateSku, MAX_SKU_LENGTH, normalizeSku, validateSkus } from '../lib/sku';
import { calculatePriceFromTotal, calculateUnitPrice, isValidCatalogAmount, MAX_CATALOG_PRICE, suggestFinalPrice } from '../lib/pricing';
import { BarcodeScanner } from '../components/BarcodeScanner';
import { ProductLabelCapture } from '../components/ProductLabelCapture';
import type { ProductLabelSuggestions } from '../lib/productLabel';
import { barcodeMatches, generateInternalBarcode, getVariantBarcodes, MAX_BARCODE_ALIASES, validateBarcodes } from '../lib/barcode';
import { PriceDetails } from './CatalogPricing';
import './catalog-editor.css';

interface VariantDraft {
  id?: string;
  draftId: string;
  autoSku: boolean;
  name: string;
  sku: string;
  barcode: string;
  barcode_aliases: string[];
  cost: number;
  price: number;
  finalPrice: number;
  autoPrice: boolean;
  roundingAdjustment: number;
  min_stock: number;
  reorder_target: number;
  opening_quantity?: number;
  active: boolean;
}
function newVariant(brand: string, model: string, occupied: string[]): VariantDraft {
  const draftId = crypto.randomUUID();
  return {
    draftId,
    autoSku: true,
    name: 'Estándar',
    sku: generateSku({ brand, model, variant: 'Estándar', seed: draftId, occupied }),
    barcode: generateInternalBarcode(draftId),
    barcode_aliases: [],
    cost: 0,
    price: 0,
    finalPrice: 0,
    autoPrice: true,
    roundingAdjustment: 0,
    min_stock: 3,
    reorder_target: 10,
    opening_quantity: 0,
    active: true,
  };
}

export function ProductEditor({
  product,
  onClose,
  onSaved,
  onOpenExisting,
  initialBarcode,
}: {
  product?: Product;
  onClose: () => void;
  onSaved?: (barcode: string) => void;
  onOpenExisting?: (variantId: string) => void;
  initialBarcode?: string;
}) {
  const { data, notify, refresh, refreshing } = useRetail();
  const [editorTaxRate, setEditorTaxRate] = useState(data.settings.tax_rate);
  const taxRateChanged = data.settings.tax_rate !== editorTaxRate;
  const { run, busy, error, clearError } = useOperation();
  const [brand, setBrand] = useState(product?.brand ?? '');
  const [model, setModel] = useState(product?.model ?? '');
  const [category, setCategory] = useState(product?.category ?? 'tv');
  const [description, setDescription] = useState(product?.description ?? '');
  const [warranty, setWarranty] = useState(product?.warranty_months ?? 12);
  const [images, setImages] = useState<string[]>(() => product?.images ?? []);
  const [uploading, setUploading] = useState(false);
  const [scannerIndex, setScannerIndex] = useState<number | null>(null);
  const [openLabel, setOpenLabel] = useState(false);
  const [captureIndex, setCaptureIndex] = useState<number | null>(null);
  const [pendingExisting, setPendingExisting] = useState<string | null>(null);
  const [scanNotice, setScanNotice] = useState('');
  const form = useRef<HTMLFormElement>(null);
  const [openedVersion] = useState(product?.updated_at);
  const [catalogVariants] = useState(() => data.variants);
  const [expectedVariants] = useState(() =>
    product
      ? data.variants
          .filter((variant) => variant.product_id === product.id)
          .map((variant) => ({ id: variant.id, expected_updated_at: variant.updated_at }))
      : [],
  );
  const [variants, setVariants] = useState<VariantDraft[]>(() =>
    product
      ? data.variants
          .filter((v) => v.product_id === product.id)
          .map((v) => ({
            ...v,
            draftId: v.id,
            autoSku: false,
            cost: v.cost ?? 0,
            finalPrice: calculateUnitPrice(v.price, editorTaxRate)?.total ?? 0,
            autoPrice: false,
            roundingAdjustment: 0,
            barcode: v.barcode ?? '',
            barcode_aliases: v.barcode_aliases ?? [],
          }))
      : [
          { ...newVariant(brand, model, catalogVariants.map((v) => v.sku)),
            barcode_aliases: initialBarcode?.trim() ? [initialBarcode.trim()] : [] },
        ],
  );
  const [validation, setValidation] = useState('');
  const aliasesEnabled = data.features?.includes('barcode_aliases_v1') ?? false;
  function suggestedSku(
    row: VariantDraft,
    rows: VariantDraft[],
    nextBrand = brand,
    nextModel = model,
  ) {
    return generateSku({
      brand: nextBrand,
      model: nextModel,
      variant: row.name,
      seed: row.draftId,
      occupied: [
        ...catalogVariants.filter((v) => v.id !== row.id).map((v) => v.sku),
        ...rows.filter((v) => v.draftId !== row.draftId).map((v) => v.sku),
      ],
    });
  }
  const setVariant = (index: number, patch: Partial<VariantDraft>) =>
    setVariants((rows) =>
      rows.map((v, i) => {
        if (i !== index) return v;
        const next = { ...v, ...patch };
        if (patch.name !== undefined && next.autoSku) next.sku = suggestedSku(next, rows);
        if (next.autoPrice && (patch.cost !== undefined || patch.autoPrice === true)) {
          const suggestion = suggestFinalPrice(next.cost, editorTaxRate);
          if (suggestion) {
            next.price = suggestion.base;
            next.finalPrice = suggestion.total;
            next.roundingAdjustment = suggestion.roundingAdjustment;
          } else {
            next.price = Number.NaN;
            next.finalPrice = Number.NaN;
            next.roundingAdjustment = 0;
          }
        }
        return next;
      }),
    );
  function changeIdentity(nextBrand: string, nextModel: string) {
    setBrand(nextBrand);
    setModel(nextModel);
    setVariants((rows) => {
      const next = [...rows];
      for (let index = 0; index < next.length; index++) {
        const row = next[index];
        if (row?.autoSku)
          next[index] = { ...row, sku: suggestedSku(row, next, nextBrand, nextModel) };
      }
      return next;
    });
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setValidation('');
    if (uploading || refreshing) return;
    if (!aliasesEnabled && variants.some((row) => JSON.stringify(row.barcode_aliases) !== JSON.stringify(catalogVariants.find((item) => item.id === row.id)?.barcode_aliases ?? []))) {
      setValidation('Actualiza la información y vuelve a intentar para guardar los códigos del fabricante. Tu borrador se conserva.');
      return;
    }
    if (taxRateChanged) {
      setValidation('La tasa de ITBIS cambió. Revisa y recalcula los precios antes de guardar.');
      return;
    }
    const urls = images;
    const prepared = variants.map((row) =>
      !row.id && !row.barcode.trim()
        ? {
            ...row,
            barcode: generateInternalBarcode(row.draftId, [
              ...catalogVariants.flatMap(getVariantBarcodes),
              ...variants.flatMap(getVariantBarcodes),
            ]),
          }
        : row,
    );
    const skuError =
      validateSkus(prepared, catalogVariants) || validateBarcodes(prepared, catalogVariants);
    if (skuError) {
      setValidation(skuError);
      revealSection('[data-identification]');
      return;
    }
    if (variants.some((v) => !isValidCatalogAmount(v.price) || !isValidCatalogAmount(v.cost))) {
      setValidation(
        'Revisa el costo y el precio final. Usa importes no negativos, con un máximo de dos decimales, dentro del límite mostrado.',
      );
      return;
    }
    if (
      !Number.isInteger(warranty) ||
      warranty < 0 ||
      warranty > 120 ||
      variants.some((v) =>
        [v.min_stock, v.reorder_target, ...(!v.id ? [v.opening_quantity] : [])].some(
          (value) => value === undefined || !Number.isInteger(value) || value < 0 || value > 999999,
        ),
      )
    ) {
      setValidation(
        'Las existencias deben ser cantidades enteras entre 0 y 999,999. La garantía debe estar entre 0 y 120 meses.',
      );
      revealSection('[data-stock-settings], [data-product-options]');
      return;
    }
    if (variants.some((v) => v.reorder_target < v.min_stock)) {
      setValidation('El objetivo de reposición debe ser igual o mayor al mínimo.');
      revealSection('[data-stock-settings]');
      return;
    }
    try {
      await run('save_product', {
        id: product?.id,
        ...(product
          ? { expected_updated_at: openedVersion, expected_variants: expectedVariants }
          : {}),
        category,
        expected_tax_rate: editorTaxRate,
        brand: brand.trim(),
        model: model.trim(),
        description: description.trim(),
        warranty_months: warranty,
        images: urls,
        variants: prepared.map((v) => ({
          id: v.id,
          name: v.name.trim(),
          sku: normalizeSku(v.sku),
          barcode: v.barcode.trim(),
          ...(aliasesEnabled ? { barcode_aliases: v.barcode_aliases.map((code) => code.trim()).filter(Boolean) } : {}),
          cost: v.cost,
          price: v.price,
          min_stock: v.min_stock,
          reorder_target: v.reorder_target,
          opening_quantity: v.opening_quantity,
          active: v.active,
        })),
      });
      notify(
        product ? 'Producto actualizado.' : 'Producto creado e inventario inicial registrado.',
      );
      onClose();
      if (openLabel && prepared[0]?.barcode) onSaved?.(prepared[0].barcode);
    } catch {
      /* El formulario conserva los datos. */
    }
  }
  function revealSection(selector: string) {
    const sections = form.current?.querySelectorAll<HTMLDetailsElement>(selector);
    sections?.forEach((node) => { node.open = true; });
    const firstInput = sections?.[0]?.querySelector<HTMLInputElement>('input, select, textarea');
    firstInput?.focus();
  }
  function revealInvalid(target: EventTarget) {
    if (!(target instanceof HTMLElement)) return;
    let parent = target.parentElement;
    while (parent && parent !== form.current) {
      if (parent instanceof HTMLDetailsElement) parent.open = true;
      parent = parent.parentElement;
    }
  }
  function addScannedBarcode(index: number, raw: string): boolean {
    const code = raw.trim();
    const row = variants[index];
    if (!code || !row) return false;
    const otherDraft = variants.findIndex((item, otherIndex) => otherIndex !== index && barcodeMatches(item, code));
    if (otherDraft !== -1) {
      setValidation(`Este código ya está en la variante ${otherDraft + 1}. Cada código identifica una sola variante.`);
      revealSection('[data-identification]');
      return false;
    }
    const known = data.variants.find((item) => item.id !== row.id && barcodeMatches(item, code));
    if (known) {
      setPendingExisting(known.id);
      return false;
    }
    if (barcodeMatches(row, code)) return true;
    if (row.barcode_aliases.length >= MAX_BARCODE_ALIASES) {
      setValidation(`Esta variante ya tiene ${MAX_BARCODE_ALIASES} códigos adicionales. Revisa su identificación antes de agregar otro.`);
      revealSection('[data-identification]');
      return false;
    }
    setVariant(index, { barcode_aliases: [...row.barcode_aliases, code] });
    setValidation('');
    setScanNotice('Código del fabricante agregado. El código interno se conserva.');
    return true;
  }
  function applyLabel(index: number, suggestions: ProductLabelSuggestions) {
    // The capture dialog has already let the user choose and review each field.
    // Product identity and barcode are separate from this unit's stock/pricing.
    if (suggestions.barcode && !addScannedBarcode(index, suggestions.barcode)) return;
    const nextBrand = suggestions.brand ?? brand;
    const nextModel = suggestions.model ?? model;
    changeIdentity(nextBrand, nextModel);
    if (suggestions.category && Object.hasOwn(categoryLabels, suggestions.category)) setCategory(suggestions.category);
    if (suggestions.variantName) setVariants((rows) => rows.map((row, rowIndex) => {
      if (rowIndex !== index) return row;
      const next = { ...row, name: suggestions.variantName! };
      return next.autoSku ? { ...next, sku: suggestedSku(next, rows, nextBrand, nextModel) } : next;
    }));
    setScanNotice('Datos revisados aplicados al borrador. Guarda el producto para confirmarlos.');
    setCaptureIndex(null);
  }
  const knownVariant = data.variants.find((row) => row.id === pendingExisting);
  const knownProduct = data.products.find((row) => row.id === knownVariant?.product_id);
  const blocked = busy || uploading || refreshing;
  return (
    <Modal title={product ? 'Editar producto' : 'Agregar producto'} onClose={() => { if (!busy && !uploading) onClose(); }} variant="drawer">
      <form ref={form} onSubmit={save} onInvalidCapture={(event) => revealInvalid(event.target)} className="catalog-product-editor stack">
        <section className="catalog-editor-scan" aria-label="Entrada rápida de producto">
          <p>Revisa los datos antes de aplicarlos.</p>
          <button type="button" className="button secondary" disabled={blocked} onClick={() => setCaptureIndex(0)}><Camera size={17} /> Escanear etiqueta</button>
        </section>
        {scanNotice && <p className="catalog-editor-notice" role="status">{scanNotice}</p>}
        {taxRateChanged && <div className="warning-notice" role="alert">
          <p>La tasa de ITBIS cambió de {taxRateLabel(editorTaxRate)} a {taxRateLabel(data.settings.tax_rate)}. Revisa los precios finales antes de guardar.</p>
          <button type="button" className="button secondary" disabled={blocked} onClick={() => {
            const rate = data.settings.tax_rate;
            setVariants((rows) => rows.map((row) => {
              const converted = row.autoPrice ? suggestFinalPrice(row.cost, rate) : calculatePriceFromTotal(row.finalPrice, rate);
              return { ...row, price: converted?.base ?? Number.NaN, finalPrice: converted?.total ?? Number.NaN, roundingAdjustment: converted?.roundingAdjustment ?? 0 };
            }));
            setEditorTaxRate(rate); setValidation(''); clearError();
          }}>Recalcular con la tasa actual</button>
        </div>}
        <fieldset className="catalog-editor-identity" disabled={blocked}>
          <legend>Producto</legend>
          <div className="form-grid">
            <Field label="Marca"><input required maxLength={100} value={brand} onChange={(event) => changeIdentity(event.target.value, model)} /></Field>
            <Field label="Modelo"><input required maxLength={160} value={model} onChange={(event) => changeIdentity(brand, event.target.value)} /></Field>
            <Field label="Categoría"><select value={category} onChange={(event) => setCategory(event.target.value)}>{Object.entries(categoryLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
          </div>
        </fieldset>
        <div className="section-heading catalog-editor-section-heading"><div><h3>Opciones y precio</h3><p>Color, capacidad u otra opción que ayude a elegir.</p></div>
          <button type="button" className="button secondary" disabled={blocked} onClick={() => setVariants((rows) => [...rows, newVariant(brand, model, [...catalogVariants.map((row) => row.sku), ...rows.map((row) => row.sku)])])}><Plus size={16} /> Añadir variante</button>
        </div>
        {variants.map((variant, index) => <fieldset className="variant-editor catalog-editor-variant" key={variant.draftId} disabled={blocked}>
          <legend>Variante {index + 1}</legend>
          <div className="form-grid">
            <Field label="Nombre" hint="Ejemplo: Blanco · 12,000 BTU."><input required maxLength={100} value={variant.name} onChange={(event) => setVariant(index, { name: event.target.value })} /></Field>
            {data.permissions.view_costs && <Field label="Costo (RD$)"><input required type="number" min={0} max={MAX_CATALOG_PRICE} step="0.01" value={Number.isFinite(variant.cost) ? variant.cost : ''} onChange={(event) => setVariant(index, { cost: event.target.valueAsNumber })} /></Field>}
            <Field label="Precio final con ITBIS (RD$)" hint="Sugerencia: costo + 25%, con ITBIS incluido. Puedes cambiarla.">
              <input required type="number" min={0} max={calculateUnitPrice(MAX_CATALOG_PRICE, editorTaxRate)?.total ?? MAX_CATALOG_PRICE} step="0.01" value={Number.isFinite(variant.finalPrice) ? variant.finalPrice : ''}
                onChange={(event) => { const total = event.target.valueAsNumber; const converted = calculatePriceFromTotal(total, editorTaxRate); setVariant(index, { finalPrice: total, price: converted?.base ?? Number.NaN, autoPrice: false, roundingAdjustment: converted?.roundingAdjustment ?? 0 }); }}
                onBlur={() => { const converted = calculatePriceFromTotal(variant.finalPrice, editorTaxRate); if (converted) setVariant(index, { finalPrice: converted.total, price: converted.base }); }} />
            </Field>
          </div>
          {data.permissions.view_costs && <div className="catalog-editor-price-help">
            <button type="button" className="button ghost" disabled={blocked || !suggestFinalPrice(variant.cost, editorTaxRate)} aria-label={`Usar sugerencia del 25% para la variante ${index + 1}`} onClick={() => setVariant(index, { autoPrice: true })}><RefreshCw size={14} /> Usar sugerencia del 25%</button>
            <small>{variant.autoPrice ? 'Se actualiza con el costo hasta que edites el precio.' : 'Precio manual; cambiar el costo no lo sobrescribe.'}</small>
          </div>}
          {variant.autoPrice && isValidCatalogAmount(variant.cost) && !suggestFinalPrice(variant.cost, editorTaxRate) && <ErrorNotice message="La sugerencia supera el límite permitido. Escribe un precio final manual dentro del rango." />}
          {variant.roundingAdjustment !== 0 && <small className="catalog-editor-rounding" role="status">Ajuste por redondeo de ITBIS: {money(variant.roundingAdjustment)}. El desglose muestra el precio final que se guardará.</small>}
          <details className="catalog-editor-disclosure"><summary>Ver desglose de ITBIS</summary><PriceDetails price={variant.price} taxRate={editorTaxRate} /></details>
          <details className="catalog-editor-disclosure" data-identification>
            <summary>Identificación y códigos <span>{variant.barcode_aliases.length ? `${variant.barcode_aliases.length + (variant.barcode ? 1 : 0)} códigos` : 'SKU y etiqueta'}</span></summary>
            <div className="catalog-editor-disclosure-body">
              <div className="catalog-editor-code-actions"><button type="button" className="button secondary" onClick={() => setCaptureIndex(index)}><Camera size={15} /> Leer etiqueta de esta variante</button><button type="button" className="button secondary" aria-label={`Escanear código para la variante ${index + 1}`} onClick={() => setScannerIndex(index)}><ScanLine size={15} /> Escanear código</button></div>
              <div className="catalog-sku-control"><Field label="SKU" hint={variant.autoSku ? 'Automático según marca, modelo y variante.' : 'SKU manual; se conserva al cambiar el producto.'}><input required maxLength={MAX_SKU_LENGTH} value={variant.sku} onChange={(event) => setVariant(index, { sku: event.target.value, autoSku: false })} /></Field><button type="button" className="button secondary" aria-label={`Generar SKU para la variante ${index + 1}`} onClick={() => setVariant(index, { sku: suggestedSku(variant, variants), autoSku: !variant.id })}><RefreshCw size={14} /> Generar SKU</button></div>
              <div className="catalog-barcode-control"><Field label="Código de barras" hint="Código principal para búsquedas y etiquetas."><input autoComplete="off" autoCapitalize="off" spellCheck={false} maxLength={80} value={variant.barcode} onChange={(event) => setVariant(index, { barcode: event.target.value })} /></Field><button type="button" className="button secondary" aria-label={`Generar código para la variante ${index + 1}`} onClick={() => setVariant(index, { barcode: generateInternalBarcode(variant.draftId, [...catalogVariants.filter((row) => row.id !== variant.id).flatMap(getVariantBarcodes), ...variants.filter((row) => row.draftId !== variant.draftId).flatMap(getVariantBarcodes)]) })}><Barcode size={14} /> Generar código interno</button></div>
              <div className="catalog-editor-aliases"><span>Códigos del fabricante</span><small>Conserva el código interno y añade códigos del producto, sin números de serie o lote.</small>
                {variant.barcode_aliases.map((code, aliasIndex) => <div className="catalog-editor-alias" key={aliasIndex}><input aria-label={`Código adicional ${aliasIndex + 1} de la variante ${index + 1}`} required autoComplete="off" autoCapitalize="off" spellCheck={false} maxLength={80} value={code} onChange={(event) => setVariant(index, { barcode_aliases: variant.barcode_aliases.map((item, i) => i === aliasIndex ? event.target.value : item) })} /><button className="icon-button" type="button" aria-label={`Quitar código adicional ${aliasIndex + 1} de la variante ${index + 1}`} onClick={() => setVariant(index, { barcode_aliases: variant.barcode_aliases.filter((_, i) => i !== aliasIndex) })}><X size={16} /></button></div>)}
                <button type="button" className="button ghost" disabled={variant.barcode_aliases.length >= MAX_BARCODE_ALIASES} onClick={() => setVariant(index, { barcode_aliases: [...variant.barcode_aliases, ''] })}><Plus size={14} /> Añadir código del fabricante</button>
              </div>
            </div>
          </details>
          <details className="catalog-editor-disclosure" data-stock-settings><summary>Inventario y reposición <span>{variant.id ? 'Mínimo y objetivo' : 'Existencias iniciales'}</span></summary>
            <div className="catalog-editor-disclosure-body form-grid">
              {!variant.id && <Field label="Existencias iniciales" hint="0 si registrarás la recepción en Compras."><input required type="number" min={0} max={999999} step={1} value={Number.isFinite(variant.opening_quantity) ? variant.opening_quantity : ''} onChange={(event) => setVariant(index, { opening_quantity: event.target.valueAsNumber })} /></Field>}
              <Field label="Stock mínimo"><input required type="number" min={0} max={999999} step={1} value={Number.isFinite(variant.min_stock) ? variant.min_stock : ''} onChange={(event) => setVariant(index, { min_stock: event.target.valueAsNumber })} /></Field>
              <Field label="Objetivo de reposición"><input required type="number" min={0} max={999999} step={1} value={Number.isFinite(variant.reorder_target) ? variant.reorder_target : ''} onChange={(event) => setVariant(index, { reorder_target: event.target.valueAsNumber })} /></Field>
            </div>
          </details>
          {variants.length > 1 && <button className="button ghost danger-text" type="button" onClick={() => setVariants((rows) => rows.filter((_, i) => index !== i))}><Trash2 size={15} /> Quitar variante</button>}
        </fieldset>)}
        <details className="catalog-editor-disclosure" data-product-options><summary>Fotos y más información <span>Opcional</span></summary><div className="catalog-editor-disclosure-body">
          <ProductImagesEditor productId={product?.id} images={images} onChange={setImages} disabled={busy} onBusyChange={setUploading} />
          <Field label="Garantía (meses)" hint="0 significa que no incluye garantía comercial."><input type="number" required min={0} max={120} step={1} disabled={blocked} value={Number.isFinite(warranty) ? warranty : ''} onChange={(event) => setWarranty(event.target.valueAsNumber)} /></Field>
          <Field label="Descripción"><textarea maxLength={2000} disabled={blocked} value={description} onChange={(event) => setDescription(event.target.value)} /></Field>
          <label className="catalog-label-check"><input type="checkbox" checked={openLabel} disabled={blocked} onChange={(event) => setOpenLabel(event.target.checked)} /> Abrir la etiqueta de la primera variante al guardar</label>
        </div></details>
        <ErrorNotice message={validation || error} />
        {(validation || error).includes('ITBIS') && <button type="button" className="button secondary" disabled={busy || refreshing} onClick={() => { void refresh().then(() => { setValidation(''); clearError(); }).catch(() => setValidation('No pudimos actualizar los datos. Vuelve a intentar.')); }}>Actualizar tasa y datos</button>}
        <div className="modal-footer catalog-editor-footer"><button className="button secondary" type="button" disabled={busy || uploading} onClick={onClose}>Cancelar</button><button className="button primary" disabled={blocked || taxRateChanged}>{busy ? 'Guardando…' : 'Guardar producto'}</button></div>
      </form>
      {scannerIndex !== null && <BarcodeScanner title="Código de la variante" onDetected={(value) => { addScannedBarcode(scannerIndex, value); }} onClose={() => setScannerIndex(null)} />}
      {captureIndex !== null && <ProductLabelCapture currentVariantId={variants[captureIndex]?.id} products={data.products} variants={data.variants} onClose={() => setCaptureIndex(null)} onApply={(suggestions) => applyLabel(captureIndex, suggestions)} onExisting={(variantId) => { setCaptureIndex(null); setPendingExisting(variantId); }} />}
      {pendingExisting && <Modal title="Producto reconocido" onClose={() => setPendingExisting(null)}><p>Este código ya corresponde a <strong>{knownProduct ? `${knownProduct.brand} ${knownProduct.model}` : 'un producto del inventario'}</strong>{knownVariant ? ` · ${knownVariant.name}` : ''}.</p><p>Tu borrador no se ha guardado. Puedes conservarlo o abrir la ficha existente.</p><div className="modal-footer"><button className="button secondary" type="button" onClick={() => setPendingExisting(null)}>Conservar borrador</button>{onOpenExisting && <button type="button" className="button primary" onClick={() => { const id = pendingExisting; setPendingExisting(null); onOpenExisting(id); }}>Abrir producto existente</button>}</div></Modal>}
    </Modal>
  );
}
