'use client';

import { useCallback, useEffect, useRef } from 'react';

import { RollingRecorder, type RollingRecorderChunk } from '@/lib/audio/recorder';
import { useSessionStore } from '@/lib/store/session';
import { useSettingsStore } from '@/lib/store/settings';
import { makeError, type TwinMindError } from '@/lib/types';

export interface UseRecorderApi {
  start: () => Promise<void>;
  stop: () => void;
  /** Subscribe to chunks. Returns an unsubscribe function. */
  onChunk: (cb: (c: RollingRecorderChunk) => void) => () => void;
}

const extractError = (err: unknown): TwinMindError | undefined => {
  if (typeof err !== 'object' || err === null) return undefined;
  const tm = (err as { twinMindError?: unknown }).twinMindError;
  if (typeof tm === 'object' && tm !== null && 'kind' in tm) {
    return tm as TwinMindError;
  }
  return undefined;
};

/**
 * React-side wrapper around `RollingRecorder`. Owns the recorder ref,
 * mirrors lifecycle into `useSessionStore.recording`, and lets consumers
 * subscribe to chunks directly (so the transcription loop can stay
 * decoupled from the store's chunk list).
 */
export const useRecorder = (): UseRecorderApi => {
  const recorderRef = useRef<RollingRecorder | null>(null);
  const chunkListeners = useRef<Set<(c: RollingRecorderChunk) => void>>(
    new Set(),
  );
  const setRecording = useSessionStore((s) => s.setRecording);

  useEffect(
    () => () => {
      recorderRef.current?.stop();
      recorderRef.current = null;
    },
    [],
  );

  const start = useCallback(async () => {
    if (recorderRef.current) return;
    setRecording('starting');
    const chunkSeconds = useSettingsStore.getState().chunkSeconds;
    const rec = new RollingRecorder({ chunkSeconds });
    rec.on('chunk', (c) => {
      for (const cb of chunkListeners.current) cb(c);
    });
    rec.on('error', (e: TwinMindError) => {
      setRecording('error', e);
    });
    recorderRef.current = rec;
    try {
      await rec.start();
      setRecording('recording');
    } catch (err) {
      const tm =
        extractError(err) ??
        makeError('mic_unavailable', 'Could not start recording.', err);
      setRecording('error', tm);
      recorderRef.current = null;
    }
  }, [setRecording]);

  const stop = useCallback(() => {
    if (!recorderRef.current) {
      setRecording('idle');
      return;
    }
    setRecording('stopping');
    recorderRef.current.stop();
    recorderRef.current = null;
    setRecording('idle');
  }, [setRecording]);

  const onChunk = useCallback((cb: (c: RollingRecorderChunk) => void) => {
    chunkListeners.current.add(cb);
    return () => {
      chunkListeners.current.delete(cb);
    };
  }, []);

  return { start, stop, onChunk };
};
