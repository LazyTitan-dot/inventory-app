import { BrowserMultiFormatReader } from '@zxing/browser';
import {
  BarcodeFormat,
  ChecksumException,
  DecodeHintType,
  FormatException,
  NotFoundException,
} from '@zxing/library';
import type { CameraFrameDecoder } from './cameraScanner';

/** Decode frames without acquiring or owning a second camera stream. */
export function createSoftwareFrameDecoder(): CameraFrameDecoder {
  const formats = [
    BarcodeFormat.QR_CODE,
    BarcodeFormat.CODE_128,
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
    BarcodeFormat.CODE_39,
    BarcodeFormat.ITF,
    BarcodeFormat.CODABAR,
  ];
  const hints = new Map<DecodeHintType, unknown>([
    [DecodeHintType.POSSIBLE_FORMATS, formats],
    [DecodeHintType.TRY_HARDER, true],
  ]);
  const reader = new BrowserMultiFormatReader(hints);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('No se pudo preparar la imagen de la cámara.');
  return {
    kind: 'software',
    decode(video) {
      if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return null;
      // Bound decoding work on high-resolution phone cameras. Both dimensions
      // scale together, preserving the square geometry needed for QR detection.
      const scale = Math.min(1, 960 / video.videoWidth, 720 / video.videoHeight);
      const width = Math.max(1, Math.round(video.videoWidth * scale));
      const height = Math.max(1, Math.round(video.videoHeight * scale));
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      context.drawImage(video, 0, 0, width, height);
      try {
        return reader.decodeFromCanvas(canvas).getText();
      } catch (cause) {
        if (
          cause instanceof NotFoundException ||
          cause instanceof ChecksumException ||
          cause instanceof FormatException
        )
          return null;
        throw cause;
      }
    },
    dispose() {
      canvas.width = canvas.height = 0;
    },
  };
}
