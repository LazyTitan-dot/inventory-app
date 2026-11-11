import { MAX_BARCODE_LENGTH, normalizeBarcode } from './barcode';

export const CAMERA_CODE_FORMATS = [
  'qr_code',
  'code_128',
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
  'code_39',
  'itf',
  'codabar',
] as const;

export interface NativeCodeDetector {
  detect(source: HTMLVideoElement): Promise<Array<{ rawValue?: string }>>;
}

export interface NativeCodeDetectorConstructor {
  new (options: { formats: string[] }): NativeCodeDetector;
  getSupportedFormats(): Promise<string[]>;
}

export interface CameraFrameDecoder {
  readonly kind: 'native' | 'software';
  decode(video: HTMLVideoElement): Promise<string | null> | string | null;
  dispose(): void;
}

export function validScannedCode(raw: string): string | null {
  const code = normalizeBarcode(raw);
  return code && code.length <= MAX_BARCODE_LENGTH && !/\p{Cc}/u.test(code) ? code : null;
}

/** A decoder failure must not prevent an otherwise supported camera from opening. */
export async function createCameraFrameDecoder(
  Constructor: NativeCodeDetectorConstructor | undefined,
  loadSoftware: () => Promise<CameraFrameDecoder> = loadSoftwareFrameDecoder,
): Promise<CameraFrameDecoder> {
  if (Constructor) {
    try {
      const formats = await Constructor.getSupportedFormats();
      // Native implementations differ widely. The fallback supports the whole
      // scanner contract, including QR, rather than silently dropping a format.
      if (CAMERA_CODE_FORMATS.every((format) => formats.includes(format))) {
        const detector = new Constructor({ formats: [...CAMERA_CODE_FORMATS] });
        return {
          kind: 'native',
          async decode(video) {
            const results = await detector.detect(video);
            return results.find((result) => result.rawValue)?.rawValue ?? null;
          },
          dispose() {
            /* The native detector owns no camera or background loop. */
          },
        };
      }
    } catch {
      /* Missing, partial, and broken native implementations use the decoder below. */
    }
  }
  return loadSoftware();
}

export async function loadSoftwareFrameDecoder(): Promise<CameraFrameDecoder> {
  // This code is fetched from the app's own bundled assets only after a camera
  // start. No CDN, worker, extra camera request, or eval permission is needed.
  const { createSoftwareFrameDecoder } = await import('./softwareBarcodeDecoder');
  return createSoftwareFrameDecoder();
}

export function cameraFailureMessage(cause: unknown): string {
  const name =
    typeof cause === 'object' && cause !== null && 'name' in cause ? String(cause.name) : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
    return 'Permite el acceso a la cámara en los ajustes de este sitio y del dispositivo, y vuelve a intentarlo. Si abriste la app dentro de otra aplicación, ábrela en Safari o Chrome.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No encontramos una cámara. Conecta una cámara y vuelve a intentarlo, o usa un lector o el campo manual.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
    return 'No pudimos abrir la cámara. Cierra otras aplicaciones que la estén usando y vuelve a intentarlo.';
  }
  if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
    return 'La cámara no admite la configuración solicitada. Prueba con otra cámara o usa el campo manual.';
  }
  return 'No pudimos iniciar el lector. Vuelve a intentar activar la cámara; también puedes usar un lector o introducir el código.';
}
