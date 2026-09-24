import { supabase } from './supabase';

export const PRODUCT_MEDIA_BUCKET = 'retail-product-media';
export const MAX_PRODUCT_IMAGES = 8;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const SIGNED_URL_SECONDS = 3600;
const CACHE_LIFETIME_MS = 50 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXTENSIONS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export type ProductImageReference = { kind: 'https'; url: string } | { kind: 'storage'; path: string } | { kind: 'legacy'; productId: string; index: number };

export function parseProductImageSource(source: string | null | undefined): ProductImageReference | null {
  if (!source) return null;
  if (source.startsWith('storage:')) {
    const path = source.slice(8);
    if (!/^[a-zA-Z0-9][a-zA-Z0-9/_.-]*\.(?:jpe?g|png|webp)$/i.test(path) || path.split('/').some(part => part === '.' || part === '..' || !part)) return null;
    return { kind: 'storage', path };
  }
  if (source.startsWith('legacy:')) {
    const [, productId, index] = source.split(':');
    if (source.split(':').length !== 3 || !productId || !UUID.test(productId) || !index || !/^\d+$/.test(index)) return null;
    const numericIndex = Number(index);
    return Number.isSafeInteger(numericIndex) && numericIndex >= 0 ? { kind: 'legacy', productId, index: numericIndex } : null;
  }
  try {
    const url = new URL(source);
    return url.protocol === 'https:' && !url.username && !url.password && !/\.svgz?$/i.test(url.pathname) ? { kind: 'https', url: url.href } : null;
  } catch { return null; }
}

export interface ProductMediaClient {
  getUserId: () => Promise<string | null>;
  getLegacyImage: (productId: string, index: number) => Promise<unknown>;
  createSignedUrl: (path: string, seconds: number) => Promise<string | null>;
}

const defaultClient: ProductMediaClient = {
  async getUserId() {
    if (!supabase) return null;
    const { data, error } = await supabase.auth.getSession();
    return error ? null : data.session?.user.id ?? null;
  },
  async getLegacyImage(productId, index) {
    if (!supabase) return null;
    const { data, error } = await supabase.rpc('retail_product_image', { p_product_id: productId, p_index: index });
    return error ? null : data;
  },
  async createSignedUrl(path, seconds) {
    if (!supabase) return null;
    const { data, error } = await supabase.storage.from(PRODUCT_MEDIA_BUCKET).createSignedUrl(path, seconds);
    return error ? null : data?.signedUrl ?? null;
  },
};

function allowedLegacyImage(value: unknown): value is string {
  return typeof value === 'string' && /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
}

/** Private URLs stay in memory, expire before their signatures, and are isolated by user. */
export function createProductMediaResolver(client: ProductMediaClient = defaultClient, now: () => number = Date.now) {
  const cache = new Map<string, { url: string; expires: number }>();
  const pending = new Map<string, Promise<string | null>>();
  let account: string | null = null;
  let generation = 0;
  let identityRequest = 0;
  let lastIdentity = 0;

  function clear() { cache.clear(); pending.clear(); generation++; }

  async function resolve(productId: string, source: string | null | undefined): Promise<string | null> {
    const reference = parseProductImageSource(source);
    if (!reference) return null;
    if (reference.kind === 'https') return reference.url;
    if (reference.kind === 'legacy' && reference.productId.toLowerCase() !== productId.toLowerCase()) return null;
    try {
      const identity = ++identityRequest;
      const userId = await client.getUserId();
      if (identity < lastIdentity && userId !== account) return null;
      lastIdentity = Math.max(lastIdentity, identity);
      if (userId !== account) { clear(); account = userId; }
      if (!userId) return null;
      const key = `${userId}:${source}`;
      const cached = cache.get(key);
      if (cached && cached.expires > now()) return cached.url;
      cache.delete(key);
      const existing = pending.get(key);
      if (existing) return existing;
      const requestGeneration = generation;
      const request = (async () => {
        let url: string | null = null;
        if (reference.kind === 'legacy') {
          const response = await client.getLegacyImage(reference.productId, reference.index);
          if (allowedLegacyImage(response)) url = response;
        } else {
          const response = await client.createSignedUrl(reference.path, SIGNED_URL_SECONDS);
          const signed = parseProductImageSource(response);
          if (signed?.kind === 'https') url = signed.url;
        }
        if (requestGeneration !== generation || userId !== account) return null;
        if (url) {
          // Bound retained base64 data when browsing a large inherited catalog.
          for (const [entryKey, entry] of cache) if (entry.expires <= now()) cache.delete(entryKey);
          let characters = url.length;
          cache.forEach(entry => { characters += entry.url.length; });
          while (cache.size && (cache.size >= 100 || characters > 24 * 1024 * 1024)) {
            const oldestKey = cache.keys().next().value;
            if (!oldestKey) break;
            characters -= cache.get(oldestKey)?.url.length ?? 0; cache.delete(oldestKey);
          }
          if (url.length <= 24 * 1024 * 1024) cache.set(key, { url, expires: now() + CACHE_LIFETIME_MS });
        }
        return url;
      })().catch(() => null);
      pending.set(key, request);
      try { return await request; }
      finally { if (pending.get(key) === request) pending.delete(key); }
    } catch { return null; }
  }

  return { resolve, clear };
}

const productMediaResolver = createProductMediaResolver();
export const resolveProductImage = productMediaResolver.resolve;

export function validateProductImageFile(file: Pick<File, 'size' | 'type'>): string | null {
  if (!Object.hasOwn(EXTENSIONS, file.type)) return 'Selecciona una imagen JPG, PNG o WEBP. No se admiten archivos SVG.';
  if (!file.size) return 'El archivo está vacío. Selecciona otra imagen.';
  if (file.size > MAX_IMAGE_BYTES) return 'Cada imagen debe pesar como máximo 5 MB.';
  return null;
}

async function hasValidSignature(file: File): Promise<boolean> {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (file.type === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (file.type === 'image/png') return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte);
  return file.type === 'image/webp' && [0x52, 0x49, 0x46, 0x46].every((byte, index) => bytes[index] === byte) && [0x57, 0x45, 0x42, 0x50].every((byte, index) => bytes[index + 8] === byte);
}

export type ProductImageUploader = (path: string, file: File, options: { contentType: string; upsert: false }) => Promise<void>;
const defaultUploader: ProductImageUploader = async (path, file, options) => {
  if (!supabase) throw new Error('No hay conexión configurada.');
  const { error } = await supabase.storage.from(PRODUCT_MEDIA_BUCKET).upload(path, file, options);
  if (error) throw error;
};

export async function uploadProductImage(file: File, productId?: string, uploader: ProductImageUploader = defaultUploader): Promise<string> {
  const validation = validateProductImageFile(file);
  if (validation) throw new Error(validation);
  if (productId && !UUID.test(productId)) throw new Error('No se pudo identificar el producto de esta imagen.');
  let validSignature: boolean;
  try { validSignature = await hasValidSignature(file); }
  catch { throw new Error('No pudimos leer el archivo. Selecciónalo nuevamente.'); }
  if (!validSignature) throw new Error('El contenido del archivo no corresponde a una imagen JPG, PNG o WEBP válida.');
  const path = `${productId || crypto.randomUUID()}/${crypto.randomUUID()}.${EXTENSIONS[file.type]}`;
  try { await uploader(path, file, { contentType: file.type, upsert: false }); }
  catch { throw new Error('No pudimos subir la imagen. Revisa tu conexión y tus permisos, y vuelve a intentar.'); }
  return `storage:${path}`;
}

export function moveProductImage(images: string[], from: number, to: number): string[] {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from >= images.length || to < 0 || to >= images.length) return [...images];
  const result = [...images]; const item = result.splice(from, 1)[0];
  if (item !== undefined) result.splice(to, 0, item);
  return result;
}
