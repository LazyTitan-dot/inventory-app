import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Eye, EyeOff, Moon, PackageCheck, ShieldCheck, Sun } from 'lucide-react';
import { configured, supabase } from '../lib/supabase';
import { errorMessage } from '../lib/errors';
import { ErrorNotice, Field } from '../components/ui';
import './auth.css';

interface AuthPageProps {
  recovery?: boolean;
  recoveryInvalid?: boolean;
  sessionError?: string;
  onRetrySession?: () => void;
  onRecoveryComplete?: () => void;
  onExitRecovery?: () => void;
}

export function AuthPage({
  recovery = false,
  recoveryInvalid = false,
  sessionError = '',
  onRetrySession,
  onRecoveryComplete,
  onExitRecovery,
}: AuthPageProps) {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const saved = window.localStorage.getItem('smartliving-theme');
      if (saved === 'light' || saved === 'dark') return saved;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem('smartliving-theme', theme);
    } catch {
      /* Appearance remains available when private browsing disables storage. */
    }
  }, [theme]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [mode, setMode] = useState<'login' | 'reset'>(recoveryInvalid ? 'reset' : 'login');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const [message, setMessage] = useState('');
  const pending = useRef(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supabase || pending.current) return;
    setFailure('');
    setMessage('');
    if (recovery && (password.length < 12 || password !== confirmation)) {
      setFailure(
        password.length < 12
          ? 'Usa una contraseña de al menos 12 caracteres.'
          : 'Las contraseñas no coinciden. Escríbelas nuevamente.',
      );
      return;
    }
    pending.current = true;
    setBusy(true);
    try {
      const response = recovery
        ? await supabase.auth.updateUser({ password })
        : mode === 'reset'
          ? await supabase.auth.resetPasswordForEmail(email.trim(), {
              redirectTo: `${window.location.origin}/recuperar`,
            })
          : await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (response.error) throw response.error;
      if (recovery) {
        setPassword('');
        setConfirmation('');
        if (onRecoveryComplete) onRecoveryComplete();
        else {
          window.history.replaceState({}, '', '/');
          window.location.reload();
        }
      } else if (mode === 'reset')
        setMessage(
          'Si el correo está registrado, recibirás un enlace para restablecer tu contraseña. Ábrelo en este mismo navegador. Revisa también el correo no deseado.',
        );
    } catch (cause) {
      const code = typeof cause === 'object' && cause !== null && 'code' in cause ? cause.code : '';
      setFailure(
        code === 'same_password'
          ? 'Elige una contraseña diferente a la anterior.'
          : code === 'weak_password'
            ? 'La contraseña no cumple los requisitos de seguridad. Usa al menos 12 caracteres y combina letras, números y símbolos.'
            : [
                  'otp_expired',
                  'flow_state_expired',
                  'bad_code_verifier',
                  'session_not_found',
                  'refresh_token_not_found',
                ].includes(String(code))
              ? 'El enlace o la sesión venció. Solicita nuevas instrucciones para recuperar tu acceso.'
              : errorMessage(cause),
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  function switchMode() {
    if (busy) return;
    if (onExitRecovery) {
      onExitRecovery();
      return;
    }
    setMode(mode === 'login' ? 'reset' : 'login');
    setPassword('');
    setConfirmation('');
    setVisible(false);
    setFailure('');
    setMessage('');
  }
  return (
    <main className="auth-glass" data-theme={theme}>
      <header className="auth-glass-header">
        <div className="auth-glass-brand">
          <img src="/brand/primary_dark.png" alt="S-Mart Living" width={200} height={80} />
        </div>
        <button
          type="button"
          className="auth-glass-theme"
          aria-label={theme === 'light' ? 'Activar modo oscuro' : 'Activar modo claro'}
          title={theme === 'light' ? 'Modo oscuro' : 'Modo claro'}
          onClick={() => setTheme((current) => current === 'light' ? 'dark' : 'light')}
        >
          {theme === 'light' ? <Moon size={19} /> : <Sun size={19} />}
        </button>
      </header>
      <div className="auth-glass-content">
        <section className="auth-glass-intro" aria-labelledby="auth-intro-title">
          <span className="auth-glass-eyebrow">TU NEGOCIO, EN ARMONÍA</span>
          <h1 id="auth-intro-title">
            Tu tienda,{' '}
            <br />
            bajo control.
          </h1>
          <p>
            Del primer pedido a la última entrega. Inventario, ventas y operaciones en un mismo
            lugar.
          </p>
          <div className="auth-glass-highlight">
            <span className="auth-glass-highlight-icon" aria-hidden="true"><PackageCheck size={28} strokeWidth={1.5} /></span>
            <div>
              <span>Una operación más simple</span>
              <strong>Más tiempo para tus clientes.</strong>
            </div>
          </div>
        </section>
        <section className="auth-glass-card" aria-labelledby="auth-form-title">
          <span className="auth-glass-eyebrow">S-Mart Living · Acceso al negocio</span>
          <h2 id="auth-form-title">
            {recovery
              ? 'Elige una contraseña nueva'
              : mode === 'reset'
                ? 'Recupera tu acceso'
                : 'Qué bueno verte de nuevo'}
          </h2>
          <p>
            {recovery
              ? 'Usa una contraseña de al menos 12 caracteres.'
              : mode === 'reset'
                ? 'Te enviaremos las instrucciones al correo de tu cuenta.'
                : 'Inicia sesión para continuar con tu tienda.'}
          </p>
          {!configured && (
            <ErrorNotice message="La conexión del negocio todavía no está configurada. Contacta al administrador." />
          )}
          {recoveryInvalid && (
            <ErrorNotice message="Este enlace de recuperación no es válido o ya venció. Solicita uno nuevo y ábrelo en el mismo navegador donde lo pediste." />
          )}
          {sessionError && (
            <>
              <ErrorNotice message={sessionError} />
              {onRetrySession && (
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy}
                  onClick={onRetrySession}
                >
                  Volver a comprobar sesión
                </button>
              )}
            </>
          )}
          <form onSubmit={submit} className="stack">
            {!recovery && (
              <Field label="Correo electrónico">
                <input
                  name="email"
                  autoComplete="username"
                  type="email"
                  required
                  disabled={busy}
                  value={email}
                  maxLength={254}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nombre@ejemplo.com"
                />
              </Field>
            )}
            {(mode === 'login' || recovery) && (
              <Field label={recovery ? 'Nueva contraseña' : 'Contraseña'}>
                <span className="password-field">
                  <input
                    name="password"
                    type={visible ? 'text' : 'password'}
                    autoComplete={recovery ? 'new-password' : 'current-password'}
                    required
                    disabled={busy}
                    minLength={recovery ? 12 : undefined}
                    maxLength={128}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="icon-button"
                    disabled={busy}
                    aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    aria-pressed={visible}
                    onClick={() => setVisible(!visible)}
                  >
                    {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </span>
              </Field>
            )}
            {recovery && (
              <Field label="Repite la nueva contraseña">
                <input
                  name="password-confirmation"
                  type={visible ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  disabled={busy}
                  minLength={12}
                  maxLength={128}
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                />
              </Field>
            )}
            <ErrorNotice message={failure} />
            {message && (
              <div className="success-notice" role="status">
                {message}
              </div>
            )}
            <button type="submit" className="button primary large" disabled={busy || !configured}>
              {busy
                ? 'Un momento…'
                : recovery
                  ? 'Guardar contraseña'
                  : mode === 'reset'
                    ? 'Enviar instrucciones'
                    : 'Iniciar sesión'}
              <ArrowRight size={18} />
            </button>
          </form>
          {(!recovery || onExitRecovery) && (
            <button
              className="text-button auth-glass-reset"
              disabled={busy}
              type="button"
              onClick={switchMode}
            >
              {onExitRecovery
                ? 'Salir de la recuperación'
                : mode === 'login'
                  ? 'Olvidé mi contraseña'
                  : 'Volver a iniciar sesión'}
            </button>
          )}
          <div className="auth-glass-security">
            <ShieldCheck size={19} />
            <span>
              Acceso exclusivo para el equipo autorizado.
              <br />
              Solicita tu cuenta al administrador.
            </span>
          </div>
        </section>
      </div>
      <footer className="auth-glass-footer">S-Mart Living · Operaciones con claridad · República Dominicana</footer>
    </main>
  );
}
