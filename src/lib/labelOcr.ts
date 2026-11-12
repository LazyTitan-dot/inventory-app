import { parseProductLabel, type ProductLabelResult } from './productLabel';

export interface LabelReadOptions {
  signal: AbortSignal;
  onProgress?: (progress: number) => void;
}

const OCR_ROOT = '/assets/label-ocr-v1';
const abortError = () => new DOMException('Lectura cancelada.', 'AbortError');

async function readCanvas(file: File, signal: AbortSignal): Promise<HTMLCanvasElement> {
  if (!/^image\/(?:jpeg|png|webp)$/.test(file.type) || file.size > 15 * 1024 * 1024)
    throw new Error('Elige una foto JPG, PNG o WebP de hasta 15 MB.');
  if (signal.aborted) throw abortError();
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    image.src = url;
    await image.decode();
    if (signal.aborted) throw abortError();
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 45_000_000)
      throw new Error('La foto es demasiado grande. Acerca la etiqueta y toma otra foto.');
    const scale = Math.min(1, 2200 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('No pudimos preparar la foto.');
    context.fillStyle = 'white';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    image.src = '';
    URL.revokeObjectURL(url);
  }
}

async function readProductBarcodes(canvas: HTMLCanvasElement, signal: AbortSignal): Promise<string[]> {
  const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
    import('@zxing/browser'), import('@zxing/library'),
  ]);
  if (signal.aborted) throw abortError();
  const reader = new BrowserMultiFormatReader(new Map<import('@zxing/library').DecodeHintType, unknown>([
    [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A]],
    [DecodeHintType.TRY_HARDER, true],
  ]));
  const result: string[] = [];
  const strip = document.createElement('canvas');
  const context = strip.getContext('2d');
  if (!context) return result;
  try {
    // A label can contain both a unit tracking code and a lower EAN/UPC.
    // Overlapping strips find product codes away from the image's centre.
    const crops = [{ y: 0, height: canvas.height }, ...[0, .2, .4, .6, .8].map((offset) => ({ y: Math.floor(canvas.height * offset), height: Math.min(Math.ceil(canvas.height * .3), canvas.height - Math.floor(canvas.height * offset)) }))];
    for (const crop of crops) {
      if (signal.aborted) throw abortError();
      strip.width = canvas.width;
      strip.height = crop.height;
      context.drawImage(canvas, 0, crop.y, canvas.width, crop.height, 0, 0, strip.width, strip.height);
      try { result.push(reader.decodeFromCanvas(strip).getText()); } catch { /* Text recognition may still read a printed GTIN. */ }
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    return result;
  } finally {
    strip.width = strip.height = 0;
  }
}

/**
 * Own the pinned Tesseract 6 browser worker from its creation, including while
 * language files load. This small protocol adapter permits immediate cancel;
 * createWorker() itself doesn't expose its worker until initialization ends.
 * All scripts, WASM and language data are copied from locked npm packages by
 * prepare-label-ocr.mjs. No photo or recognized text leaves this browser.
 */
async function recognize(canvas: HTMLCanvasElement, { signal, onProgress }: LabelReadOptions): Promise<string> {
  if (signal.aborted) throw abortError();
  const worker = new Worker(`${OCR_ROOT}/worker.min.js`, { name: 'product-label-ocr' });
  const pending = new Map<string, { resolve: (data: unknown) => void; reject: (cause: Error | DOMException) => void }>();
  let nextId = 0;
  let stopped: Error | DOMException | null = null;
  const stop = (cause: Error | DOMException) => {
    stopped = cause;
    worker.terminate();
    pending.forEach((job) => job.reject(cause));
    pending.clear();
  };
  const cancel = () => stop(abortError());
  signal.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(() => stop(new Error('La lectura tardó demasiado. Intenta con una foto más cercana y nítida.')), 90_000);
  worker.onerror = (event) => { event.preventDefault(); stop(new Error('No pudimos iniciar la lectura local. Recarga la página y vuelve a intentar.')); };
  worker.onmessage = (event: MessageEvent<{ jobId: string; status: string; data: unknown }>) => {
    if (signal.aborted || stopped) return;
    const { jobId, status, data } = event.data;
    if (status === 'progress') {
      const progress = data as { status?: string; progress?: number };
      if (progress.status === 'recognizing text' && typeof progress.progress === 'number') onProgress?.(.25 + progress.progress * .7);
      return;
    }
    const job = pending.get(jobId);
    if (!job) return;
    pending.delete(jobId);
    if (status === 'resolve') job.resolve(data);
    else job.reject(new Error('No pudimos leer la foto. Prueba con una etiqueta bien iluminada y enfocada.'));
  };
  const run = (action: string, payload: object): Promise<unknown> => {
    if (signal.aborted) return Promise.reject(abortError());
    if (stopped) return Promise.reject(stopped);
    const jobId = `label-${++nextId}`;
    return new Promise((resolve, reject) => {
      pending.set(jobId, { resolve, reject });
      worker.postMessage({ workerId: 'product-label', jobId, action, payload });
    });
  };
  try {
    await run('load', { options: { lstmOnly: true, corePath: new URL(OCR_ROOT, window.location.origin).href, logging: false } });
    await run('loadLanguage', { langs: 'eng+spa', options: { langPath: new URL(OCR_ROOT, window.location.origin).href, cacheMethod: 'none', gzip: true, lstmOnly: true } });
    await run('initialize', { langs: 'eng+spa', oem: 1, config: {} });
    await run('setParameters', { params: { tessedit_pageseg_mode: '11', preserve_interword_spaces: '1', user_defined_dpi: '300' } });
    onProgress?.(.25);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('No pudimos preparar la foto.')), 'image/png'));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const data = await run('recognize', { image: bytes, options: {}, output: { text: true } }) as { text?: string };
    return data.text ?? '';
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', cancel);
    if (!stopped) worker.terminate();
    pending.clear();
  }
}

export async function readProductLabelPhoto(file: File, options: LabelReadOptions): Promise<ProductLabelResult> {
  const canvas = await readCanvas(file, options.signal);
  try {
    options.onProgress?.(.05);
    const codes = await readProductBarcodes(canvas, options.signal);
    const text = await recognize(canvas, options);
    if (options.signal.aborted) throw abortError();
    options.onProgress?.(1);
    return parseProductLabel(text, codes);
  } finally {
    canvas.width = canvas.height = 0;
  }
}
