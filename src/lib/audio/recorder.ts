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
  speechFrames: number;
  totalFrames: number;
  peakRms: number;
  meanSpeakingRms: number;
}

type ChunkListener = (c: RollingRecorderChunk) => void;
type ErrorListener = (e: TwinMindError) => void;

interface RollingRecorderOptions {
  /** Max chunk length in seconds — rotation ceiling for the VAD loop. */
  chunkSeconds: number;
}

/** Below this duration we never rotate, even on long silence — Whisper
 *  accuracy degrades sharply on sub-3-second clips. */
export const MIN_CHUNK_SECONDS = 4;
/** Trailing silence required after speech before a pause-aware rotation. */
export const SILENCE_MS = 700;
/** RMS threshold (0–1, time-domain) above which a frame counts as speech. */
export const SILENCE_RMS_THRESHOLD = 0.012;

const FFT_SIZE = 1024;

/** Pure rotation predicate — exported so it can be unit-tested without an
 *  AudioContext. See CLAUDE.md §9 for the chunking contract. */
export function shouldRotate(args: {
  chunkAgeMs: number;
  lastSpeechAtMs: number;
  nowMs: number;
  minChunkMs: number;
  maxChunkMs: number;
  silenceMs: number;
}): boolean {
  if (args.chunkAgeMs >= args.maxChunkMs) return true;
  if (args.chunkAgeMs < args.minChunkMs) return false;
  if (args.lastSpeechAtMs <= 0) return false;
  return args.nowMs - args.lastSpeechAtMs >= args.silenceMs;
}

const errorName = (v: unknown): string | undefined => {
  if (typeof v !== 'object' || v === null) return undefined;
  const name = (v as { name?: unknown }).name;
  return typeof name === 'string' ? name : undefined;
};

interface AudioContextCtor {
  new (): AudioContext;
}

const getAudioContextCtor = (): AudioContextCtor | undefined => {
  const w = globalThis as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return w.AudioContext ?? w.webkitAudioContext;
};

/**
 * Owns the `MediaRecorder` lifecycle and produces self-contained, decodable
 * chunks that rotate at natural pauses (CLAUDE.md §9). A single `MediaRecorder`
 * runs at a time on the same stream, so chunks never overlap and ordering is
 * stable. Rotation is driven by a `requestAnimationFrame` VAD loop bounded by
 * `MIN_CHUNK_SECONDS` and the user-provided `chunkSeconds` ceiling.
 */
export class RollingRecorder {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private mime = '';
  private readonly maxChunkMs: number;
  private readonly minChunkMs = MIN_CHUNK_SECONDS * 1000;
  private currentStartedAtMs = 0;
  private chunkListeners: ChunkListener[] = [];
  private errorListeners: ErrorListener[] = [];
  private stopping = false;

  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private analyserSource: MediaStreamAudioSourceNode | null = null;
  private analyserBuf: Float32Array | null = null;
  private rafHandle: number | null = null;

  private currentChunkSpeechFrames = 0;
  private currentChunkTotalFrames = 0;
  private currentChunkPeakRms = 0;
  private currentChunkSpeakingRmsSum = 0;
  private currentChunkLastSpeechAtMs = 0;

  constructor(opts: RollingRecorderOptions) {
    this.maxChunkMs = Math.max(MIN_CHUNK_SECONDS, Math.floor(opts.chunkSeconds)) * 1000;
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
    this.setupAnalyser();
    this.startNewRecorder();
    this.scheduleVadFrame();
  }

  stop(): void {
    this.stopping = true;
    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
    const rec = this.recorder;
    if (rec && rec.state !== 'inactive') {
      try {
        rec.stop();
      } catch {
        /* noop — already stopped */
      }
    }
    this.teardownAnalyser();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.recorder = null;
  }

  private setupAnalyser(): void {
    const stream = this.stream;
    if (!stream) return;
    const Ctor = getAudioContextCtor();
    if (!Ctor) return;
    try {
      const ctx = new Ctor();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      source.connect(analyser);
      this.audioCtx = ctx;
      this.analyserSource = source;
      this.analyser = analyser;
      this.analyserBuf = new Float32Array(analyser.fftSize);
    } catch {
      /* analyser is best-effort; without it we still rotate on the maxChunkMs ceiling */
    }
  }

  private teardownAnalyser(): void {
    try {
      this.analyserSource?.disconnect();
    } catch {
      /* noop */
    }
    this.analyserSource = null;
    this.analyser = null;
    this.analyserBuf = null;
    const ctx = this.audioCtx;
    this.audioCtx = null;
    if (ctx) ctx.close().catch(() => {});
  }

  private scheduleVadFrame(): void {
    if (this.stopping) return;
    this.rafHandle = requestAnimationFrame(() => this.vadTick());
  }

  private vadTick(): void {
    if (this.stopping) return;
    const analyser = this.analyser;
    const buf = this.analyserBuf;
    const now = nowMs();
    if (analyser && buf) {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = buf[i] ?? 0;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / buf.length);
      this.currentChunkTotalFrames += 1;
      if (rms >= SILENCE_RMS_THRESHOLD) {
        this.currentChunkSpeechFrames += 1;
        this.currentChunkSpeakingRmsSum += rms;
        if (rms > this.currentChunkPeakRms) this.currentChunkPeakRms = rms;
        this.currentChunkLastSpeechAtMs = now;
      }
    }
    const chunkAgeMs = now - this.currentStartedAtMs;
    if (
      shouldRotate({
        chunkAgeMs,
        lastSpeechAtMs: this.currentChunkLastSpeechAtMs,
        nowMs: now,
        minChunkMs: this.minChunkMs,
        maxChunkMs: this.maxChunkMs,
        silenceMs: SILENCE_MS,
      })
    ) {
      this.rotate();
    }
    this.scheduleVadFrame();
  }

  private resetChunkTelemetry(): void {
    this.currentChunkSpeechFrames = 0;
    this.currentChunkTotalFrames = 0;
    this.currentChunkPeakRms = 0;
    this.currentChunkSpeakingRmsSum = 0;
    this.currentChunkLastSpeechAtMs = 0;
  }

  private startNewRecorder(): void {
    const stream = this.stream;
    if (!stream) return;
    const rec = new MediaRecorder(stream, { mimeType: this.mime });
    const startedAt = nowMs();
    this.currentStartedAtMs = startedAt;
    this.resetChunkTelemetry();
    const parts: Blob[] = [];
    const mime = this.mime;
    // Snapshot telemetry refs on the closure so the rotation that follows
    // doesn't race the next chunk's accumulators when onstop finally fires.
    const telemetry = {
      speechFrames: 0,
      totalFrames: 0,
      peakRms: 0,
      speakingRmsSum: 0,
    };
    rec.ondataavailable = (ev: BlobEvent) => {
      if (ev.data && ev.data.size > 0) parts.push(ev.data);
    };
    rec.onstop = () => {
      const blob = new Blob(parts, { type: mime });
      const durationMs = nowMs() - startedAt;
      const meanSpeakingRms =
        telemetry.speechFrames > 0
          ? telemetry.speakingRmsSum / telemetry.speechFrames
          : 0;
      if (blob.size > 0) {
        this.emitChunk({
          id: newId('c'),
          blob,
          mime,
          startedAtMs: startedAt,
          durationMs,
          speechFrames: telemetry.speechFrames,
          totalFrames: telemetry.totalFrames,
          peakRms: telemetry.peakRms,
          meanSpeakingRms,
        });
      }
      if (!this.stopping && this.stream) this.startNewRecorder();
    };
    rec.onerror = () => {
      this.emitError(
        makeError('mic_unavailable', 'MediaRecorder error during recording.'),
      );
    };
    // Stash the snapshot getter so rotate() can freeze accumulators atomically.
    (rec as unknown as { __twinMindTelemetry: typeof telemetry }).__twinMindTelemetry =
      telemetry;
    this.recorder = rec;
    rec.start();
  }

  private rotate(): void {
    const rec = this.recorder;
    if (!rec || rec.state === 'inactive') return;
    const telemetry = (
      rec as unknown as {
        __twinMindTelemetry?: {
          speechFrames: number;
          totalFrames: number;
          peakRms: number;
          speakingRmsSum: number;
        };
      }
    ).__twinMindTelemetry;
    if (telemetry) {
      telemetry.speechFrames = this.currentChunkSpeechFrames;
      telemetry.totalFrames = this.currentChunkTotalFrames;
      telemetry.peakRms = this.currentChunkPeakRms;
      telemetry.speakingRmsSum = this.currentChunkSpeakingRmsSum;
    }
    this.resetChunkTelemetry();
    try {
      rec.stop();
    } catch {
      /* noop — race with stop() */
    }
  }

  private emitChunk(c: RollingRecorderChunk): void {
    for (const cb of this.chunkListeners) cb(c);
  }

  private emitError(e: TwinMindError): void {
    for (const cb of this.errorListeners) cb(e);
  }
}

