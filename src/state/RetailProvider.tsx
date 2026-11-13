import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { CheckCircle2, RefreshCw, WifiOff, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/errors';
import { RetailContext } from './RetailContext';
import { createRetailStore } from './retailStore';
import { StartupScreen } from '../components/StartupScreen';

export function RetailProvider({ children, userId }: { children: ReactNode; userId: string }) {
  const store = useMemo(() => createRetailStore(userId), [userId]);
  const {
    data,
    error: failure,
    refreshing,
    lastUpdated,
  } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const refresh = store.refresh;
  const [toast, setToast] = useState('');
  const [online, setOnline] = useState(() => navigator.onLine);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const notify = useCallback((message: string) => setToast(message), []);
  async function logout() {
    if (!supabase || loggingOut) return;
    setLoggingOut(true);
    setLogoutError('');
    try {
      const result = await supabase.auth.signOut();
      if (result.error) throw result.error;
    } catch (cause) {
      setLogoutError(`No pudimos cerrar la sesión. ${errorMessage(cause)}`);
    } finally {
      setLoggingOut(false);
    }
  }
  useEffect(() => {
    void store.refresh().catch(() => undefined);
    const onFocus = () => {
      if (document.visibilityState === 'visible') void store.refresh().catch(() => undefined);
    };
    const onConnection = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) onFocus();
    };
    window.addEventListener('online', onConnection);
    window.addEventListener('offline', onConnection);
    document.addEventListener('visibilitychange', onFocus);
    const timer = setInterval(onFocus, 30_000);
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase
      ?.channel(`retail-revision-${userId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'retail_revision' },
        () => {
          clearTimeout(debounce);
          debounce = setTimeout(onFocus, 250);
        },
      )
      .subscribe();
    return () => {
      store.invalidate();
      clearInterval(timer);
      clearTimeout(debounce);
      window.removeEventListener('online', onConnection);
      window.removeEventListener('offline', onConnection);
      document.removeEventListener('visibilitychange', onFocus);
      if (channel) void supabase?.removeChannel(channel);
    };
  }, [store, userId]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 7000);
    return () => clearTimeout(timer);
  }, [toast]);
  const value = useMemo(
    () => (data && lastUpdated ? { data, refresh, notify, refreshing, lastUpdated } : null),
    [data, refresh, notify, refreshing, lastUpdated],
  );
  if (!value)
    return (
      <StartupScreen
        title={failure ? 'No pudimos abrir el negocio' : 'Preparando tu tienda'}
        message={failure || 'Estamos cargando tus productos, operaciones y permisos.'}
        failed={Boolean(failure)}
      >
          {failure && (
            <div className="toolbar">
              <button
                className="button primary"
                disabled={refreshing}
                onClick={() => void refresh().catch(() => undefined)}
              >
                <RefreshCw size={16} /> Volver a intentar
              </button>
              <button
                className="button secondary"
                disabled={loggingOut}
                onClick={() => void logout()}
              >
                {loggingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
              </button>
            </div>
          )}
          {logoutError && <p className="sl-startup-error" role="alert">{logoutError}</p>}
      </StartupScreen>
    );
  return (
    <RetailContext.Provider value={value}>
      {(!online || failure) && (
        <div className="connection-banner" role="alert">
          <WifiOff size={16} />
          {!online
            ? 'Sin conexión. Consulta la información cargada; vuelve a conectarte para guardar cambios.'
            : failure}
          <button onClick={() => void refresh().catch(() => undefined)} disabled={refreshing}>
            Reintentar
          </button>
        </div>
      )}
      {children}
      {toast && (
        <div role="status" className="toast">
          <CheckCircle2 size={20} />
          <span>{toast}</span>
          <button aria-label="Cerrar notificación" onClick={() => setToast('')}>
            <X size={16} />
          </button>
        </div>
      )}
    </RetailContext.Provider>
  );
}
