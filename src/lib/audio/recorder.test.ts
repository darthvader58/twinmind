import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import type { TwinMindError } from '@/lib/types';

import { pickMime, type MimeError } from './mime';

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
