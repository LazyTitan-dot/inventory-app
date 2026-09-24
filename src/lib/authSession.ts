import type { AuthChangeEvent, Session } from '@supabase/supabase-js';

export interface AuthSessionClient {
  getSession: () => Promise<{ data: { session: Session | null }; error: unknown | null }>;
  onAuthStateChange: (callback: (event: AuthChangeEvent, session: Session | null) => void) => { data: { subscription: { unsubscribe: () => void } } };
}
export interface AuthSessionSnapshot {
  session: Session | null;
  loading: boolean;
  error: string;
  recovery: boolean;
  recoveryRequested: boolean;
}

export function createAuthSessionStore(client: AuthSessionClient | null, location: string) {
  const url = new URL(location);
  const hash = new URLSearchParams(url.hash.slice(1));
  const recoveryRequested = url.pathname.replace(/\/+$/, '') === '/recuperar' || hash.get('type') === 'recovery';
  const invalidLink = url.searchParams.has('error') || hash.has('error') || url.searchParams.has('error_code') || hash.has('error_code');
  let snapshot: AuthSessionSnapshot = { session: null, loading: Boolean(client), error: '', recovery: false, recoveryRequested };
  let lifecycle = 0;
  let request = 0;
  const listeners = new Set<() => void>();
  const deadlines = new Set<ReturnType<typeof setTimeout>>();
  function publish(next: AuthSessionSnapshot) { snapshot = next; listeners.forEach(listener => listener()); }
  async function refresh(): Promise<void> {
    if (!client) return;
    const version = ++request;
    const activeLifecycle = lifecycle;
    publish({ ...snapshot, loading: true, error: '' });
    const timeout = setTimeout(() => {
      deadlines.delete(timeout);
      if (version !== request || activeLifecycle !== lifecycle) return;
      request++;
      publish({ ...snapshot, session: null, loading: false, recovery: false, error: 'La comprobación de sesión tardó demasiado. Revisa tu conexión y vuelve a intentar.' });
    }, 15000);
    deadlines.add(timeout);
    try {
      const { data, error } = await client.getSession();
      if (version !== request || activeLifecycle !== lifecycle) return;
      if (error) throw error;
      publish({ ...snapshot, session: data.session, loading: false, error: '', recovery: snapshot.recovery && Boolean(data.session) });
    } catch {
      if (version === request && activeLifecycle === lifecycle) publish({ ...snapshot, session: null, loading: false, recovery: false, error: 'No pudimos comprobar tu sesión. Revisa la conexión, vuelve a intentar o inicia sesión nuevamente.' });
    } finally { clearTimeout(timeout); deadlines.delete(timeout); }
  }
  function start() {
    if (!client) return () => undefined;
    const activeLifecycle = ++lifecycle;
    const { data: { subscription } } = client.onAuthStateChange((event, session) => {
      if (activeLifecycle !== lifecycle) return;
      request++;
      const recovery = event === 'PASSWORD_RECOVERY' ? Boolean(session) && !invalidLink : session && session.user.id === snapshot.session?.user.id ? snapshot.recovery : false;
      publish({ ...snapshot, session, loading: false, error: '', recovery, recoveryRequested: snapshot.recoveryRequested || event === 'PASSWORD_RECOVERY' });
    });
    void refresh();
    return () => {
      lifecycle++; request++;
      subscription.unsubscribe(); deadlines.forEach(clearTimeout); deadlines.clear();
    };
  }
  function finishRecovery() { publish({ ...snapshot, recovery: false, recoveryRequested: false, error: '' }); }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    start, refresh, finishRecovery,
  };
}
