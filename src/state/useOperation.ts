import { useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/errors';
import type { Action, CommandResult } from '../lib/contracts';
import { useRetail } from './useRetail';
import { pendingOperation } from '../lib/operationIds';

export function useOperation() {
  const { refresh, notify, data } = useRetail();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const running = useRef(false);
  async function run(action: Action, payload: Record<string, unknown>): Promise<CommandResult> {
    if (running.current) throw new Error('La operación ya está en curso.');
    if (!supabase) throw new Error('No hay conexión configurada.');
    running.current = true; setBusy(true); setError('');
    try {
      let storage: Storage | undefined;
      try { storage = window.sessionStorage; } catch { /* Private mode can disable storage. */ }
      const operation = await pendingOperation(data.profile.id,action,payload,storage);
      const response = await supabase.rpc('retail_command', { p_operation: operation.id, p_action: action, p_payload: payload });
      if (response.error) throw response.error;
      const result = response.data as CommandResult;
      operation.complete();
      try { await refresh(); } catch { notify('La operación se guardó. No pudimos actualizar la vista; usa Actualizar para consultar los datos.'); }
      return result;
    } catch (cause) { setError(errorMessage(cause)); throw cause; }
    finally { running.current = false; setBusy(false); }
  }
  return { run, busy, error, clearError: () => setError('') };
}
