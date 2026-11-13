/** Require a clear view before counting another physical unit, even if two units share a code.
 * A brief decoder miss is not sufficient to rearm the scanner.
 */
export const CONTINUOUS_CLEAR_MS = 750;
export type ContinuousScanGate = { armed: boolean; clearSince: number | null };
export const newContinuousScanGate = (): ContinuousScanGate => ({ armed: true, clearSince: null });

export function advanceContinuousScan(gate: ContinuousScanGate, code: string | null | undefined, at: number): { gate: ContinuousScanGate; detect: boolean } {
  if (code?.trim()) {
    if (!gate.armed) return { gate: { armed: false, clearSince: null }, detect: false };
    return { gate: { armed: false, clearSince: null }, detect: true };
  }
  if (gate.armed) return { gate, detect: false };
  const clearSince = gate.clearSince ?? at;
  return { gate: at - clearSince >= CONTINUOUS_CLEAR_MS ? newContinuousScanGate() : { armed: false, clearSince }, detect: false };
}

/** One source of truth for the accessible camera readiness indicator. */
export function continuousScanStatus({ complete, running, starting, armed }: { complete: boolean; running: boolean; starting: boolean; armed: boolean }) {
  if (complete) return { state: 'complete', label: '¡Todas las unidades contabilizadas!', detail: 'Revisa el conteo y confirma la recepción. Aún no se ha guardado.' } as const;
  if (starting) return { state: 'waiting', label: 'Preparando cámara', detail: 'Espera a que la cámara esté lista.' } as const;
  if (!running) return { state: 'waiting', label: 'Cámara no lista', detail: 'Activa la cámara para comenzar a escanear.' } as const;
  if (!armed) return { state: 'waiting', label: 'Retira el código', detail: 'Retira el código de la vista hasta que el indicador vuelva a verde.' } as const;
  return { state: 'ready', label: 'Listo para escanear', detail: 'Acerca el código de la siguiente unidad.' } as const;
}
