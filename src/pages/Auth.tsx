import { useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Eye, EyeOff, PackageCheck, ShieldCheck } from 'lucide-react';
import { configured, supabase } from '../lib/supabase';
import { errorMessage } from '../lib/errors';
import { ErrorNotice, Field } from '../components/ui';

interface AuthPageProps {
  recovery?: boolean;
  recoveryInvalid?: boolean;
  sessionError?: string;
  onRetrySession?: () => void;
  onRecoveryComplete?: () => void;
  onExitRecovery?: () => void;
}

export function AuthPage({ recovery = false, recoveryInvalid = false, sessionError = '', onRetrySession, onRecoveryComplete, onExitRecovery }: AuthPageProps) {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [confirmation, setConfirmation] = useState('');
  const [mode, setMode] = useState<'login' | 'reset'>(recoveryInvalid ? 'reset' : 'login');
  const [visible, setVisible] = useState(false); const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(''); const [message, setMessage] = useState('');
  const pending = useRef(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!supabase || pending.current) return;
    setFailure(''); setMessage('');
    if (recovery && (password.length < 12 || password !== confirmation)) { setFailure(password.length < 12 ? 'Usa una contraseña de al menos 12 caracteres.' : 'Las contraseñas no coinciden. Escríbelas nuevamente.'); return; }
    pending.current = true; setBusy(true);
    try {
      const response = recovery ? await supabase.auth.updateUser({ password }) : mode === 'reset'
        ? await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/recuperar` })
        : await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (response.error) throw response.error;
      if (recovery) {
        setPassword(''); setConfirmation('');
        if (onRecoveryComplete) onRecoveryComplete();
        else { window.history.replaceState({}, '', '/'); window.location.reload(); }
      } else if (mode === 'reset') setMessage('Si el correo está registrado, recibirás un enlace para restablecer tu contraseña. Ábrelo en este mismo navegador. Revisa también el correo no deseado.');
    } catch (cause) {
      const code = typeof cause === 'object' && cause !== null && 'code' in cause ? cause.code : '';
      setFailure(code === 'same_password' ? 'Elige una contraseña diferente a la anterior.' : code === 'weak_password' ? 'La contraseña no cumple los requisitos de seguridad. Usa al menos 12 caracteres y combina letras, números y símbolos.' : ['otp_expired', 'flow_state_expired', 'bad_code_verifier', 'session_not_found', 'refresh_token_not_found'].includes(String(code)) ? 'El enlace o la sesión venció. Solicita nuevas instrucciones para recuperar tu acceso.' : errorMessage(cause));
    } finally { pending.current = false; setBusy(false); }
  }
  function switchMode() {
    if (busy) return;
    if (onExitRecovery) { onExitRecovery(); return; }
    setMode(mode === 'login' ? 'reset' : 'login'); setPassword(''); setConfirmation(''); setVisible(false); setFailure(''); setMessage('');
  }
  return <main className="auth-layout"><section className="auth-story"><div className="brand"><span className="brand-mark">S</span><span>smartliving<span className="brand-dot">.</span><small>RETAIL & OPERACIONES</small></span></div><div className="auth-story-content"><span className="eyebrow">TODO EN SU LUGAR</span><h1>Tu tienda,<br/>bajo control.</h1><p>Del primer pedido a la última entrega. Inventario, ventas y operaciones en un mismo lugar.</p><div className="auth-illustration" aria-hidden="true"><PackageCheck size={86} strokeWidth={1}/><div><span>Una operación más simple</span><strong>Más tiempo para tus clientes.</strong></div></div></div><span className="auth-foot">Hecho para el ritmo de tu negocio · República Dominicana</span></section>
    <section className="auth-form-area"><div className="auth-card"><span className="badge">SmartLiving · Acceso al negocio</span><h2>{recovery ? 'Elige una contraseña nueva' : mode === 'reset' ? 'Recupera tu acceso' : 'Qué bueno verte de nuevo'}</h2><p>{recovery ? 'Usa una contraseña de al menos 12 caracteres.' : mode === 'reset' ? 'Te enviaremos las instrucciones al correo de tu cuenta.' : 'Inicia sesión para continuar con tu tienda.'}</p>
      {!configured && <ErrorNotice message="La conexión del negocio todavía no está configurada. Contacta al administrador."/>}
      {recoveryInvalid && <ErrorNotice message="Este enlace de recuperación no es válido o ya venció. Solicita uno nuevo y ábrelo en el mismo navegador donde lo pediste."/>}
      {sessionError && <><ErrorNotice message={sessionError}/>{onRetrySession && <button type="button" className="button secondary" disabled={busy} onClick={onRetrySession}>Volver a comprobar sesión</button>}</>}
      <form onSubmit={submit} className="stack">
        {!recovery && <Field label="Correo electrónico"><input name="email" autoComplete="username" type="email" required disabled={busy} value={email} maxLength={254} onChange={e => setEmail(e.target.value)} placeholder="nombre@ejemplo.com"/></Field>}
        {(mode === 'login' || recovery) && <Field label={recovery ? 'Nueva contraseña' : 'Contraseña'}><span className="password-field"><input name="password" type={visible ? 'text' : 'password'} autoComplete={recovery ? 'new-password' : 'current-password'} required disabled={busy} minLength={recovery ? 12 : undefined} maxLength={128} value={password} onChange={e => setPassword(e.target.value)}/><button type="button" className="icon-button" disabled={busy} aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={18}/> : <Eye size={18}/>}</button></span></Field>}
        {recovery && <Field label="Repite la nueva contraseña"><input name="password-confirmation" type={visible ? 'text' : 'password'} autoComplete="new-password" required disabled={busy} minLength={12} maxLength={128} value={confirmation} onChange={e => setConfirmation(e.target.value)}/></Field>}
        <ErrorNotice message={failure}/>{message && <div className="success-notice" role="status">{message}</div>}
        <button type="submit" className="button primary large" disabled={busy || !configured}>{busy ? 'Un momento…' : recovery ? 'Guardar contraseña' : mode === 'reset' ? 'Enviar instrucciones' : 'Iniciar sesión'}<ArrowRight size={18}/></button>
      </form>
      {(!recovery || onExitRecovery) && <button className="text-button auth-reset" disabled={busy} type="button" onClick={switchMode}>{onExitRecovery ? 'Salir de la recuperación' : mode === 'login' ? 'Olvidé mi contraseña' : 'Volver a iniciar sesión'}</button>}
      <div className="auth-security"><ShieldCheck size={19}/><span>Acceso exclusivo para el equipo autorizado.<br/>Solicita tu cuenta al administrador.</span></div>
    </div></section>
  </main>;
}
