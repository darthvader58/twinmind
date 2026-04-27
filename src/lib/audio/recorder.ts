import { newId } from '@/lib/ids';
import { nowMs } from '@/lib/time';
import { makeError, type TwinMindError } from '@/lib/types';

import { pickMime, type MimeError } from './mime';

export interface RollingRecorderChunk {
  id: string;
  blob: Blob;
  mime: string;
  startedAtMs: number;
  durationMs: number;
}

type ChunkListener = (c: RollingRecorderChunk) => void;
type ErrorListener = (e: TwinMindError) => void;

interface RollingRecorderOptions {
  /** Length of each rolled chunk in seconds. Clamped to ≥ 5s. */
  chunkSeconds: number;
}

const hasTwinMindError = (
  v: unknown,
): v is { twinMindError: TwinMindError } => {
  if (typeof v !== 'object' || v === null) return false;
  const tm = (v as { twinMindError?: unknown }).twinMindError;
  return typeof tm === 'object' && tm !== null && 'kind' in tm;
};

const errorName = (v: unknown): string | undefined => {
  if (typeof v !== 'object' || v === null) return undefined;
  const name = (v as { name?: unknown }).name;
  return typeof name === 'string' ? name : undefined;
};

/**
 * Owns the `MediaRecorder` lifecycle and produces self-contained, decodable
 * chunks every `chunkSeconds`. Implements the stop→start handover described in
 * CLAUDE.md §9: a single recorder runs at a time on the same stream, so chunks
 * never overlap and ordering is stable.
 */
export class RollingRecorder {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private mime = '';
  private readonly chunkMs: number;
  private interval: ReturnType<typeof setInterval> | null = null;
  private currentStartedAtMs = 0;
  private chunkListeners: ChunkListener[] = [];
  private errorListeners: ErrorListener[] = [];
  private stopping = false;

  constructor(opts: RollingRecorderOptions) {
    this.chunkMs = Math.max(5, Math.floor(opts.chunkSeconds)) * 1000;
  }

  on(event: 'chunk', cb: ChunkListener): void;
  on(event: 'error', cb: ErrorListener): void;
  on(event: 'chunk' | 'error', cb: ChunkListener | ErrorListener): void {
    if (event === 'chunk') this.chunkListeners.push(cb as ChunkListener);
    else this.errorListeners.push(cb as ErrorListener);
  }

  async start(): Promise<void> {
    try {
      this.mime = pickMime();
    } catch (err) {
      const tm = (err as MimeError).twinMindError;
      this.emitError(tm);
      throw err;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      });
    } catch (err) {
      const wrapped =
        errorName(err) === 'NotAllowedError'
          ? makeError('mic_denied', 'Microphone access was denied.')
          : makeError('mic_unavailable', 'Microphone is unavailable.', err);
      this.emitError(wrapped);
      const e = new Error(wrapped.message) as Error & {
        twinMindError: TwinMindError;
      };
      e.twinMindError = wrapped;
      throw e;
    }
    this.startNewRecorder();
    this.interval = setInterval(() => this.rotate(), this.chunkMs);
  }

  stop(): void {
    this.stopping = true;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    const rec = this.recorder;
    if (rec && rec.state !== 'inactive') {
      try {
        rec.stop();
      } catch {
        /* noop — already stopped */
      }
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.recorder = null;
  }

  private startNewRecorder(): void {
    const stream = this.stream;
    if (!stream) return;
    const rec = new MediaRecorder(stream, { mimeType: this.mime });
    const startedAt = nowMs();
    this.currentStartedAtMs = startedAt;
    const parts: Blob[] = [];
    const mime = this.mime;
    rec.ondataavailable = (ev: BlobEvent) => {
      if (ev.data && ev.data.size > 0) parts.push(ev.data);
    };
    rec.onstop = () => {
      const blob = new Blob(parts, { type: mime });
      const durationMs = nowMs() - startedAt;
      if (blob.size > 0) {
        this.emitChunk({
          id: newId('c'),
          blob,
          mime,
          startedAtMs: startedAt,
          durationMs,
        });
      }
      // Hand off to a fresh recorder unless stop() was explicitly requested.
      if (!this.stopping && this.stream) this.startNewRecorder();
    };
    rec.onerror = () => {
      this.emitError(
        makeError('mic_unavailable', 'MediaRecorder error during recording.'),
      );
    };
    this.recorder = rec;
    rec.start();
  }

  private rotate(): void {
    const rec = this.recorder;
    if (!rec || rec.state === 'inactive') return;
    try {
      rec.stop();
    } catch {
      /* noop — race with stop() */
    }
    // onstop will spawn the next recorder; this guarantees no two recorders
    // are ever live on the same stream simultaneously.
  }

  private emitChunk(c: RollingRecorderChunk): void {
    for (const cb of this.chunkListeners) cb(c);
  }

  private emitError(e: TwinMindError): void {
    for (const cb of this.errorListeners) cb(e);
  }
}
