import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { createAuthSessionStore, type AuthSessionClient } from './authSession';

const session = (id = 'user-a'): Session => ({
  access_token: 'test-access',
  refresh_token: 'test-refresh',
  expires_in: 3600,
  token_type: 'bearer',
  user: {
    id,
    aud: 'authenticated',
    created_at: '2026-09-24T12:00:00Z',
    app_metadata: {},
    user_metadata: {},
  },
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function authClient() {
  let callback: ((event: AuthChangeEvent, next: Session | null) => void) | undefined;
  const unsubscribe = vi.fn();
  const auth: AuthSessionClient = {
    getSession: vi
      .fn<AuthSessionClient['getSession']>()
      .mockResolvedValue({ data: { session: session() }, error: null }),
    onAuthStateChange: (handler) => {
      callback = handler;
      return { data: { subscription: { unsubscribe } } };
    },
  };
  return {
    auth,
    unsubscribe,
    emit: (event: AuthChangeEvent, next: Session | null) => callback?.(event, next),
  };
}
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('authentication lifecycle', () => {
  it('ends loading and exposes a retryable message when getSession rejects', async () => {
    const { auth } = authClient();
    vi.mocked(auth.getSession).mockRejectedValue(new TypeError('Failed to fetch'));
    const store = createAuthSessionStore(auth, 'https://app.example.test/');
    await store.refresh();
    expect(store.getSnapshot()).toMatchObject({ session: null, loading: false, recovery: false });
    expect(store.getSnapshot().error).toMatch(/comprobar tu sesión/);
  });

  it('handles returned session errors as failures instead of treating them as success', async () => {
    const { auth } = authClient();
    vi.mocked(auth.getSession).mockResolvedValue({
      data: { session: null },
      error: new Error('token expired'),
    });
    const store = createAuthSessionStore(auth, 'https://app.example.test/');
    await store.refresh();
    expect(store.getSnapshot().loading).toBe(false);
    expect(store.getSnapshot().error).not.toBe('');
  });

  it('can retry a failed session check without reloading the page', async () => {
    const { auth } = authClient();
    vi.mocked(auth.getSession)
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ data: { session: session() }, error: null });
    const store = createAuthSessionStore(auth, 'https://app.example.test/');
    await store.refresh();
    await store.refresh();
    expect(store.getSnapshot()).toMatchObject({
      loading: false,
      error: '',
      session: { user: { id: 'user-a' } },
    });
  });

  it('does not overwrite a newer sign-in event with a late initial session response', async () => {
    const { auth, emit } = authClient();
    const waiting = deferred<Awaited<ReturnType<AuthSessionClient['getSession']>>>();
    vi.mocked(auth.getSession).mockReturnValue(waiting.promise);
    const store = createAuthSessionStore(auth, 'https://app.example.test/');
    const stop = store.start();
    emit('SIGNED_IN', session('new-user'));
    waiting.resolve({ data: { session: session('old-user') }, error: null });
    await waiting.promise;
    await Promise.resolve();
    expect(store.getSnapshot().session?.user.id).toBe('new-user');
    stop();
  });

  it('never restores a late session after sign-out', async () => {
    const { auth, emit } = authClient();
    const waiting = deferred<Awaited<ReturnType<AuthSessionClient['getSession']>>>();
    vi.mocked(auth.getSession).mockReturnValue(waiting.promise);
    const store = createAuthSessionStore(auth, 'https://app.example.test/');
    const stop = store.start();
    emit('SIGNED_OUT', null);
    waiting.resolve({ data: { session: session() }, error: null });
    await waiting.promise;
    await Promise.resolve();
    expect(store.getSnapshot()).toMatchObject({ session: null, loading: false, recovery: false });
    stop();
  });

  it('offers retry after a stalled lookup and discards its later response', async () => {
    vi.useFakeTimers();
    const { auth } = authClient();
    const waiting = deferred<Awaited<ReturnType<AuthSessionClient['getSession']>>>();
    vi.mocked(auth.getSession).mockReturnValue(waiting.promise);
    const store = createAuthSessionStore(auth, 'https://app.example.test/');
    const request = store.refresh();
    await vi.advanceTimersByTimeAsync(15000);
    expect(store.getSnapshot().error).toMatch(/tardó demasiado/);
    expect(store.getSnapshot().loading).toBe(false);
    waiting.resolve({ data: { session: session() }, error: null });
    await request;
    expect(store.getSnapshot().session).toBeNull();
  });

  it('invalidates work and unsubscribes on cleanup while allowing a StrictMode restart', async () => {
    const { auth, emit, unsubscribe } = authClient();
    const waiting = deferred<Awaited<ReturnType<AuthSessionClient['getSession']>>>();
    vi.mocked(auth.getSession).mockReturnValueOnce(waiting.promise);
    const store = createAuthSessionStore(auth, 'https://app.example.test/');
    const stop = store.start();
    stop();
    emit('SIGNED_IN', session('old-effect'));
    waiting.resolve({ data: { session: session('old-effect') }, error: null });
    await waiting.promise;
    await Promise.resolve();
    expect(store.getSnapshot().session).toBeNull();
    expect(unsubscribe).toHaveBeenCalledOnce();
    const stopAgain = store.start();
    await Promise.resolve();
    await Promise.resolve();
    expect(store.getSnapshot().session?.user.id).toBe('user-a');
    stopAgain();
  });

  it('does not keep loading when no backend is configured', () => {
    expect(createAuthSessionStore(null, 'https://app.example.test/').getSnapshot()).toMatchObject({
      loading: false,
      session: null,
    });
  });
});

describe('password recovery authorization', () => {
  it('does not authorize password recovery from the pathname and an unrelated cached session', async () => {
    const { auth } = authClient();
    const store = createAuthSessionStore(auth, 'https://app.example.test/recuperar');
    await store.refresh();
    expect(store.getSnapshot()).toMatchObject({ recoveryRequested: true, recovery: false });
  });

  it('only activates recovery after the SDK PASSWORD_RECOVERY event with a session', () => {
    const { auth, emit } = authClient();
    const store = createAuthSessionStore(auth, 'https://app.example.test/recuperar?code=test');
    const stop = store.start();
    emit('PASSWORD_RECOVERY', session());
    expect(store.getSnapshot()).toMatchObject({
      recovery: true,
      recoveryRequested: true,
      loading: false,
    });
    emit('INITIAL_SESSION', session());
    expect(store.getSnapshot().recovery).toBe(true);
    emit('USER_UPDATED', session());
    expect(store.getSnapshot().recovery).toBe(true);
    store.finishRecovery();
    expect(store.getSnapshot()).toMatchObject({ recovery: false, recoveryRequested: false });
    stop();
  });

  it('does not accept explicit expired-link callback parameters', () => {
    const { auth, emit } = authClient();
    const store = createAuthSessionStore(
      auth,
      'https://app.example.test/recuperar#error=access_denied&error_code=otp_expired',
    );
    const stop = store.start();
    emit('PASSWORD_RECOVERY', session());
    expect(store.getSnapshot().recovery).toBe(false);
    stop();
  });

  it('does not transfer recovery authorization to another account or a signed-out session', () => {
    const { auth, emit } = authClient();
    const store = createAuthSessionStore(auth, 'https://app.example.test/recuperar');
    const stop = store.start();
    emit('PASSWORD_RECOVERY', session());
    emit('SIGNED_IN', session('other-user'));
    expect(store.getSnapshot().recovery).toBe(false);
    emit('PASSWORD_RECOVERY', session());
    emit('SIGNED_OUT', null);
    expect(store.getSnapshot()).toMatchObject({ session: null, recovery: false });
    stop();
  });
});
