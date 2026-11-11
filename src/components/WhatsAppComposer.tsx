import { useState } from 'react';
import { MessageCircle } from 'lucide-react';
import {
  buildWhatsAppUrl,
  MAX_WHATSAPP_MESSAGE_LENGTH,
  normalizeWhatsAppPhone,
} from '../lib/whatsapp';
import { ErrorNotice, Field, Modal } from './ui';
import './whatsapp.css';

export interface WhatsAppComposerProps {
  title: string;
  contactName?: string;
  phone?: string | null;
  message: string;
  onClose: () => void;
}

export function WhatsAppComposer({
  title,
  contactName,
  phone = '',
  message,
  onClose,
}: WhatsAppComposerProps) {
  const [recipient, setRecipient] = useState(phone ?? '');
  const [draft, setDraft] = useState(message);
  const [attempted, setAttempted] = useState(false);
  const [feedback, setFeedback] = useState('');
  let destination = '';
  let url = '';
  let validation = '';
  try {
    destination = normalizeWhatsAppPhone(recipient);
    url = buildWhatsAppUrl(recipient, draft);
  } catch (cause) {
    validation = cause instanceof Error ? cause.message : 'Revisa el teléfono y el mensaje.';
  }
  return (
    <Modal title={title} onClose={onClose}>
      <div className="whatsapp-composer stack">
        <div className="whatsapp-recipient">
          <MessageCircle size={23} aria-hidden="true" />
          <div>
            <strong>{contactName || 'Mensaje al cliente'}</strong>
            <p>Revisa el destinatario y el texto antes de continuar.</p>
          </div>
        </div>
        <Field
          label="WhatsApp del cliente"
          hint="En RD puedes escribir 809, 829 o 849 y los siete dígitos restantes. Para otro país, incluye + y su código."
        >
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            maxLength={40}
            value={recipient}
            onChange={(event) => {
              setRecipient(event.target.value);
              setAttempted(false);
              setFeedback('');
            }}
          />
        </Field>
        {destination && (
          <p className="whatsapp-destination">
            Destino: <strong>+{destination}</strong>
          </p>
        )}
        <Field
          label="Mensaje para el cliente"
          hint="Puedes ajustar el mensaje. Los cambios no modifican el documento ni los datos del cliente."
        >
          <textarea
            rows={13}
            maxLength={MAX_WHATSAPP_MESSAGE_LENGTH}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setFeedback('');
            }}
          />
        </Field>
        <div className="whatsapp-count">
          {draft.length} / {MAX_WHATSAPP_MESSAGE_LENGTH} caracteres
        </div>
        <p className="whatsapp-hint">
          Se abrirá el chat de WhatsApp con el destinatario y el mensaje preparados, sin copiar y
          pegar. Pulsa Enviar allí para finalizar. Esta vista no confirma su envío ni su entrega.
        </p>
        <ErrorNotice message={attempted ? validation : ''} />
        {feedback && (
          <p role="status" className="whatsapp-feedback">
            {feedback}
          </p>
        )}
        <div className="modal-footer">
          <button type="button" className="button secondary" onClick={onClose}>
            Volver
          </button>
          {url ? (
            <a
              className="button primary"
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                setAttempted(true);
                setFeedback('Revisa el mensaje en WhatsApp y pulsa Enviar para finalizar.');
              }}
            >
              <MessageCircle size={17} /> Enviar por WhatsApp
            </a>
          ) : (
            <button type="button" className="button primary" onClick={() => setAttempted(true)}>
              <MessageCircle size={17} /> Enviar por WhatsApp
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
