import { describe, expect, it } from 'vitest';

import { classifyRole } from './useTranscriptionLoop';

describe('classifyRole', () => {
  it('returns unknown when there are no frames at all (analyser missing)', () => {
    expect(
      classifyRole({ speechFrames: 0, totalFrames: 0, peakRms: 0 }),
    ).toBe('unknown');
  });

  it('returns unknown when frames were sampled but none crossed the threshold', () => {
    expect(
      classifyRole({ speechFrames: 0, totalFrames: 200, peakRms: 0.005 }),
    ).toBe('unknown');
  });

  it('returns user when peakRms is loud (≥ 0.18) — wearer talking into the mic', () => {
    expect(
      classifyRole({ speechFrames: 100, totalFrames: 200, peakRms: 0.22 }),
    ).toBe('user');
  });

  it('returns other when peakRms is quiet (≤ 0.04) but speechRatio > 0.2 — remote audio', () => {
    expect(
      classifyRole({ speechFrames: 80, totalFrames: 200, peakRms: 0.03 }),
    ).toBe('other');
  });

  it('returns mixed for medium loudness (above 0.04 but under 0.18)', () => {
    expect(
      classifyRole({ speechFrames: 60, totalFrames: 200, peakRms: 0.1 }),
    ).toBe('mixed');
  });

  it('quiet audio with very low speech ratio is mixed (defensive — likely background noise, not other)', () => {
    expect(
      classifyRole({ speechFrames: 5, totalFrames: 200, peakRms: 0.03 }),
    ).toBe('mixed');
  });
});
