import { z } from 'zod';

import { isNoApiKeyError, makeGroq } from '@/lib/groq/client';
import { extractNodes } from '@/lib/groq/extract';
import { isWhisperHallucination } from '@/lib/groq/transcribe';
import { contentLengthError, jsonError, missingApiKeyError } from '@/lib/http';
import { buildExtractMessages } from '@/lib/prompts/assemble';
import { makeError } from '@/lib/types';

export const runtime = 'edge';

const MAX_EXTRACT_REQUEST_BYTES = 128 * 1024;
const MAX_EXTRACT_PROMPT_CHARS = 24_000;

const ExtractRequestSchema = z.object({
  chunkText: z.string().min(1).max(20_000),
  extractPrompt: z.string().min(1).max(MAX_EXTRACT_PROMPT_CHARS),
});

export async function POST(req: Request): Promise<Response> {
  const sizeError = contentLengthError(
    req,
    MAX_EXTRACT_REQUEST_BYTES,
    'Extract request body',
  );
  if (sizeError) return jsonError(sizeError);

  const apiKey = req.headers.get('x-groq-key') ?? '';
  if (!apiKey.trim()) {
    return jsonError(missingApiKeyError());
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(
      makeError('invalid_json', 'Request body was not valid JSON.'),
    );
  }

  const parsed = ExtractRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      makeError(
        'invalid_json',
        `Request body failed validation: ${parsed.error.message}`,
      ),
    );
  }

  if (isWhisperHallucination(parsed.data.chunkText)) {
    return Response.json({
      entities: [],
      claims: [],
      open_questions: [],
      tangent_seeds: [],
      latencyMs: 0,
    });
  }

  let client;
  try {
    client = makeGroq(apiKey);
  } catch (err) {
    if (isNoApiKeyError(err)) return jsonError(err.twinMindError);
    return jsonError(makeError('unknown', 'Failed to initialize Groq client.'));
  }

  const messages = buildExtractMessages({
    chunkText: parsed.data.chunkText,
    settings: { extractPrompt: parsed.data.extractPrompt },
  });

  const t0 = Date.now();
  const result = await extractNodes(client, messages);
  const latencyMs = Date.now() - t0;

  if (!result.ok) return jsonError(result.error);

  return Response.json({
    entities: result.data.entities,
    claims: result.data.claims,
    open_questions: result.data.open_questions,
    tangent_seeds: result.data.tangent_seeds,
    latencyMs,
  });
}
