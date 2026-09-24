import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ProductImage } from '../components/ProductImage';
import { ProductImagesEditor } from '../components/ProductImagesEditor';
import {
  createProductMediaResolver,
  MAX_IMAGE_BYTES,
  moveProductImage,
  parseProductImageSource,
  uploadProductImage,
  validateProductImageFile,
  type ProductMediaClient,
  type ProductImageUploader,
} from './media';

vi.mock('./supabase', () => ({ supabase: null }));

const productId = '399c16df-5ec9-40ca-b494-62c6b9332f93';
const otherId = '8673dd22-53cf-4bfe-a4a5-804fb8e0817f';
const objectPath = `${productId}/c7c9f0c3-51db-4dc2-bdeb-cb6ba3d8f39a.jpg`;
const storageSource = `storage:${objectPath}`;
const legacySource = `legacy:${productId}:0`;
const signedUrl = 'https://project.supabase.co/storage/v1/object/sign/image.jpg?token=test';
const legacyImage = 'data:image/png;base64,iVBORw0KGgo=';

function client() {
  return {
    getUserId: vi.fn<ProductMediaClient['getUserId']>().mockResolvedValue('user-a'),
    getLegacyImage: vi.fn<ProductMediaClient['getLegacyImage']>().mockResolvedValue(legacyImage),
    createSignedUrl: vi.fn<ProductMediaClient['createSignedUrl']>().mockResolvedValue(signedUrl),
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}
function file(type: 'image/jpeg' | 'image/png' | 'image/webp'): File {
  const headers = {
    'image/jpeg': [255, 216, 255, 224],
    'image/png': [137, 80, 78, 71, 13, 10, 26, 10],
    'image/webp': [82, 73, 70, 70, 20, 0, 0, 0, 87, 69, 66, 80],
  };
  return new File([new Uint8Array(headers[type])], 'upload', { type });
}

describe('image references and authorization', () => {
  it('accepts HTTPS references without authorizing a private resource', async () => {
    const adapter = client();
    const resolver = createProductMediaResolver(adapter);
    expect(await resolver.resolve(productId, 'https://images.example.test/fridge.jpg')).toBe(
      'https://images.example.test/fridge.jpg',
    );
    expect(adapter.getUserId).not.toHaveBeenCalled();
  });

  it.each([
    'http://images.example.test/a.jpg',
    'javascript:alert(1)',
    'data:image/png;base64,AA==',
    'https://user:secret@example.test/a.jpg',
    'https://example.test/image.svg?x=1',
    'storage:../private/image.jpg',
    'storage:/image.png',
    'storage:folder//image.webp',
    'storage:folder/image.svg',
    `legacy:${productId}:-1`,
  ])('rejects unsafe or unsupported source %s', (source) => {
    expect(parseProductImageSource(source)).toBeNull();
  });

  it('only requests inherited data for its matching product', async () => {
    const adapter = client();
    const resolver = createProductMediaResolver(adapter);
    expect(await resolver.resolve(otherId, legacySource)).toBeNull();
    expect(adapter.getLegacyImage).not.toHaveBeenCalled();
    expect(await resolver.resolve(productId, legacySource)).toBe(legacyImage);
    expect(adapter.getLegacyImage).toHaveBeenCalledWith(productId, 0);
  });

  it.each([
    'data:image/svg+xml;base64,PHN2Zz4=',
    'javascript:alert(1)',
    '<svg/>',
    'data:image/png;base64,invalid<svg>',
  ])('does not expose unsupported RPC content %s', (response) => {
    const adapter = client();
    adapter.getLegacyImage.mockResolvedValue(response);
    return expect(
      createProductMediaResolver(adapter).resolve(productId, legacySource),
    ).resolves.toBeNull();
  });

  it('does not request private media without a signed-in user', async () => {
    const adapter = client();
    adapter.getUserId.mockResolvedValue(null);
    const resolver = createProductMediaResolver(adapter);
    expect(await resolver.resolve(productId, storageSource)).toBeNull();
    expect(await resolver.resolve(productId, legacySource)).toBeNull();
    expect(adapter.getLegacyImage).not.toHaveBeenCalled();
    expect(adapter.createSignedUrl).not.toHaveBeenCalled();
  });

  it('silently falls back for missing or inaccessible media', async () => {
    const adapter = client();
    adapter.createSignedUrl.mockRejectedValue(new Error('not found'));
    const errorLog = vi.spyOn(console, 'error');
    expect(await createProductMediaResolver(adapter).resolve(productId, storageSource)).toBeNull();
    expect(errorLog).not.toHaveBeenCalled();
    errorLog.mockRestore();
  });
});

describe('private image cache', () => {
  it('signs for one hour and refreshes the cached URL after fifty minutes', async () => {
    let now = 1000;
    const adapter = client();
    const resolver = createProductMediaResolver(adapter, () => now);
    expect(await resolver.resolve(productId, storageSource)).toBe(signedUrl);
    expect(adapter.createSignedUrl).toHaveBeenCalledWith(objectPath, 3600);
    now += 49 * 60 * 1000;
    expect(await resolver.resolve(productId, storageSource)).toBe(signedUrl);
    expect(adapter.createSignedUrl).toHaveBeenCalledTimes(1);
    now += 60 * 1000;
    await resolver.resolve(productId, storageSource);
    expect(adapter.createSignedUrl).toHaveBeenCalledTimes(2);
  });

  it('coalesces simultaneous image requests for repeated product variants', async () => {
    const waiting = deferred<string | null>();
    const adapter = client();
    adapter.createSignedUrl.mockReturnValue(waiting.promise);
    const resolver = createProductMediaResolver(adapter);
    const a = resolver.resolve(productId, storageSource);
    const b = resolver.resolve(productId, storageSource);
    await Promise.resolve();
    expect(adapter.createSignedUrl).toHaveBeenCalledTimes(1);
    waiting.resolve(signedUrl);
    expect(await Promise.all([a, b])).toEqual([signedUrl, signedUrl]);
  });

  it('never shares cached URLs between accounts and discards an old in-flight URL', async () => {
    const waiting = deferred<string | null>();
    const adapter = client();
    adapter.createSignedUrl
      .mockReturnValueOnce(waiting.promise)
      .mockResolvedValueOnce(`${signedUrl}-new`);
    const resolver = createProductMediaResolver(adapter);
    const old = resolver.resolve(productId, storageSource);
    await Promise.resolve();
    adapter.getUserId.mockResolvedValue('user-b');
    expect(await resolver.resolve(productId, storageSource)).toBe(`${signedUrl}-new`);
    waiting.resolve(signedUrl);
    expect(await old).toBeNull();
    expect(await resolver.resolve(productId, storageSource)).toBe(`${signedUrl}-new`);
    expect(adapter.createSignedUrl).toHaveBeenCalledTimes(2);
  });

  it('does not restore an earlier account when its session lookup completes late', async () => {
    const session = deferred<string | null>();
    const adapter = client();
    adapter.getUserId.mockReturnValueOnce(session.promise).mockResolvedValueOnce('user-b');
    const resolver = createProductMediaResolver(adapter);
    const old = resolver.resolve(productId, storageSource);
    expect(await resolver.resolve(productId, storageSource)).toBe(signedUrl);
    session.resolve('user-a');
    expect(await old).toBeNull();
    expect(adapter.createSignedUrl).toHaveBeenCalledTimes(1);
  });

  it('does not cache missing images, so a later valid retry can display them', async () => {
    const adapter = client();
    adapter.createSignedUrl.mockResolvedValueOnce(null).mockResolvedValueOnce(signedUrl);
    const resolver = createProductMediaResolver(adapter);
    expect(await resolver.resolve(productId, storageSource)).toBeNull();
    expect(await resolver.resolve(productId, storageSource)).toBe(signedUrl);
  });

  it('drops private cached data when the session disappears', async () => {
    const adapter = client();
    const resolver = createProductMediaResolver(adapter);
    await resolver.resolve(productId, storageSource);
    adapter.getUserId.mockResolvedValue(null);
    expect(await resolver.resolve(productId, storageSource)).toBeNull();
    adapter.getUserId.mockResolvedValue('user-a');
    await resolver.resolve(productId, storageSource);
    expect(adapter.createSignedUrl).toHaveBeenCalledTimes(2);
  });
});

describe('product image uploads', () => {
  it('rejects empty, oversized and unsupported files before upload', () => {
    expect(validateProductImageFile({ type: 'image/png', size: 0 })).toMatch(/vacío/);
    expect(validateProductImageFile({ type: 'image/png', size: MAX_IMAGE_BYTES + 1 })).toMatch(
      /5 MB/,
    );
    expect(validateProductImageFile({ type: 'image/svg+xml', size: 100 })).toMatch(/SVG/);
    expect(validateProductImageFile({ type: 'image/png', size: MAX_IMAGE_BYTES })).toBeNull();
  });

  it.each(['image/jpeg', 'image/png', 'image/webp'] as const)(
    'uploads valid %s bytes under the product folder without overwrite',
    async (type) => {
      const uploader = vi.fn<ProductImageUploader>().mockResolvedValue(undefined);
      const image = file(type);
      const source = await uploadProductImage(image, productId, uploader);
      const parsed = parseProductImageSource(source);
      expect(parsed?.kind).toBe('storage');
      expect(source.startsWith(`storage:${productId}/`)).toBe(true);
      expect(uploader).toHaveBeenCalledWith(source.slice(8), image, {
        contentType: type,
        upsert: false,
      });
    },
  );

  it('supports an unsaved product with a generated UUID folder', async () => {
    const uploader = vi.fn<ProductImageUploader>().mockResolvedValue(undefined);
    const source = await uploadProductImage(file('image/png'), undefined, uploader);
    expect(source).toMatch(/^storage:[0-9a-f-]{36}\/[0-9a-f-]{36}\.png$/);
  });

  it('rejects a renamed SVG with a forged PNG content type without sending it', async () => {
    const uploader = vi.fn<ProductImageUploader>().mockResolvedValue(undefined);
    const disguised = new File(['<svg onload="alert(1)"></svg>'], 'looks-safe.png', {
      type: 'image/png',
    });
    await expect(uploadProductImage(disguised, productId, uploader)).rejects.toThrow(
      /contenido del archivo/,
    );
    expect(uploader).not.toHaveBeenCalled();
  });

  it('returns a safe Spanish failure without exposing storage error details', async () => {
    const uploader = vi
      .fn<ProductImageUploader>()
      .mockRejectedValue(new Error('secret.internal.token'));
    await expect(uploadProductImage(file('image/jpeg'), productId, uploader)).rejects.toThrow(
      'No pudimos subir la imagen. Revisa tu conexión y tus permisos, y vuelve a intentar.',
    );
  });

  it('preserves legacy references exactly when images are reordered', () => {
    const original = [legacySource, storageSource, 'https://images.example.test/a.jpg'];
    expect(moveProductImage(original, 0, 2)).toEqual([
      storageSource,
      'https://images.example.test/a.jpg',
      legacySource,
    ]);
    expect(original[0]).toBe(legacySource);
    expect(moveProductImage(original, 0, -1)).toEqual(original);
  });
});

describe('image component rendering', () => {
  it('does not put private references or remote URLs in image requests before visibility', () => {
    for (const source of [storageSource, legacySource, 'https://images.example.test/a.jpg']) {
      const html = renderToStaticMarkup(
        createElement(ProductImage, { productId, source, alt: 'Nevera blanca' }),
      );
      expect(html).not.toContain('<img');
      expect(html).not.toContain(source);
      expect(html).toContain('Nevera blanca');
    }
  });

  it('renders existing legacy images with accessible reorder/remove controls', () => {
    const html = renderToStaticMarkup(
      createElement(ProductImagesEditor, {
        productId,
        images: [legacySource, storageSource],
        onChange: () => undefined,
      }),
    );
    expect(html).toContain('Mover imagen 2 antes');
    expect(html).toContain('Quitar imagen 1');
    expect(html).toContain('Existente');
    expect(html).not.toContain(legacySource);
    expect(html).toContain('accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"');
  });
});
