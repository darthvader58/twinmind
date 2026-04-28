import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import type { TwinMindError } from '@/lib/types';

import { pickMime, type MimeError } from './mime';
import { isLocallySilentChunk, shouldRotate } from './recorder';

interface RecorderStub {
  isTypeSupported: (m: string) => boolean;
}

type GlobalShape = { MediaRecorder?: RecorderStub };

const g = globalThis as unknown as GlobalShape;

describe('pickMime', () => {
  let original: RecorderStub | undefined;

  beforeEach(() => {
    original = g.MediaRecorder;
  });

  afterEach(() => {
    if (original === undefined) delete g.MediaRecorder;
    else g.MediaRecorder = original;
  });

  it('throws mic_unavailable when MediaRecorder is missing', () => {
    delete g.MediaRecorder;
    let caught: MimeError | undefined;
    try {
      pickMime();
    } catch (err) {
      caught = err as MimeError;
    }
    expect(caught).toBeDefined();
    const tm = caught?.twinMindError as TwinMindError;
    expect(tm.kind).toBe('mic_unavailable');
  });

  it('throws mic_unavailable when no candidate mime is supported', () => {
    g.MediaRecorder = { isTypeSupported: () => false };
    let caught: MimeError | undefined;
    try {
      pickMime();
    } catch (err) {
      caught = err as MimeError;
    }
    expect(caught).toBeDefined();
    expect(caught?.twinMindError.kind).toBe('mic_unavailable');
  });

  it('prefers webm/opus when supported', () => {
    g.MediaRecorder = {
      isTypeSupported: (m: string) => m === 'audio/webm;codecs=opus',
    };
    expect(pickMime()).toBe('audio/webm;codecs=opus');
  });

  it('falls back to plain webm when opus is unsupported', () => {
    g.MediaRecorder = {
      isTypeSupported: (m: string) => m === 'audio/webm',
    };
    expect(pickMime()).toBe('audio/webm');
  });

  it('falls back to mp4 when only Safari mime is supported', () => {
    g.MediaRecorder = {
      isTypeSupported: (m: string) => m === 'audio/mp4',
    };
    expect(pickMime()).toBe('audio/mp4');
  });
});

describe('shouldRotate', () => {
  const base = { minChunkMs: 4000, maxChunkMs: 30000, silenceMs: 700 };

  it('keeps recording during pure silence below the ceiling', () => {
    expect(
      shouldRotate({ ...base, chunkAgeMs: 10_000, lastSpeechAtMs: 0, nowMs: 10_000 }),
    ).toBe(false);
  });

  it('rotates at the ceiling even with no speech', () => {
    expect(
      shouldRotate({ ...base, chunkAgeMs: 30_000, lastSpeechAtMs: 0, nowMs: 30_000 }),
    ).toBe(true);
  });

  it('rotates after speech followed by 800 ms of silence', () => {
    expect(
      shouldRotate({ ...base, chunkAgeMs: 6_000, lastSpeechAtMs: 5_200, nowMs: 6_000 }),
    ).toBe(true);
  });

  it('keeps recording when only 200 ms have passed since last speech', () => {
    expect(
      shouldRotate({ ...base, chunkAgeMs: 6_000, lastSpeechAtMs: 5_800, nowMs: 6_000 }),
    ).toBe(false);
  });

  it('respects the minimum chunk floor', () => {
    expect(
      shouldRotate({ ...base, chunkAgeMs: 3_000, lastSpeechAtMs: 0, nowMs: 3_000 }),
    ).toBe(false);
    expect(
      shouldRotate({ ...base, chunkAgeMs: 3_000, lastSpeechAtMs: 1_000, nowMs: 3_000 }),
    ).toBe(false);
  });

  it('rotates just past the floor when silence has been sustained', () => {
    expect(
      shouldRotate({ ...base, chunkAgeMs: 4_500, lastSpeechAtMs: 3_800, nowMs: 4_500 }),
    ).toBe(true);
  });

  it('does not rotate when speech is happening this exact frame', () => {
    expect(
      shouldRotate({ ...base, chunkAgeMs: 8_000, lastSpeechAtMs: 8_000, nowMs: 8_000 }),
    ).toBe(false);
  });
});

describe('isLocallySilentChunk', () => {
  it('returns true when no frame ever crossed the speech threshold', () => {
    expect(
      isLocallySilentChunk({ speechFrames: 0, totalFrames: 600, peakRms: 0.008 }),
    ).toBe(true);
  });

  it('returns true on essentially-silent room tone (sub-5% speech ratio + low peak)', () => {
    expect(
      isLocallySilentChunk({ speechFrames: 4, totalFrames: 600, peakRms: 0.04 }),
    ).toBe(true);
  });

  it('returns false when the analyser never ran (preserve recall via Whisper fallback)', () => {
    expect(
      isLocallySilentChunk({ speechFrames: 0, totalFrames: 0, peakRms: 0 }),
    ).toBe(false);
  });

  it('returns false on real-speech telemetry', () => {
    expect(
      isLocallySilentChunk({ speechFrames: 180, totalFrames: 600, peakRms: 0.18 }),
    ).toBe(false);
  });

  it('returns false when peak crosses the loudness floor even with low ratio', () => {
    expect(
      isLocallySilentChunk({ speechFrames: 4, totalFrames: 600, peakRms: 0.12 }),
    ).toBe(false);
  });
});
