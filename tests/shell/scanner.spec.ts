import type { Page } from '@playwright/test';
import { BarcodeFormat, QRCodeWriter } from '@zxing/library';
import { barcodeSvg } from '../../src/lib/barcode';
import { test, expect } from './fixtures';

declare global {
  interface Window {
    __scannerStreams: MediaStream[];
    __cameraRequests: number;
    __resolveCamera?: () => Promise<void>;
  }
}

const matrix = new QRCodeWriter().encode('TEST0001', BarcodeFormat.QR_CODE, 29, 29, new Map());
const qr = Array.from({ length: matrix.getHeight() }, (_, y) =>
  Array.from({ length: matrix.getWidth() }, (_, x) => matrix.get(x, y)),
);
type CameraMode = 'qr' | 'barcode' | 'denied' | 'blank' | 'delayed' | 'native-failure';

async function installCamera(page: Page, mode: CameraMode) {
  await page.addInitScript(
    ({ qr, svg, mode }) => {
      const state = window;
      state.__scannerStreams = [];
      state.__cameraRequests = 0;
      Object.defineProperty(window, 'BarcodeDetector', {
        configurable: true,
        value:
          mode === 'native-failure'
            ? class {
                static async getSupportedFormats() {
                  return [
                    'qr_code',
                    'code_128',
                    'ean_13',
                    'ean_8',
                    'upc_a',
                    'upc_e',
                    'code_39',
                    'itf',
                    'codabar',
                  ];
                }
                async detect() {
                  throw new Error('Native implementation unavailable');
                }
              }
            : undefined,
      });
      async function createStream() {
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 480;
        const context = canvas.getContext('2d')!;
        context.fillStyle = 'white';
        context.fillRect(0, 0, 640, 480);
        if (mode === 'barcode') {
          const image = new Image();
          image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg!)}`;
          await image.decode();
          context.drawImage(image, 35, 150, 570, 170);
        } else if (mode !== 'blank') {
          context.fillStyle = 'black';
          qr.forEach((row, y) =>
            row.forEach((black, x) => {
              if (black) context.fillRect(146 + x * 12, 66 + y * 12, 12, 12);
            }),
          );
        }
        const media = canvas.captureStream(10);
        state.__scannerStreams.push(media);
        return media;
      }
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          async getUserMedia() {
            state.__cameraRequests++;
            if (mode === 'denied') throw new DOMException('Permission denied', 'NotAllowedError');
            if (mode === 'delayed')
              return new Promise<MediaStream>((resolve) => {
                state.__resolveCamera = async () => {
                  resolve(await createStream());
                };
              });
            return createStream();
          },
        },
      });
    },
    { qr, svg: barcodeSvg('TEST0001'), mode },
  );
}

async function openScanner(page: Page) {
  await page.goto('/inventario');
  await page.getByRole('button', { name: 'Escanear código', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Buscar una referencia' })).toBeVisible();
}

for (const mode of ['qr', 'barcode', 'native-failure'] as const) {
  test(`camera decodes an actual ${mode} frame without relying on native BarcodeDetector`, async ({
    page,
  }) => {
    if (mode === 'qr') await page.setViewportSize({ width: 390, height: 844 });
    await installCamera(page, mode);
    await openScanner(page);
    expect(await page.evaluate(() => window.__cameraRequests)).toBe(0);
    await page.getByRole('button', { name: 'Activar cámara', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'FIXTURE-001 · Blanco' })).toBeVisible({
      timeout: 15000,
    });
    expect(await page.evaluate(() => window.__cameraRequests)).toBe(1);
    expect(
      await page.evaluate(() =>
        window.__scannerStreams.every((stream) =>
          stream.getTracks().every((track) => track.readyState === 'ended'),
        ),
      ),
    ).toBe(true);
  });
}

test('camera denial offers actionable recovery and still accepts a manual code', async ({
  page,
}) => {
  await installCamera(page, 'denied');
  await openScanner(page);
  await page.getByRole('button', { name: 'Activar cámara', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('ajustes de este sitio');
  await page.getByRole('textbox', { name: 'Código escaneado o manual' }).fill('TEST0001');
  await page.getByRole('button', { name: 'Usar código', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'FIXTURE-001 · Blanco' })).toBeVisible();
});

test('closing during the permission request releases a stream that arrives later', async ({
  page,
}) => {
  await installCamera(page, 'delayed');
  await openScanner(page);
  await page.getByRole('button', { name: 'Activar cámara', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Detener cámara' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Buscar una referencia' })).toHaveCount(0);
  await page.evaluate(async () => {
    await window.__resolveCamera?.();
  });
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__scannerStreams.every((stream) =>
          stream.getTracks().every((track) => track.readyState === 'ended'),
        ),
      ),
    )
    .toBe(true);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('stopping and restarting does not retain the previous camera stream', async ({ page }) => {
  await installCamera(page, 'blank');
  await openScanner(page);
  await page.getByRole('button', { name: 'Activar cámara', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Acerca el código QR');
  await page.getByRole('button', { name: 'Detener cámara' }).click();
  await expect(page.getByRole('button', { name: 'Activar cámara' })).toBeVisible();
  expect(
    await page.evaluate(() =>
      window.__scannerStreams[0]!.getTracks().every((track) => track.readyState === 'ended'),
    ),
  ).toBe(true);
  await page.getByRole('button', { name: 'Activar cámara', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Acerca el código QR');
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => window.__scannerStreams.length)).toBe(2);
  expect(
    await page.evaluate(() =>
      window.__scannerStreams.every((stream) =>
        stream.getTracks().every((track) => track.readyState === 'ended'),
      ),
    ),
  ).toBe(true);
});
