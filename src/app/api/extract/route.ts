import { z } from 'zod';

import { isNoApiKeyError, makeGroq } from '@/lib/groq/client';
import { toSafeError } from '@/lib/groq/errors';
import { extractNodes } from '@/lib/groq/extract';
import { isWhisperHallucination } from '@/lib/groq/transcribe';
import { buildExtractMessages } from '@/lib/prompts/assemble';
import { makeError, type TwinMindError } from '@/lib/types';

export const runtime = 'edge';

const ExtractRequestSchema = z.object({
  chunkText: z.string().min(1).max(20000),
  extractPrompt: z.string().min(1),
});

const STATUS_BY_KIND: Record<TwinMindError['kind'], number> = {
  no_api_key: 400,
  groq_unauthorized: 401,
  groq_rate_limit: 429,
  groq_server: 502,
  invalid_json: 400,
  mic_denied: 400,
  mic_unavailable: 400,
  network: 502,
  unknown: 500,
};

function errorResponse(error: TwinMindError): Response {
  return Response.json(
    { error: toSafeError(error) },
    { status: STATUS_BY_KIND[error.kind] },
  );
}

export async function POST(req: Request): Promise<Response> {
  const apiKey = req.headers.get('x-groq-key') ?? '';
  if (!apiKey.trim()) {
    return errorResponse(
      makeError(
        'no_api_key',
        'Missing x-groq-key header. Open Settings and paste your key.',
      ),
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse(
      makeError('invalid_json', 'Request body was not valid JSON.'),
    );
  }

  const parsed = ExtractRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
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
    if (isNoApiKeyError(err)) return errorResponse(err.twinMindError);
    return errorResponse(makeError('unknown', 'Failed to initialize Groq client.'));
  }

  const messages = buildExtractMessages({
    chunkText: parsed.data.chunkText,
    settings: { extractPrompt: parsed.data.extractPrompt },
  });

  const t0 = Date.now();
  const result = await extractNodes(client, messages);
  const latencyMs = Date.now() - t0;

  if (!result.ok) return errorResponse(result.error);

  return Response.json({
    entities: result.data.entities,
    claims: result.data.claims,
    open_questions: result.data.open_questions,
    tangent_seeds: result.data.tangent_seeds,
    latencyMs,
  });
}
