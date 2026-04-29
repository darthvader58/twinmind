import type Groq from 'groq-sdk';

import type { ChatMsg } from '@/lib/prompts/assemble';
import type { TwinMindError } from '@/lib/types';

import { mapGroqError } from './errors';

export interface StreamChatOptions {
  signal?: AbortSignal;
}

export type ChatStreamEvent =
  | { kind: 'token'; t: string }
  | { kind: 'done' }
  | { kind: 'error'; error: TwinMindError };

const CHAT_MODEL = 'openai/gpt-oss-120b';
const CHAT_TEMPERATURE = 0.4;

function isAbortError(err: unknown): boolean {
  const name =
    typeof err === 'object' && err !== null && 'name' in err
      ? (err as { name?: unknown }).name
      : undefined;
  return name === 'AbortError';
}

/**
 * Streams a chat completion as tokens. Yields a final `done` event on clean
 * close, or `error` if the SDK throws (auth, rate limit, network, etc).
 */
export async function* streamChat(
  client: Groq,
  messages: ChatMsg[],
  opts: StreamChatOptions = {},
): AsyncGenerator<ChatStreamEvent, void, void> {
  try {
    const stream = await client.chat.completions.create(
      {
        model: CHAT_MODEL,
        messages,
        temperature: CHAT_TEMPERATURE,
        stream: true,
      },
      { signal: opts.signal },
    );
    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content ?? '';
      if (token) yield { kind: 'token', t: token };
    }
    yield { kind: 'done' };
  } catch (err) {
    if (opts.signal?.aborted || isAbortError(err)) return;
    yield { kind: 'error', error: mapGroqError(err) };
  }
}
