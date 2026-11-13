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
