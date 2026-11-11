import { bootstrapSchema, type RetailData } from '../lib/contracts';
import { supabase } from '../lib/supabase';
import { displayBusinessName } from '../lib/brand';

export interface RetailSnapshot {
  readonly data: RetailData | null;
  readonly error: string;
  readonly refreshing: boolean;
  readonly lastUpdated: Date | null;
}

export type RetailLoader = () => Promise<unknown>;

class RetailLoadError extends Error {
  constructor(
    message: string,
    readonly discardData = false,
  ) {
    super(message);
    this.name = 'RetailLoadError';
  }
}

async function loadRetail(): Promise<unknown> {
  if (!supabase) throw new RetailLoadError('No hay una conexión configurada para este negocio.');
  const response = await supabase.rpc('retail_bootstrap');
  if (response.error) throw response.error;
  return response.data;
}

function accessRevoked(cause: unknown): boolean {
  if (cause instanceof RetailLoadError) return cause.discardData;
  if (typeof cause !== 'object' || cause === null) return false;
  const error = cause as { code?: unknown; status?: unknown };
  return (
    error.code === '42501' ||
    error.code === 'PGRST301' ||
    error.code === 'PGRST303' ||
    error.status === 401 ||
    error.status === 403
  );
}

function loadMessage(cause: unknown): string {
  if (cause instanceof RetailLoadError) return cause.message;
  if (accessRevoked(cause))
    return 'Tu sesión ya no tiene acceso al negocio. Inicia sesión nuevamente o consulta con el administrador.';
  if (typeof navigator !== 'undefined' && navigator.onLine === false)
    return 'No hay conexión a internet. La información cargada se conserva; vuelve a conectarte para actualizarla.';
  return 'No pudimos actualizar la información. Conservamos los datos cargados; vuelve a intentar.';
}

/** One store per authenticated user; requests never outlive their current generation. */
export function createRetailStore(userId: string, loader: RetailLoader = loadRetail) {
  let snapshot: RetailSnapshot = { data: null, error: '', refreshing: false, lastUpdated: null };
  let generation = 0;
  const listeners = new Set<() => void>();

  function publish(next: RetailSnapshot) {
    if (
      snapshot.data === next.data &&
      snapshot.error === next.error &&
      snapshot.refreshing === next.refreshing &&
      snapshot.lastUpdated === next.lastUpdated
    )
      return;
    snapshot = next;
    listeners.forEach((listener) => listener());
  }

  async function refresh(): Promise<void> {
    const request = ++generation;
    publish({ ...snapshot, refreshing: true });
    try {
      const response = await loader();
      if (request !== generation) return;
      const parsed = bootstrapSchema.safeParse(response);
      if (!parsed.success)
        throw new RetailLoadError(
          'El servidor devolvió información incompatible. No se cargaron esos datos; vuelve a intentar o consulta con el administrador.',
        );
      if (parsed.data.profile.id !== userId)
        throw new RetailLoadError(
          'La sesión cambió y no coincide con la cuenta abierta. Inicia sesión nuevamente.',
          true,
        );
      const data = {
        ...parsed.data,
        settings: { ...parsed.data.settings, business_name: displayBusinessName(parsed.data.settings.business_name) },
      };
      publish({ data, error: '', refreshing: false, lastUpdated: new Date() });
    } catch (cause) {
      if (request === generation) {
        const discardData = accessRevoked(cause);
        publish({
          data: discardData ? null : snapshot.data,
          error: loadMessage(cause),
          refreshing: false,
          lastUpdated: discardData ? null : snapshot.lastUpdated,
        });
      }
      // Callers must know that their attempted refresh failed, even after a newer request.
      throw cause;
    }
  }

  function invalidate() {
    // Reusable after cleanup: React StrictMode starts the effect again with this store.
    generation++;
    publish({ ...snapshot, refreshing: false });
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    refresh,
    invalidate,
  };
}
