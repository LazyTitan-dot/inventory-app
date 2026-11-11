import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Camera, CameraOff, ScanLine } from 'lucide-react';
import { ErrorNotice, Field, Modal } from './ui';
import { MAX_BARCODE_LENGTH, normalizeBarcode } from '../lib/barcode';
import './barcode-scanner.css';

type Detector = { detect(source: HTMLVideoElement): Promise<Array<{ rawValue?: string }>> };
type DetectorConstructor = {
  new (options: { formats: string[] }): Detector;
  getSupportedFormats(): Promise<string[]>;
};

/** Camera access starts only after a click. USB/Bluetooth scanners can enter text and press Enter. */
export function BarcodeScanner({
  title = 'Escanear código',
  onDetected,
  onClose,
}: {
  title?: string;
  onDetected: (value: string) => void;
  onClose: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const frame = useRef(0);
  const generation = useRef(0);
  const [value, setValue] = useState('');
  const [status, setStatus] = useState('Usa un lector, introduce el código o activa la cámara.');
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const release = useCallback(() => {
    generation.current++;
    cancelAnimationFrame(frame.current);
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
  }, []);
  const stop = useCallback(() => {
    release();
    setRunning(false);
    setStarting(false);
  }, [release]);
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') stop();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      release();
    };
  }, [release, stop]);
  function accept(raw: string) {
    const code = normalizeBarcode(raw);
    if (
      !code ||
      code.length > MAX_BARCODE_LENGTH ||
      Array.from(code).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
    ) {
      setError('Introduce un código válido de hasta 80 caracteres.');
      return false;
    }
    stop();
    onDetected(code);
    onClose();
    return true;
  }
  async function start() {
    if (starting || running) return;
    setError('');
    const Constructor = (window as Window & { BarcodeDetector?: DetectorConstructor })
      .BarcodeDetector;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError(
        'La cámara necesita HTTPS y un navegador compatible. Puedes usar el campo manual o un lector.',
      );
      return;
    }
    if (!Constructor) {
      setError(
        'Este navegador no reconoce códigos con la cámara. Usa un lector USB/Bluetooth o introduce el código.',
      );
      return;
    }
    const token = ++generation.current;
    setStarting(true);
    try {
      const supported = await Constructor.getSupportedFormats();
      if (generation.current !== token) return;
      const formats = [
        'code_128',
        'ean_13',
        'ean_8',
        'upc_a',
        'upc_e',
        'code_39',
        'itf',
        'codabar',
        'qr_code',
      ].filter((format) => supported.includes(format));
      if (!formats.length) throw new Error('unsupported');
      const detector = new Constructor({ formats });
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      if (generation.current !== token) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = media;
      if (!video.current) {
        release();
        return;
      }
      video.current.srcObject = media;
      await video.current.play();
      if (generation.current !== token) return;
      setStarting(false);
      setRunning(true);
      setStatus('Acerca el código a la cámara con buena iluminación.');
      let previous = 0;
      const tick = async (timestamp: number) => {
        if (generation.current !== token) return;
        if (
          timestamp - previous >= 180 &&
          video.current?.readyState &&
          video.current.readyState >= 2
        ) {
          previous = timestamp;
          try {
            const result = await detector.detect(video.current);
            if (generation.current !== token) return;
            const code = result.find((item) => item.rawValue)?.rawValue;
            if (code && accept(code)) return;
          } catch {
            /* Some frames cannot be read; manual input remains available. */
          }
        }
        if (generation.current === token)
          frame.current = requestAnimationFrame((time) => {
            void tick(time);
          });
      };
      frame.current = requestAnimationFrame((time) => {
        void tick(time);
      });
    } catch (cause) {
      if (generation.current !== token) return;
      stop();
      const name = cause instanceof DOMException ? cause.name : '';
      setError(
        name === 'NotAllowedError'
          ? 'No se autorizó la cámara. Puedes usar un lector o introducir el código.'
          : name === 'NotFoundError'
            ? 'No encontramos una cámara disponible. Usa el campo manual.'
            : 'No pudimos iniciar la lectura con cámara. Usa un lector o introduce el código.',
      );
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    accept(value);
  }
  return (
    <Modal
      title={title}
      onClose={() => {
        stop();
        onClose();
      }}
    >
      <div className="barcode-scanner stack">
        <p>Los lectores USB o Bluetooth funcionan como un teclado: enfoca el código y escanea.</p>
        <form className="stack" onSubmit={submit}>
          <Field label="Código escaneado o manual">
            <input
              autoFocus
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              maxLength={MAX_BARCODE_LENGTH}
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
                setError('');
              }}
            />
          </Field>
          <button className="button primary" disabled={!value.trim()}>
            <ScanLine size={17} /> Usar código
          </button>
        </form>
        <video
          ref={video}
          muted
          playsInline
          className={running || starting ? 'barcode-camera active' : 'barcode-camera'}
          aria-label="Vista previa de la cámara"
        />
        <p role="status" className="muted">
          {status}
        </p>
        <ErrorNotice message={error} />
        <div className="modal-footer">
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              stop();
              onClose();
            }}
          >
            Cancelar
          </button>
          {running || starting ? (
            <button type="button" className="button secondary" onClick={stop}>
              <CameraOff size={17} /> Detener cámara
            </button>
          ) : (
            <button type="button" className="button secondary" onClick={() => void start()}>
              <Camera size={17} /> Activar cámara
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
