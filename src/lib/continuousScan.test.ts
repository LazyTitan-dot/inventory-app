import { describe, expect, it } from 'vitest';
import { advanceContinuousScan, newContinuousScanGate } from './continuousScan';

describe('continuous receipt scanning', () => {
  it('counts a stationary code once even across long decoder intervals', () => {
    const first = advanceContinuousScan(newContinuousScanGate(), 'A', 0);
    expect(first.detect).toBe(true);
    expect(advanceContinuousScan(first.gate, 'A', 5000).detect).toBe(false);
  });
  it('requires a clear view before another product, including the same SKU', () => {
    let gate = advanceContinuousScan(newContinuousScanGate(), 'A', 0).gate;
    gate = advanceContinuousScan(gate, null, 200).gate;
    gate = advanceContinuousScan(gate, null, 950).gate;
    expect(advanceContinuousScan(gate, 'A', 1100).detect).toBe(true);
    expect(advanceContinuousScan(gate, 'B', 1100).detect).toBe(true);
  });
  it('does not rearm on brief decoder misses or alternating visible codes', () => {
    let gate = advanceContinuousScan(newContinuousScanGate(), 'A', 0).gate;
    gate = advanceContinuousScan(gate, null, 200).gate;
    const second = advanceContinuousScan(gate, 'B', 400);
    expect(second.detect).toBe(false);
    gate = advanceContinuousScan(second.gate, null, 500).gate;
    expect(advanceContinuousScan(gate, 'A', 1200).detect).toBe(false);
  });
});
