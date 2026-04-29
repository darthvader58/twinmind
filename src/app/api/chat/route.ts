import { z } from 'zod';

import { isNoApiKeyError, makeGroq } from '@/lib/groq/client';
import { streamChat } from '@/lib/groq/chat';
import { contentLengthError, jsonError, missingApiKeyError } from '@/lib/http';
import {
  buildChatMessages,
  buildExpandMessages,
  sizeTranscript,
  type ChatMsg,
} from '@/lib/prompts/assemble';
import { SuggestionTypeSchema } from '@/lib/prompts/schemas';
import { sseStream } from '@/lib/sse/server';
import { makeError } from '@/lib/types';
import { toSafeError } from '@/lib/groq/errors';

export const runtime = 'edge';

const MAX_CHAT_REQUEST_BYTES = 512 * 1024;
const MAX_PROMPT_CHARS = 24_000;
const MAX_TRANSCRIPT_CHARS = 48_000;
const MAX_HISTORY_ITEMS = 40;
const MAX_HISTORY_TEXT_CHARS = 4_000;
const MAX_USER_TEXT_CHARS = 4_000;
const MAX_CONTEXT_CHARS = 48_000;
const MAX_SUGGESTION_ID_CHARS = 128;
const MAX_SUGGESTION_PREVIEW_CHARS = 280;

const SuggestionShape = z.object({
  id: z.string().min(1).max(MAX_SUGGESTION_ID_CHARS),
  type: SuggestionTypeSchema,
  preview: z.string().min(1).max(MAX_SUGGESTION_PREVIEW_CHARS),
});

const ChatHistoryItem = z.object({
  id: z.string().min(1).max(MAX_SUGGESTION_ID_CHARS),
  role: z.enum(['user', 'assistant']),
  text: z.string().max(MAX_HISTORY_TEXT_CHARS),
  createdAt: z.number().int().nonnegative(),
});

const ChatRequestSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('expand'),
    suggestion: SuggestionShape,
    transcript: z.string().max(MAX_TRANSCRIPT_CHARS),
    history: z.array(ChatHistoryItem).max(MAX_HISTORY_ITEMS),
    expandPrompt: z.string().min(1).max(MAX_PROMPT_CHARS),
    chatPrompt: z.string().min(1).max(MAX_PROMPT_CHARS),
    expandContextChars: z.number().int().positive().max(MAX_CONTEXT_CHARS),
    chatContextChars: z.number().int().positive().max(MAX_CONTEXT_CHARS),
  }),
  z.object({
    mode: z.literal('chat'),
    userText: z.string().min(1).max(MAX_USER_TEXT_CHARS),
    transcript: z.string().max(MAX_TRANSCRIPT_CHARS),
    history: z.array(ChatHistoryItem).max(MAX_HISTORY_ITEMS),
    expandPrompt: z.string().min(1).max(MAX_PROMPT_CHARS),
    chatPrompt: z.string().min(1).max(MAX_PROMPT_CHARS),
    expandContextChars: z.number().int().positive().max(MAX_CONTEXT_CHARS),
    chatContextChars: z.number().int().positive().max(MAX_CONTEXT_CHARS),
  }),
]);

export async function POST(req: Request): Promise<Response> {
  const sizeError = contentLengthError(req, MAX_CHAT_REQUEST_BYTES, 'Chat request body');
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

  return sseStream(
    async (send, signal) => {
      const t0 = Date.now();
      let firstTokenMs = 0;
      for await (const ev of streamChat(client, messages, { signal })) {
        if (signal?.aborted) break;
        if (ev.kind === 'token') {
          if (firstTokenMs === 0) firstTokenMs = Date.now() - t0;
          send('token', { t: ev.t });
        } else if (ev.kind === 'done') {
          send('done', { latencyMs: Date.now() - t0, firstTokenMs });
        } else {
          send('error', { error: toSafeError(ev.error) });
        }
      }
    },
    {
      signal: req.signal,
      onError: (error, send) => {
        send('error', {
          error: toSafeError(
            makeError('unknown', 'Chat stream terminated unexpectedly.', error),
          ),
        });
      },
    },
  );
}
