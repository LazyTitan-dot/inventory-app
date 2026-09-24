import { useCallback, useEffect, useState } from 'react';
import { ImageOff, Image as ImageIcon } from 'lucide-react';
import { resolveProductImage } from '../lib/media';

export interface ProductImageProps {
  productId: string;
  source: string | null | undefined;
  alt?: string;
  className?: string;
}

export function ProductImage(props: ProductImageProps) {
  // Reset a previous image/error immediately when a row receives a different source.
  return <LazyProductImage key={`${props.productId}:${props.source ?? ''}`} {...props} />;
}

function LazyProductImage({ productId, source, alt = 'Imagen del producto', className = '' }: ProductImageProps) {
  const [visible, setVisible] = useState(false);
  const [result, setResult] = useState<{ url: string | null; resolved: boolean }>({ url: null, resolved: false });
  const [failed, setFailed] = useState(false);
  const observe = useCallback((node: HTMLSpanElement | null) => {
    if (!node) return;
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '160px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    let current = true;
    void resolveProductImage(productId, source).then(url => { if (current) setResult({ url, resolved: true }); });
    return () => { current = false; };
  }, [visible, productId, source]);
  const unavailable = failed || (result.resolved && !result.url);
  return <span ref={observe} className={`product-image ${className}`} style={{ display: 'inline-grid', placeItems: 'center', overflow: 'hidden' }} aria-busy={Boolean(source && visible && !result.resolved)}>
    {result.url && !failed ? <img src={result.url} alt={alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <span role={alt ? 'img' : undefined} aria-label={alt ? `${alt}: ${unavailable ? 'no disponible' : source ? 'pendiente de cargar' : 'sin imagen'}` : undefined} aria-hidden={!alt || undefined} style={{ display: 'grid', placeItems: 'center', minHeight: 28, color: 'var(--muted, #839488)' }}>{unavailable && source ? <ImageOff size={22} aria-hidden="true" /> : <ImageIcon size={22} aria-hidden="true" />}</span>}
  </span>;
}
