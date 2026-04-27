import { z } from 'zod';

import { isNoApiKeyError, makeGroq } from '@/lib/groq/client';
import { streamChat } from '@/lib/groq/chat';
import { toSafeError } from '@/lib/groq/errors';
import {
  buildChatMessages,
  buildExpandMessages,
  sizeTranscript,
  type ChatMsg,
} from '@/lib/prompts/assemble';
import { SuggestionTypeSchema } from '@/lib/prompts/schemas';
import { sseStream } from '@/lib/sse/server';
import { makeError, type TwinMindError } from '@/lib/types';

export const runtime = 'edge';

const SuggestionShape = z.object({
  id: z.string(),
  type: SuggestionTypeSchema,
  preview: z.string(),
});

const ChatHistoryItem = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant']),
  text: z.string(),
  createdAt: z.number(),
});

const ChatRequestSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('expand'),
    suggestion: SuggestionShape,
    transcript: z.string(),
    history: z.array(ChatHistoryItem),
    expandPrompt: z.string().min(1),
    chatPrompt: z.string().min(1),
    expandContextChars: z.number().int().positive(),
    chatContextChars: z.number().int().positive(),
  }),
  z.object({
    mode: z.literal('chat'),
    userText: z.string().min(1),
    transcript: z.string(),
    history: z.array(ChatHistoryItem),
    expandPrompt: z.string().min(1),
    chatPrompt: z.string().min(1),
    expandContextChars: z.number().int().positive(),
    chatContextChars: z.number().int().positive(),
  }),
]);

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

function jsonError(error: TwinMindError): Response {
  return Response.json(
    { error: toSafeError(error) },
    { status: STATUS_BY_KIND[error.kind] },
  );
}

export async function POST(req: Request): Promise<Response> {
  const apiKey = req.headers.get('x-groq-key') ?? '';
  if (!apiKey.trim()) {
    return jsonError(
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
    return jsonError(
      makeError('invalid_json', 'Request body was not valid JSON.'),
    );
  }

  const parsed = ChatRequestSchema.safeParse(body);
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

  const data = parsed.data;
  const ceiling =
    data.mode === 'expand' ? data.expandContextChars : data.chatContextChars;
  const sized = sizeTranscript(data.transcript, ceiling);
  const messages: ChatMsg[] =
    data.mode === 'expand'
      ? buildExpandMessages({
          suggestion: data.suggestion,
          transcript: sized,
          settings: { expandPrompt: data.expandPrompt },
        })
      : buildChatMessages({
          history: data.history,
          userText: data.userText,
          transcript: sized,
          settings: { chatPrompt: data.chatPrompt },
        });

  return sseStream(async (send) => {
    const t0 = Date.now();
    let firstTokenMs = 0;
    for await (const ev of streamChat(client, messages)) {
      if (ev.kind === 'token') {
        if (firstTokenMs === 0) firstTokenMs = Date.now() - t0;
        send('token', { t: ev.t });
      } else if (ev.kind === 'done') {
        send('done', { latencyMs: Date.now() - t0, firstTokenMs });
      } else {
        send('error', { error: toSafeError(ev.error) });
      }
    }
  });
}
