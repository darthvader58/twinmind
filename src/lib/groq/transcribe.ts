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

const HALLUCINATION_PATTERNS: RegExp[] = [
  /^thank you[.!?]?$/i,
  /^thanks( for watching)?[.!?]?$/i,
  /^please subscribe[.!?]?$/i,
  /^bye[.!?]?$/i,
  /^\.+$/,
  /^y(?:o)?u{1,4}[.!?]?$/i,
  /^\(silence\)$/i,
  /^\[music\]$/i,
  /^subtitles by .*$/i,
  /^transcribed by .*$/i,
  /^\[.*\]$/,
];

const REPEATED_PHRASE = /^(\b[\w']{1,12}\b)([ ,.!?-]+\1){2,}[.!?]?$/i;

/**
 * Whisper Large V3 hallucinates filler text on silent or near-silent audio
 * ("Thank you for watching", "Please subscribe", a single dot, repeats of
 * "you", etc.). Pure; safe for unit tests.
 */
export function isWhisperHallucination(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed === '') return true;
  if (trimmed.length <= 25) {
    for (const pat of HALLUCINATION_PATTERNS) {
      if (pat.test(trimmed)) return true;
    }
  }
  if (REPEATED_PHRASE.test(trimmed)) return true;
  return false;
}

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
      prompt: '',
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
    const cleaned = isWhisperHallucination(text) ? '' : text;
    return {
      ok: true,
      data: {
        text: cleaned,
        durationMs: typeof duration === 'number' ? Math.round(duration * 1000) : 0,
        language: typeof language === 'string' ? language : 'unknown',
      },
    };
  } catch (err) {
    return { ok: false, error: mapGroqError(err) };
  }
}
