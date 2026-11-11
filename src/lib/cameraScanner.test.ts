import { describe, expect, it, vi } from 'vitest';
import {
  CAMERA_CODE_FORMATS,
  cameraFailureMessage,
  createCameraFrameDecoder,
  validScannedCode,
  type CameraFrameDecoder,
  type NativeCodeDetectorConstructor,
} from './cameraScanner';

function software() {
  const decoder: CameraFrameDecoder = { kind: 'software', decode: () => 'QR-1', dispose: vi.fn() };
  return { decoder, load: vi.fn(async () => decoder) };
}

describe('camera decoder compatibility', () => {
  it('uses software when the browser has no native BarcodeDetector', async () => {
    const fallback = software();
    expect(await createCameraFrameDecoder(undefined, fallback.load)).toBe(fallback.decoder);
    expect(fallback.load).toHaveBeenCalledOnce();
  });
  it('uses software when native formats omit QR or another supported retail format', async () => {
    const fallback = software();
    class PartialDetector {
      static async getSupportedFormats() {
        return ['code_128', 'ean_13'];
      }
      async detect() {
        return [];
      }
    }
    expect(await createCameraFrameDecoder(PartialDetector, fallback.load)).toBe(fallback.decoder);
  });
  it('recovers when native format discovery or construction throws', async () => {
    const fallback = software();
    class BrokenDiscovery {
      static async getSupportedFormats(): Promise<string[]> {
        throw new Error('not implemented');
      }
      async detect() {
        return [];
      }
    }
    class BrokenConstructor {
      constructor() {
        throw new Error('not implemented');
      }
      static async getSupportedFormats() {
        return [...CAMERA_CODE_FORMATS];
      }
      async detect() {
        return [];
      }
    }
    for (const detector of [BrokenDiscovery, BrokenConstructor]) {
      expect(await createCameraFrameDecoder(detector, fallback.load)).toBe(fallback.decoder);
    }
  });
  it('retains a fully supported native decoder and extracts an actual value', async () => {
    const fallback = software();
    let requested: string[] = [];
    class NativeDetector {
      constructor(options: { formats: string[] }) {
        requested = options.formats;
      }
      static async getSupportedFormats() {
        return [...CAMERA_CODE_FORMATS];
      }
      async detect() {
        return [{}, { rawValue: 'TEST0001' }];
      }
    }
    const decoder = await createCameraFrameDecoder(
      NativeDetector as NativeCodeDetectorConstructor,
      fallback.load,
    );
    expect(decoder.kind).toBe('native');
    expect(await decoder.decode({} as HTMLVideoElement)).toBe('TEST0001');
    expect(requested).toEqual(CAMERA_CODE_FORMATS);
    expect(fallback.load).not.toHaveBeenCalled();
  });
});

describe('scan results and camera errors', () => {
  it('accepts bounded literal product codes without interpreting a QR value as navigation', () => {
    expect(validScannedCode('  SKU-42  ')).toBe('SKU-42');
    expect(validScannedCode('https://example.test/sku/42')).toBe('https://example.test/sku/42');
    expect(validScannedCode('x'.repeat(80))).toBe('x'.repeat(80));
    for (const value of ['', ' ', 'x'.repeat(81), 'SKU\u0000X', 'SKU\u0085X'])
      expect(validScannedCode(value)).toBeNull();
  });
  it('provides permission, missing-device and busy-camera recovery instructions', () => {
    expect(cameraFailureMessage({ name: 'NotAllowedError' })).toContain('ajustes');
    expect(cameraFailureMessage({ name: 'NotAllowedError' })).toContain('Safari o Chrome');
    expect(cameraFailureMessage({ name: 'NotFoundError' })).toContain('Conecta una cámara');
    expect(cameraFailureMessage({ name: 'NotReadableError' })).toContain('otras aplicaciones');
    expect(cameraFailureMessage(new Error('unknown'))).toContain('Vuelve a intentar');
  });
});
