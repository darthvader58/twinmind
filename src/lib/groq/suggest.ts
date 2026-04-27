import type Groq from 'groq-sdk';

import type { ChatMsg } from '@/lib/prompts/assemble';
import {
  SuggestionsResponseSchema,
  type SuggestionsResponse,
} from '@/lib/prompts/schemas';
import { makeError, type TwinMindError } from '@/lib/types';

import { mapGroqError } from './errors';

export type SuggestReturn =
  | { ok: true; data: SuggestionsResponse }
  | { ok: false; error: TwinMindError };

const SUGGEST_MODEL = 'openai/gpt-oss-120b';
const SUGGEST_TEMPERATURE = 0.4;
const SUGGEST_MAX_TOKENS = 1000;

const STRICT_REMINDER =
  'STRICT REMINDER: Return ONLY a valid JSON object with the shape ' +
  '{"suggestions": [...]} containing exactly 3 items. No prose. ' +
  'No markdown fences. No commentary.';

async function callOnce(
  client: Groq,
  msgs: ChatMsg[],
): Promise<SuggestReturn> {
  try {
    const res = await client.chat.completions.create({
      model: SUGGEST_MODEL,
      messages: msgs,
      response_format: { type: 'json_object' },
      temperature: SUGGEST_TEMPERATURE,
      max_tokens: SUGGEST_MAX_TOKENS,
    });
    const content = res.choices[0]?.message?.content ?? '';
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return {
        ok: false,
        error: makeError('invalid_json', 'Model returned non-JSON content.'),
      };
    }
    const result = SuggestionsResponseSchema.safeParse(parsed);
    if (!result.success) {
      return {
        ok: false,
        error: makeError(
          'invalid_json',
          `Suggestion JSON failed validation: ${result.error.message}`,
        ),
      };
    }
    return { ok: true, data: result.data };
  } catch (err) {
    return { ok: false, error: mapGroqError(err) };
  }
}

/**
 * Calls the suggestion model once. If the result fails JSON-schema validation,
 * retries exactly once with a stricter user-side reminder appended. Other
 * errors (network, auth, rate-limit) propagate immediately.
 */
export async function generateSuggestions(
  client: Groq,
  messages: ChatMsg[],
): Promise<SuggestReturn> {
  const first = await callOnce(client, messages);
  if (first.ok) return first;
  if (first.error.kind !== 'invalid_json') return first;

  const stricter: ChatMsg[] = [
    ...messages,
    { role: 'user', content: STRICT_REMINDER },
  ];
  return callOnce(client, stricter);
}
