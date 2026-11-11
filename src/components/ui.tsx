import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, Inbox, Search, X } from 'lucide-react';
import { statusLabels } from '../lib/format';
import './drawer.css';

// Nested native dialogs (for example, a scanner over an editor) share one lock.
let openDialogCount = 0;
let bodyOverflowBeforeDialogs = '';

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="header-actions">{actions}</div>}
    </header>
  );
}
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Inbox size={26} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function ErrorNotice({ message }: { message: string }) {
  return message ? (
    <div role="alert" className="error-notice">
      <AlertCircle size={18} />
      <span>{message}</span>
    </div>
  ) : null;
}
export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge status-${status}`}>{statusLabels[status] ?? status}</span>;
}
export function StatCard({
  label,
  value,
  hint,
  tone = '',
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: string;
}) {
  return (
    <div className={`stat-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {hint && <small>{hint}</small>}
    </div>
  );
}
export function SearchInput({
  value,
  onChange,
  placeholder = 'Buscar…',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="search-field">
      <Search size={18} />
      <span className="sr-only">{placeholder}</span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide,
  variant = 'dialog',
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  variant?: 'dialog' | 'drawer';
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current;
    const active = document.activeElement;
    if (openDialogCount === 0) {
      bodyOverflowBeforeDialogs = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    openDialogCount++;
    node?.showModal();
    return () => {
      node?.close();
      openDialogCount = Math.max(0, openDialogCount - 1);
      if (openDialogCount === 0) document.body.style.overflow = bodyOverflowBeforeDialogs;
      if (active instanceof HTMLElement) active.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className={`modal ${wide ? 'wide' : ''} ${variant === 'drawer' ? 'detail-drawer' : ''}`}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button type="button" className="icon-button" aria-label="Cerrar ventana" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      <div className="modal-body">{children}</div>
    </dialog>
  );
}
export function ConfirmButton({
  label,
  message,
  onConfirm,
  disabled,
}: {
  label: string;
  message: string;
  onConfirm: () => Promise<void>;
  disabled?: boolean;
}) {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  async function confirm() {
    setBusy(true);
    setFailed(false);
    try {
      await onConfirm();
      setShow(false);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        className="button ghost"
        type="button"
        disabled={disabled}
        onClick={() => setShow(true)}
      >
        {label}
      </button>
      {show && (
        <Modal
          title={label}
          onClose={() => {
            if (!busy) setShow(false);
          }}
        >
          <p>{message}</p>
          <ErrorNotice
            message={
              failed
                ? 'No se pudo completar la acción. Revisa el mensaje de la página y vuelve a intentar.'
                : ''
            }
          />
          <div className="modal-footer">
            <button className="button secondary" disabled={busy} onClick={() => setShow(false)}>
              Volver
            </button>
            <button className="button danger" disabled={busy} onClick={() => void confirm()}>
              {busy ? 'Guardando…' : label}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
