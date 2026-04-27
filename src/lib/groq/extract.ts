import type Groq from 'groq-sdk';

import type { ChatMsg } from '@/lib/prompts/assemble';
import {
  ExtractResponseSchema,
  type ExtractResponse,
} from '@/lib/prompts/schemas';
import { makeError, type TwinMindError } from '@/lib/types';

import { mapGroqError } from './errors';

export type ExtractReturn =
  | { ok: true; data: ExtractResponse }
  | { ok: false; error: TwinMindError };

const EXTRACT_MODEL = 'openai/gpt-oss-120b';
const EXTRACT_TEMPERATURE = 0.2;
const EXTRACT_MAX_TOKENS = 500;

/**
 * Best-effort knowledge-graph extraction over a single transcript chunk.
 * No retry: failures are silent — they degrade live suggestions but never
 * surface to the user. Caller fire-and-forgets per chunk.
 */
export async function extractNodes(
  client: Groq,
  messages: ChatMsg[],
): Promise<ExtractReturn> {
  try {
    const res = await client.chat.completions.create({
      model: EXTRACT_MODEL,
      messages,
      response_format: { type: 'json_object' },
      temperature: EXTRACT_TEMPERATURE,
      max_tokens: EXTRACT_MAX_TOKENS,
    });
    const content = res.choices[0]?.message?.content ?? '';
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return {
        ok: false,
        error: makeError(
          'invalid_json',
          'Extract model returned non-JSON content.',
        ),
      };
    }
    const result = ExtractResponseSchema.safeParse(parsed);
    if (!result.success) {
      return {
        ok: false,
        error: makeError(
          'invalid_json',
          `Extract JSON failed validation: ${result.error.message}`,
        ),
      };
    }
    return { ok: true, data: result.data };
  } catch (err) {
    return { ok: false, error: mapGroqError(err) };
  }
}
