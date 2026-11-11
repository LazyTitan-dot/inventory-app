/**
 * S-mart Living / prototype React primitives (React 19, TS).
 * Add tokens.css + components.css to your app before using these.
 * Business permissions and all transactions MUST be validated server-side.
 */
import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  ReactNode,
  InputHTMLAttributes,
  LabelHTMLAttributes,
} from 'react';
import { useId } from 'react';

export type ActionTone = 'primary' | 'quiet' | 'secondary' | 'danger';
export type StatusTone = 'ok' | 'warn' | 'error' | 'info';

export interface SLButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: ActionTone;
  compact?: boolean;
}
export function SLButton({ tone = 'secondary', compact = false, className = '', type = 'button', ...props }: SLButtonProps) {
  const modifier = tone === 'secondary' ? '' : `sl-button--${tone}`;
  return (
    <button type={type} className={['sl-button', modifier, compact && 'sl-button--small', className].filter(Boolean).join(' ')} {...props} />
  );
}

export function SLStatus({ children, tone }: { children: ReactNode; tone: StatusTone }) {
  return <span className={`sl-pill sl-pill--${tone}`}>{children}</span>;
}

export interface SLCardProps extends HTMLAttributes<HTMLElement> { as?: 'section' | 'article' | 'div'; }
export function SLCard({ as = 'section', className = '', ...props }: SLCardProps) {
  const Tag = as;
  return <Tag className={['sl-surface', className].filter(Boolean).join(' ')} {...props} />;
}

export interface SLFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label: string;
  hint?: string;
  error?: string;
  containerClassName?: string;
  labelProps?: LabelHTMLAttributes<HTMLLabelElement>;
}
export function SLField({ label, hint, error, id: providedId, containerClassName = '', labelProps, ...inputProps }: SLFieldProps) {
  const generatedId = useId();
  const inputId = providedId || generatedId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const describedBy = [inputProps['aria-describedby'], hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className={['sl-field', containerClassName].filter(Boolean).join(' ')}>
      <label className="sl-field__label" htmlFor={inputId} {...labelProps}>{label}</label>
      <input {...inputProps} id={inputId} className={['sl-input', inputProps.className].filter(Boolean).join(' ')}
        aria-invalid={error ? true : inputProps['aria-invalid']} aria-describedby={describedBy} />
      {hint && <small className="sl-field__hint" id={hintId}>{hint}</small>}
      {error && <p className="sl-error" id={errorId} role="alert">{error}</p>}
    </div>
  );
}

export function SLMetricCard({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <SLCard className="sl-metric-card" style={{ padding: 20 }}>
      <span style={{ color: 'var(--sl-muted)', fontSize: 12 }}>{label}</span>
      <strong style={{ display: 'block', fontSize: 24, letterSpacing: '-.5px', fontVariantNumeric: 'tabular-nums', marginTop: 10 }}>{value}</strong>
      {note && <small style={{ color: 'var(--sl-muted)' }}>{note}</small>}
    </SLCard>
  );
}

export function SLEmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div role="status" style={{ textAlign: 'center', padding: '32px 18px', color: 'var(--sl-ink)' }}>
      <h3 style={{ margin: 0 }}>{title}</h3>
      <p style={{ color: 'var(--sl-muted)' }}>{description}</p>
      {action}
    </div>
  );
}

/**
 * Usage:
 * import './tokens.css'; import './components.css';
 * <div className="sl-ui" data-theme="light">
 *   <SLButton tone="primary" onClick={save}>Guardar</SLButton>
 *   <SLField label="SKU" value={sku} onChange={onChange} error={error} />
 *   <SLStatus tone="warn">Bajo stock</SLStatus>
 * </div>
 */
