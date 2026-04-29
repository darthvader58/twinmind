import { z } from 'zod';

import { isNoApiKeyError, makeGroq } from '@/lib/groq/client';
import { generateSuggestions } from '@/lib/groq/suggest';
import { contentLengthError, jsonError, missingApiKeyError } from '@/lib/http';
import { newId } from '@/lib/ids';
import { buildSuggestMessages } from '@/lib/prompts/assemble';
import { TopicGraphNodeWireSchema } from '@/lib/prompts/schemas';
import { makeError, type Suggestion } from '@/lib/types';

export const runtime = 'edge';

const MAX_SUGGEST_REQUEST_BYTES = 256 * 1024;
const MAX_PREVIEW_CHARS = 280;
const MAX_PROMPT_CHARS = 24_000;
const MAX_TRANSCRIPT_CHARS = 48_000;
const MAX_CONTEXT_CHARS = 48_000;

const SuggestRequestSchema = z.object({
  transcriptWindow: z.string().max(MAX_TRANSCRIPT_CHARS),
  previousPreviews: z.array(z.string().max(MAX_PREVIEW_CHARS)).max(20),
  suggestPrompt: z.string().min(1).max(MAX_PROMPT_CHARS),
  contextChars: z.number().int().nonnegative().max(MAX_CONTEXT_CHARS),
  topicGraph: z.array(TopicGraphNodeWireSchema).max(60).default([]),
  annotatedTranscript: z.string().max(MAX_TRANSCRIPT_CHARS).optional(),
});

export async function POST(req: Request): Promise<Response> {
  const sizeError = contentLengthError(
    req,
    MAX_SUGGEST_REQUEST_BYTES,
    'Suggest request body',
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

  const parsed = SuggestRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
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
    if (isNoApiKeyError(err)) return jsonError(err.twinMindError);
    return jsonError(makeError('unknown', 'Failed to initialize Groq client.'));
  }

  const RECENCY_MS = 90_000;
  const now = Date.now();
  const unansweredQuestions = parsed.data.topicGraph
    .filter(
      (n) =>
        n.kind === 'open_question' &&
        !n.covered &&
        now - n.lastMentionedAtMs <= RECENCY_MS,
    )
    .slice(-3)
    .map((n) => n.display);

  const messages = buildSuggestMessages({
    transcriptWindow: parsed.data.transcriptWindow,
    previousPreviews: parsed.data.previousPreviews,
    settings: { suggestPrompt: parsed.data.suggestPrompt },
    topicGraph: parsed.data.topicGraph,
    ...(parsed.data.annotatedTranscript !== undefined
      ? { annotatedTranscript: parsed.data.annotatedTranscript }
      : {}),
    ...(unansweredQuestions.length > 0 ? { unansweredQuestions } : {}),
  });

  const t0 = Date.now();
  const result = await generateSuggestions(client, messages);
  const latencyMs = Date.now() - t0;

  if (!result.ok) return jsonError(result.error);

  const items = result.data.suggestions;
  if (items.length !== 3) {
    return jsonError(
      makeError(
        'invalid_json',
        `Expected 3 suggestions, got ${items.length}.`,
      ),
    );
  }
  const [a, b, c] = items;
  if (!a || !b || !c) {
    return jsonError(
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
