import { test, expect, type BrowserContext, type Page } from '@playwright/test';

const csp = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'";
const origin = 'http://127.0.0.1:4178';
const releaseStalledRoutes = new WeakMap<BrowserContext, () => void>();

test.afterEach(async ({ context, page }) => {
  // Cancellation deliberately leaves language responses pending. Release and
  // drain those route handlers before Playwright starts another test/context.
  if (!page.isClosed()) await page.evaluate(() => window.__labelAbort?.());
  releaseStalledRoutes.get(context)?.();
  releaseStalledRoutes.delete(context);
  await context.unrouteAll({ behavior: 'wait' });
});

declare global {
  interface Window {
    __readLabel: (data: string, cancel?: boolean) => Promise<unknown>;
    __labelAbort: () => void;
    __labelViolations: string[];
    __labelWorkers: { started: number; stopped: number };
  }
}

async function harness(context: BrowserContext, page: Page, stallLanguage = false) {
  const unexpected: string[] = [];
  const resources: string[] = [];
  let releaseLanguages = () => {};
  const languageGate = new Promise<void>((resolve) => { releaseLanguages = resolve; });
  releaseStalledRoutes.set(context, releaseLanguages);
  await context.addInitScript(() => {
    window.__labelViolations = [];
    window.__labelWorkers = { started: 0, stopped: 0 };
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) { super(url, options); window.__labelWorkers.started++; }
      terminate() { window.__labelWorkers.stopped++; super.terminate(); }
    };
    document.addEventListener('securitypolicyviolation', (event) => window.__labelViolations.push(`${event.violatedDirective}: ${event.blockedURI}`));
  });
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) { unexpected.push(url.origin); await route.abort(); return; }
    resources.push(url.pathname);
    if (url.pathname === '/__label-test') {
      await route.fulfill({ contentType: 'text/html', headers: { 'content-security-policy': csp }, body: '<!doctype html><html><body><h1>Local label OCR test</h1><script type="module" src="/__label-entry.js"></script></body></html>' });
      return;
    }
    if (url.pathname === '/__label-entry.js') {
      await route.fulfill({ contentType: 'application/javascript', headers: { 'content-security-policy': csp }, body: `import {readProductLabelPhoto} from '/src/lib/labelOcr.ts';
        window.__readLabel = async (data) => {
          const bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0));
          const controller=new AbortController(); window.__labelAbort=()=>controller.abort();
          try {return await readProductLabelPhoto(new File([bytes],'label.png',{type:'image/png'}),{signal:controller.signal});}
          catch(e){return {error:e.name,message:e.message};}
        };` });
      return;
    }
    if (stallLanguage && url.pathname.endsWith('.traineddata.gz')) {
      await languageGate;
      // The worker has already been terminated. Do not start a route.fetch
      // after cancellation; finishing the held response is only test cleanup.
      try { await route.abort(); } catch (cause) {
        if (!(cause instanceof Error) || !/aborted|closed|already handled|Test ended/i.test(cause.message)) throw cause;
      }
      return;
    }
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': csp } });
  });
  await page.goto('/__label-test');
  await page.waitForFunction(() => typeof window.__readLabel === 'function');
  return { unexpected, resources };
}

async function labelPhoto(page: Page, brand: boolean, capacity: boolean) {
  return page.evaluate(({ brand, capacity }) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1600; canvas.height = 1200;
    const context = canvas.getContext('2d')!;
    context.fillStyle = 'white'; context.fillRect(0, 0, 1600, 1200);
    context.fillStyle = 'black'; context.font = 'bold 70px Arial';
    const lines = [brand ? 'HISENSE' : 'Modelo', brand ? 'Modelo: AC122CE' : 'AC122CE', 'Color: BLANCO', 'Aire acondicionado', ...(capacity ? ['Capacidad: 12,000 BTU/h'] : []), 'Refrigerante: R410A', 'Batch NO. K-83PZ'];
    lines.forEach((line, index) => context.fillText(line, 70, 100 + index * 110));
    // Standard EAN-13 encoding, with no printed digits: the code must actually
    // be decoded from bars rather than recovered by OCR from a numeric caption.
    const code = '6946087393113';
    const left = ['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
    const parity = ['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'][Number(code[0])]!;
    const inverse = (value: string) => [...value].map((bit) => bit === '0' ? '1' : '0').join('');
    let bits = '101';
    for (let i = 1; i <= 6; i++) { const pattern = left[Number(code[i])]!; bits += parity[i - 1] === 'L' ? pattern : [...inverse(pattern)].reverse().join(''); }
    bits += '01010';
    for (let i = 7; i <= 12; i++) bits += inverse(left[Number(code[i])]!);
    bits += '101';
    [...bits].forEach((bit, index) => { if (bit === '1') context.fillRect(150 + index * 10, 920, 10, 200); });
    return canvas.toDataURL('image/png').split(',')[1]!;
  }, { brand, capacity });
}

test('actual local OCR and EAN decoding run under the production WASM-only CSP without external requests', async ({ context, page }) => {
  test.setTimeout(90_000);
  const { unexpected, resources } = await harness(context, page);
  expect(resources.some((path) => path.includes('label-ocr-v1'))).toBe(false);
  const image = await labelPhoto(page, true, true);
  const result = await page.evaluate((data) => window.__readLabel(data), image);
  expect(result).toMatchObject({ suggestions: { brand: 'Hisense', model: 'AC122CE', category: 'air_conditioner', variantName: '12,000 BTU · Blanco', barcode: '6946087393113' } });
  expect(resources).toContain('/assets/label-ocr-v1/worker.min.js');
  expect(resources.some((path) => path.endsWith('.wasm'))).toBe(true);
  expect(resources).toContain('/assets/label-ocr-v1/eng.traineddata.gz');
  expect(resources).toContain('/assets/label-ocr-v1/spa.traineddata.gz');
  expect(unexpected).toEqual([]);
  expect(await page.evaluate(() => window.__labelViolations)).toEqual([]);
  expect(await page.evaluate(() => window.__labelWorkers)).toEqual({ started: 1, stopped: 1 });
});

test('actual photo reading does not infer absent brand or BTU from the model number', async ({ context, page }) => {
  test.setTimeout(90_000);
  const { unexpected } = await harness(context, page);
  const image = await labelPhoto(page, false, false);
  const result = await page.evaluate((data) => window.__readLabel(data), image) as { suggestions: Record<string, string> };
  expect(result.suggestions.model).toBe('AC122CE');
  expect(result.suggestions.variantName).toBe('Blanco');
  expect(result.suggestions.brand).toBeUndefined();
  expect(result.suggestions.barcode).toBe('6946087393113');
  expect(unexpected).toEqual([]);
});

test('cancelling while local language resources load terminates the worker immediately', async ({ context, page }) => {
  test.setTimeout(45_000);
  const { resources } = await harness(context, page, true);
  const image = await labelPhoto(page, false, false);
  const reading = page.evaluate((data) => window.__readLabel(data), image);
  await expect.poll(() => resources.some((path) => path.endsWith('.traineddata.gz'))).toBe(true);
  await page.evaluate(() => window.__labelAbort());
  expect(await reading).toMatchObject({ error: 'AbortError' });
  expect(await page.evaluate(() => window.__labelWorkers)).toEqual({ started: 1, stopped: 1 });
});
