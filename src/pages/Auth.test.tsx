import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AuthPage } from './Auth';

vi.mock('../lib/supabase', () => ({ configured: true, supabase: null }));

describe('signed-out glass entry', () => {
  it('uses the current brand while preserving login semantics and native credential assistance', () => {
    const html = renderToStaticMarkup(<AuthPage />);
    expect(html).toContain('class="auth-glass" data-theme="light"');
    expect(html).toContain('alt="S-Mart Living"');
    expect(html).toContain('S-Mart Living · Acceso al negocio');
    expect(html).not.toContain('SmartLiving');
    expect(html).toContain('autoComplete="username"');
    expect(html).toContain('autoComplete="current-password"');
    expect(html).toContain('type="email"');
    expect(html).toContain('aria-label="Mostrar contraseña" aria-pressed="false"');
    expect(html).toContain('aria-labelledby="auth-form-title"');
    expect(html).toContain('Iniciar sesión');
  });

  it('keeps recovery validation and expired-link guidance in the same signed-out surface', () => {
    const html = renderToStaticMarkup(<AuthPage recovery recoveryInvalid onExitRecovery={vi.fn()} />);
    expect(html).toContain('Elige una contraseña nueva');
    expect(html).toContain('autoComplete="new-password"');
    expect(html).toContain('name="password-confirmation"');
    expect(html).toContain('minLength="12"');
    expect(html).toContain('Este enlace de recuperación no es válido o ya venció.');
    expect(html).toContain('Salir de la recuperación');
    expect(html).not.toContain('class="app-layout"');
  });
});
