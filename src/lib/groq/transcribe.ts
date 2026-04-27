import type Groq from 'groq-sdk';

import { makeError, type TwinMindError } from '@/lib/types';

import { mapGroqError } from './errors';

export interface TranscribeResult {
  text: string;
  durationMs: number;
  language: string;
}

export type TranscribeReturn =
  | { ok: true; data: TranscribeResult }
  | { ok: false; error: TwinMindError };

/**
 * Transcribes a single audio chunk via Whisper Large V3 in verbose_json mode.
 * The static SDK type only exposes `text`, but verbose_json also returns
 * `duration` (seconds) and `language` — we read them defensively.
 */
export async function transcribeChunk(
  client: Groq,
  file: File,
): Promise<TranscribeReturn> {
  try {
    const res = await client.audio.transcriptions.create({
      model: 'whisper-large-v3',
      file,
      response_format: 'verbose_json',
      temperature: 0,
    });
    const text = (res as { text?: unknown }).text;
    const duration = (res as { duration?: unknown }).duration;
    const language = (res as { language?: unknown }).language;
    if (typeof text !== 'string') {
      return {
        ok: false,
        error: makeError('invalid_json', 'Whisper returned no text field.'),
      };
    }
    return {
      ok: true,
      data: {
        text,
        durationMs: typeof duration === 'number' ? Math.round(duration * 1000) : 0,
        language: typeof language === 'string' ? language : 'unknown',
      },
    };
  } catch (err) {
    return { ok: false, error: mapGroqError(err) };
  }
}
