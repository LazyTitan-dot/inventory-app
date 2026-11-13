import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Camera, CameraOff, ScanLine } from 'lucide-react';
import { ErrorNotice, Field, Modal } from './ui';
import { MAX_BARCODE_LENGTH } from '../lib/barcode';
import {
  cameraFailureMessage,
  createCameraFrameDecoder,
  loadSoftwareFrameDecoder,
  validScannedCode,
  type CameraFrameDecoder,
  type NativeCodeDetectorConstructor,
} from '../lib/cameraScanner';
import { advanceContinuousScan, newContinuousScanGate } from '../lib/continuousScan';
import './barcode-scanner.css';

/** Camera access starts only after a click. USB/Bluetooth scanners can enter text and press Enter. */
export function BarcodeScanner({
  title = 'Escanear código',
  onDetected,
  onClose,
  continuous = false,
  summary,
  onActivate,
}: {
  title?: string;
  onDetected: (value: string) => void | boolean;
  onClose: () => void;
  continuous?: boolean;
  summary?: ReactNode;
  onActivate?: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const frame = useRef(0);
  const generation = useRef(0);
  const active = useRef(false);
  const decoder = useRef<CameraFrameDecoder | null>(null);
  const callbacks = useRef({ onDetected, onClose });
  useEffect(() => {
    callbacks.current = { onDetected, onClose };
  }, [onDetected, onClose]);
  const [value, setValue] = useState('');
  const [status, setStatus] = useState('Usa un lector, introduce el código o activa la cámara.');
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const release = useCallback(() => {
    generation.current++;
    active.current = false;
    decoder.current?.dispose();
    decoder.current = null;
    cancelAnimationFrame(frame.current);
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
  }, []);
  const stop = useCallback(() => {
    release();
    setRunning(false);
    setStarting(false);
    setStatus('Cámara detenida. Puedes volver a activarla o introducir el código.');
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
  const accept = useCallback(
    (raw: string) => {
      const code = validScannedCode(raw);
      if (!code) {
        setError('Introduce un código válido de hasta 80 caracteres.');
        return false;
      }
      if (continuous) {
        setError('');
        callbacks.current.onDetected(code);
        setValue('');
        return true;
      }
      stop();
      callbacks.current.onDetected(code);
      callbacks.current.onClose();
      return true;
    },
    [continuous, stop],
  );
  async function start() {
    if (active.current) return;
    onActivate?.();
    setError('');
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError(
        'La cámara necesita HTTPS. Abre la dirección segura de la app en Safari o Chrome; también puedes usar un lector o el campo manual.',
      );
      return;
    }
    const token = ++generation.current;
    active.current = true;
    setStarting(true);
    setStatus('Permite el acceso a la cámara cuando el navegador lo solicite.');
    try {
      // Request access from the explicit button action, before loading a decoder.
      // The app alone owns this stream throughout native/software decoding.
      const media = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      if (generation.current !== token) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = media;
      const preview = video.current;
      if (!preview) {
        release();
        return;
      }
      for (const track of media.getVideoTracks())
        track.addEventListener(
          'ended',
          () => {
            if (generation.current !== token) return;
            stop();
            setError('El acceso a la cámara terminó. Vuelve a activarla para continuar.');
          },
          { once: true },
        );
      preview.srcObject = media;
      await preview.play();
      if (generation.current !== token) return;
      setStatus('Preparando la lectura de códigos QR y de barras…');
      const Constructor = (window as Window & { BarcodeDetector?: NativeCodeDetectorConstructor })
        .BarcodeDetector;
      const selected = await createCameraFrameDecoder(Constructor);
      if (generation.current !== token) {
        selected.dispose();
        return;
      }
      decoder.current = selected;
      setStarting(false);
      setRunning(true);
      setStatus(continuous ? 'Escanea una unidad y retira el código de la vista antes de acercar la siguiente.' : 'Acerca el código QR o de barras a la cámara con buena iluminación.');
      let gate = newContinuousScanGate();
      let previous = 0;
      let nativeFailures = 0;
      const tick = async (timestamp: number) => {
        if (generation.current !== token) return;
        if (timestamp - previous >= 180 && preview.readyState >= 2) {
          previous = timestamp;
          try {
            const code = await decoder.current?.decode(preview);
            if (generation.current !== token) return;
            nativeFailures = 0;
            if (continuous) {
              const next = advanceContinuousScan(gate, code, timestamp);
              gate = next.gate;
              if (next.detect && code) accept(code);
            } else if (code && accept(code)) return;
          } catch (cause) {
            if (generation.current !== token) return;
            if (decoder.current?.kind === 'native' && ++nativeFailures >= 3) {
              try {
                const fallback = await loadSoftwareFrameDecoder();
                if (generation.current !== token) {
                  fallback.dispose();
                  return;
                }
                decoder.current?.dispose();
                decoder.current = fallback;
              } catch (fallbackError) {
                if (generation.current !== token) return;
                stop();
                setError(cameraFailureMessage(fallbackError));
                return;
              }
            } else if (decoder.current?.kind === 'software') {
              stop();
              setError(cameraFailureMessage(cause));
              return;
            }
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
      setError(cameraFailureMessage(cause));
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    onActivate?.();
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
        {continuous && summary}
        <p>{continuous ? 'Escaneo continuo: retira cada código de la vista antes de escanear el siguiente. El conteo sigue siendo provisional.' : 'Los lectores USB o Bluetooth funcionan como un teclado: enfoca el código y escanea.'}</p>
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
          autoPlay
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
            {continuous ? 'Terminar escaneo' : 'Cancelar'}
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
