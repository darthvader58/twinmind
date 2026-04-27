import { z } from 'zod';

import { isNoApiKeyError, makeGroq } from '@/lib/groq/client';
import { toSafeError } from '@/lib/groq/errors';
import { generateSuggestions } from '@/lib/groq/suggest';
import { newId } from '@/lib/ids';
import { buildSuggestMessages } from '@/lib/prompts/assemble';
import { TopicGraphNodeWireSchema } from '@/lib/prompts/schemas';
import { makeError, type Suggestion, type TwinMindError } from '@/lib/types';

export const runtime = 'edge';

const SuggestRequestSchema = z.object({
  transcriptWindow: z.string(),
  previousPreviews: z.array(z.string()).max(20),
  suggestPrompt: z.string().min(1),
  contextChars: z.number().int().nonnegative(),
  topicGraph: z.array(TopicGraphNodeWireSchema).max(60).default([]),
  annotatedTranscript: z.string().optional(),
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

  const parsed = SuggestRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      makeError(
        'invalid_json',
        `Request body failed validation: ${parsed.error.message}`,
      ),
    );
  }

  let client;
  try {
    client = makeGroq(apiKey);
  } catch (err) {
    if (isNoApiKeyError(err)) return errorResponse(err.twinMindError);
    return errorResponse(makeError('unknown', 'Failed to initialize Groq client.'));
  }

  const messages = buildSuggestMessages({
    transcriptWindow: parsed.data.transcriptWindow,
    previousPreviews: parsed.data.previousPreviews,
    settings: { suggestPrompt: parsed.data.suggestPrompt },
    topicGraph: parsed.data.topicGraph,
    ...(parsed.data.annotatedTranscript !== undefined
      ? { annotatedTranscript: parsed.data.annotatedTranscript }
      : {}),
  });

  const t0 = Date.now();
  const result = await generateSuggestions(client, messages);
  const latencyMs = Date.now() - t0;

  if (!result.ok) return errorResponse(result.error);

  const items = result.data.suggestions;
  if (items.length !== 3) {
    return errorResponse(
      makeError(
        'invalid_json',
        `Expected 3 suggestions, got ${items.length}.`,
      ),
    );
  }
  const [a, b, c] = items;
  if (!a || !b || !c) {
    return errorResponse(
      makeError('invalid_json', 'Suggestion list contained empty entries.'),
    );
  }

  const suggestions: [Suggestion, Suggestion, Suggestion] = [
    { id: newId('s'), type: a.type, preview: a.preview },
    { id: newId('s'), type: b.type, preview: b.preview },
    { id: newId('s'), type: c.type, preview: c.preview },
  ];

  return Response.json({
    suggestions,
    generatedAt: Date.now(),
    latencyMs,
  });
}
