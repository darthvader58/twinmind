import type Groq from 'groq-sdk';
import { z } from 'zod';

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

export interface WhisperSegment {
  no_speech_prob: number;
  avg_logprob: number;
  start: number;
  end: number;
}

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
  /^terima kasih( telah| sudah)? menonton[.!?]?$/i,
  /^gracias por (ver|mirar)( el video)?[.!?]?$/i,
  /^suscríbete[.!?]?$/i,
  /^obrigado por (assistir|ver)[.!?]?$/i,
  /^merci d['']avoir regardé( la vidéo)?[.!?]?$/i,
  /^abonnez-vous[.!?]?$/i,
  /^danke (fürs|für das) zuschauen[.!?]?$/i,
  /^abonniert (den kanal|uns)[.!?]?$/i,
  /^grazie per (aver guardato|la visione)[.!?]?$/i,
  /^ご(視聴|清聴)ありがとうございました[。.!?]?$/,
  /^(谢谢|感谢)(观看|收看)[。.!?]?$/,
  /^请(订阅|关注)[。.!?]?$/,
  /^시청해주셔서 감사합니다[.!?]?$/,
  /^спасибо за просмотр[.!?]?$/i,
  /^شكرا لكم على المشاهدة[.!?]?$/,
  /^देखने के लिए धन्यवाद[.!?]?$/,
  /^cảm ơn (các bạn )?đã (xem|theo dõi)[.!?]?$/i,
  /^[Iİi]zlediğiniz için teşekkür(ler| ederim)[.!?]?$/iu,
];

const REPEATED_PHRASE = /^(\b[\w']{1,12}\b)([ ,.!?-]+\1){2,}[.!?]?$/i;

/**
 * Whisper Large V3 hallucinates filler text on silent or near-silent audio
 * ("Thank you for watching", "Please subscribe", a single dot, repeats of
 * "you", cross-language thank-yous, etc.). Pure; safe for unit tests.
 */
export function isWhisperHallucination(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed === '') return true;
  if (trimmed.length <= 80) {
    for (const pat of HALLUCINATION_PATTERNS) {
      if (pat.test(trimmed)) return true;
    }
  }
  if (REPEATED_PHRASE.test(trimmed)) return true;
  return false;
}

const SegmentSchema = z.object({
  no_speech_prob: z.number(),
  avg_logprob: z.number(),
  start: z.number(),
  end: z.number(),
});
const SegmentsSchema = z.array(SegmentSchema);

/**
 * Whisper's verbose_json segments expose per-segment `no_speech_prob` and
 * `avg_logprob`. These are the model's own silence/confidence signals and
 * work in every language, unlike the regex fallback. Pure.
 */
export function isLikelySilenceFromSegments(
  segments: WhisperSegment[],
  text: string,
): boolean {
  if (segments.length === 0) return false;
  let total = 0;
  for (const s of segments) {
    total += Math.max(0, s.end - s.start);
  }
  if (total <= 0) return false;
  let weightedNoSpeech = 0;
  let weightedAvgLogprob = 0;
  for (const s of segments) {
    const dur = Math.max(0, s.end - s.start);
    weightedNoSpeech += s.no_speech_prob * dur;
    weightedAvgLogprob += s.avg_logprob * dur;
  }
  weightedNoSpeech /= total;
  weightedAvgLogprob /= total;
  if (weightedNoSpeech >= 0.6) return true;
  if (weightedAvgLogprob <= -1.0 && text.trim().length <= 30) return true;
  return false;
}

/**
 * Transcribes a single audio chunk via Whisper Large V3 in verbose_json mode.
 * The static SDK type only exposes `text`, but verbose_json also returns
 * `duration` (seconds), `language`, and `segments[]` — we read them
 * defensively and validate `segments` with Zod.
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
    const rawSegments = (res as { segments?: unknown }).segments;
    const parsedSegments = SegmentsSchema.safeParse(rawSegments);
    const segments: WhisperSegment[] = parsedSegments.success ? parsedSegments.data : [];
    if (typeof text !== 'string') {
      return {
        ok: false,
        error: makeError('invalid_json', 'Whisper returned no text field.'),
      };
    }
    const isSilent =
      isLikelySilenceFromSegments(segments, text) || isWhisperHallucination(text);
    const cleaned = isSilent ? '' : text;
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
