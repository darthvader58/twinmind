import { makeError, type TwinMindError } from '@/lib/types';

/** Errors thrown by mime selection carry a typed `twinMindError` so callers
 *  can surface a user-facing reason without re-classifying. */
export interface MimeError extends Error {
  twinMindError: TwinMindError;
}

const CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'] as const;

interface MediaRecorderLike {
  isTypeSupported: (mime: string) => boolean;
}

const getRecorder = (): MediaRecorderLike | undefined => {
  const g = globalThis as unknown as { MediaRecorder?: MediaRecorderLike };
  return g.MediaRecorder;
};

const wrap = (kind: 'mic_unavailable', message: string): MimeError => {
  const err = new Error(message) as MimeError;
  err.twinMindError = makeError(kind, message);
  return err;
};

/**
 * Pick the most compatible mime type the current browser supports.
 * Throws a `MimeError` carrying a `mic_unavailable` `TwinMindError` if
 * `MediaRecorder` is missing or none of the preferred mimes are supported.
 */
export const pickMime = (): string => {
  const Recorder = getRecorder();
  if (!Recorder) {
    throw wrap('mic_unavailable', 'This browser does not support recording.');
  }
  for (const mime of CANDIDATES) {
    if (Recorder.isTypeSupported(mime)) return mime;
  }
  throw wrap('mic_unavailable', 'No supported audio format in this browser.');
};
