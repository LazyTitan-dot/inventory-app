import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import { ArrowLeft, ArrowRight, Link, Trash2, Upload } from 'lucide-react';
import { MAX_PRODUCT_IMAGES, moveProductImage, parseProductImageSource, uploadProductImage, validateProductImageFile } from '../lib/media';
import { ProductImage } from './ProductImage';
import { ErrorNotice } from './ui';

export interface ProductImagesEditorProps {
  productId?: string;
  images: string[];
  onChange: (images: string[]) => void;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}

export function ProductImagesEditor({ productId, images, onChange, disabled = false, onBusyChange }: ProductImagesEditorProps) {
  const id = useId();
  const [link, setLink] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const uploadGeneration = useRef(0);
  const uploading = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => () => { uploadGeneration.current++; }, []);
  const blocked = disabled || busy;

  function addLink() {
    if (blocked) return;
    setError('');
    const reference = parseProductImageSource(link.trim());
    if (reference?.kind !== 'https') { setError('Agrega un enlace seguro que comience con https://. No pegues imágenes codificadas ni archivos SVG.'); return; }
    if (/\.svg(?:$|[?#])/i.test(reference.url)) { setError('No se admiten imágenes SVG. Usa un archivo JPG, PNG o WEBP.'); return; }
    if (images.length >= MAX_PRODUCT_IMAGES) { setError('Puedes guardar hasta ocho imágenes por producto.'); return; }
    if (images.includes(reference.url)) { setError('Ese enlace ya está en la lista.'); return; }
    onChange([...images, reference.url]); setLink('');
  }

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = '';
    if (!files.length || disabled || uploading.current) return;
    setError('');
    if (images.length + files.length > MAX_PRODUCT_IMAGES) { setError(`Puedes agregar ${Math.max(0, MAX_PRODUCT_IMAGES - images.length)} imágenes más. El máximo por producto es ocho.`); return; }
    const invalid = files.map(file => validateProductImageFile(file)).find(Boolean);
    if (invalid) { setError(invalid); return; }
    const generation = ++uploadGeneration.current;
    uploading.current = true; setBusy(true); onBusyChange?.(true);
    const added: string[] = [];
    try {
      for (const [index, file] of files.entries()) {
        if (generation !== uploadGeneration.current) return;
        setProgress(`Subiendo imagen ${index + 1} de ${files.length}…`);
        const source = await uploadProductImage(file, productId);
        if (generation !== uploadGeneration.current) return;
        added.push(source);
        onChange([...images, ...added]);
      }
      setProgress(`${added.length} ${added.length === 1 ? 'imagen subida' : 'imágenes subidas'}. Guarda el producto para conservar los cambios.`);
    } catch (cause) {
      if (generation === uploadGeneration.current) {
        const message = cause instanceof Error ? cause.message : 'No pudimos subir la imagen. Vuelve a intentar.';
        setError(`${message}${added.length ? ` Se conservaron ${added.length} imágenes que sí se subieron.` : ''}`); setProgress('');
      }
    } finally {
      uploading.current = false;
      if (generation === uploadGeneration.current) { setBusy(false); onBusyChange?.(false); }
    }
  }

  return <section className="product-images-editor stack" aria-labelledby={`${id}-title`} aria-busy={busy}>
    <div className="toolbar" style={{ justifyContent: 'space-between' }}><h3 id={`${id}-title`} style={{ margin: 0 }}>Imágenes del producto</h3><span className="muted">{images.length} / {MAX_PRODUCT_IMAGES}</span></div>
    <p className="muted" id={`${id}-help`}>JPG, PNG o WEBP de hasta 5 MB. La primera imagen se usa como portada. Las imágenes existentes se conservan hasta que las quites.</p>
    {images.length > 0 && <ol aria-label="Imágenes seleccionadas, en orden" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(145px, 1fr))', gap: 12, padding: 0, margin: 0, listStyle: 'none' }}>{images.map((source, index) => <li key={`${source}-${index}`} style={{ minWidth: 0, border: '1px solid var(--line, #e5ece7)', borderRadius: 10, padding: 10 }}>
      <div style={{ display: 'grid', height: 112, background: 'var(--surface-subtle, #f7faf8)', borderRadius: 7 }}><ProductImage productId={productId ?? ''} source={source} alt={`Imagen ${index + 1} del producto`} /></div>
      <p className="muted" style={{ margin: '9px 0', fontSize: 11 }}>{index === 0 ? 'Portada' : `Imagen ${index + 1}`}{source.startsWith('legacy:') ? ' · Existente' : source.startsWith('storage:') ? ' · Archivo privado' : ' · Enlace'}</p>
      <div className="toolbar" style={{ gap: 3, justifyContent: 'space-between' }}><button className="icon-button" type="button" disabled={blocked || index === 0} aria-label={`Mover imagen ${index + 1} antes`} onClick={() => onChange(moveProductImage(images, index, index - 1))}><ArrowLeft size={16} /></button><button className="icon-button" type="button" disabled={blocked || index === images.length - 1} aria-label={`Mover imagen ${index + 1} después`} onClick={() => onChange(moveProductImage(images, index, index + 1))}><ArrowRight size={16} /></button><button className="icon-button" type="button" disabled={blocked} aria-label={`Quitar imagen ${index + 1}`} onClick={() => { onChange(images.filter((_, imageIndex) => imageIndex !== index)); setError(''); }}><Trash2 size={16} /></button></div>
    </li>)}</ol>}
    <div className="field"><button className="button secondary" type="button" disabled={blocked || images.length >= MAX_PRODUCT_IMAGES} onClick={() => fileInput.current?.click()}><Upload size={16} aria-hidden="true"/>Subir imágenes desde este dispositivo</button><input ref={fileInput} id={`${id}-file`} type="file" hidden aria-label="Seleccionar imágenes del producto" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" multiple disabled={blocked || images.length >= MAX_PRODUCT_IMAGES} aria-describedby={`${id}-help`} onChange={event => void upload(event)} /></div>
    <div className="field"><label htmlFor={`${id}-link`}>Agregar enlace de imagen HTTPS</label><div className="toolbar" style={{ gap: 8 }}><input id={`${id}-link`} type="text" inputMode="url" autoComplete="url" maxLength={2048} placeholder="https://ejemplo.com/imagen.jpg" value={link} disabled={blocked || images.length >= MAX_PRODUCT_IMAGES} onChange={event => setLink(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addLink(); } }} style={{ flex: '1 1 220px', minWidth: 0 }} /><button type="button" className="button secondary" disabled={blocked || images.length >= MAX_PRODUCT_IMAGES || !link.trim()} onClick={addLink}><Link size={16} />Agregar enlace</button></div></div>
    {progress && <p role="status" aria-live="polite" className="muted">{progress}</p>}<ErrorNotice message={error} />
  </section>;
}
