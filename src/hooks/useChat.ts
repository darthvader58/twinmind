'use client';

import { useCallback } from 'react';

import { sliceTail } from '@/lib/prompts/assemble';
import { readSSE } from '@/lib/sse/client';
import { useSessionStore } from '@/lib/store/session';
import { useSettingsStore } from '@/lib/store/settings';
import { makeError, type Suggestion, type TwinMindError } from '@/lib/types';

interface SseToken { t: string }
interface SseDone { latencyMs: number; firstTokenMs: number }
interface SseError { error: TwinMindError }
type SseData = SseToken | SseDone | SseError;

interface HistoryMsg {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: number;
}

export interface UseChatApi {
  expandSuggestion: (s: Suggestion) => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
}

function buildFullTranscript(): string {
  return useSessionStore
    .getState()
    .chunks.filter((c) => c.text.length > 0)
    .map((c) => c.text)
    .join(' ');
}

/**
 * Snapshot the chat as the API expects it: only completed turns. Optionally
 * drop the trailing user message (when the caller will pass it as `userText`
 * separately, so we avoid the API echoing the prompt twice).
 */
function snapshotHistory(opts: { dropTrailingUser: boolean }): HistoryMsg[] {
  const out: HistoryMsg[] = [];
  for (const m of useSessionStore.getState().chat) {
    if (m.streaming === true) continue;
    out.push({ id: m.id, role: m.role, text: m.text, createdAt: m.createdAt });
  }
  if (opts.dropTrailingUser) {
    const last = out[out.length - 1];
    if (last && last.role === 'user') out.pop();
  }
  return out;
}

async function runStream(args: {
  body: unknown;
  apiKey: string;
  assistantId: string;
}): Promise<void> {
  const { body, apiKey, assistantId } = args;
  const session = useSessionStore.getState();
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-groq-key': apiKey },
      body: JSON.stringify(body),
    });
    const ct = res.headers.get('content-type') ?? '';
    if (!res.ok || !res.body || !ct.includes('text/event-stream')) {
      let err: TwinMindError = makeError('network', `Chat failed (${res.status})`);
      try {
        const j = (await res.json()) as { error?: TwinMindError };
        if (j.error) err = j.error;
      } catch {
        /* keep default */
      }
      session.finalizeAssistantMessage(assistantId, err);
      return;
    }
    let finalErr: TwinMindError | undefined;
    for await (const ev of readSSE<SseData>(res)) {
      if (ev.event === 'token') {
        const t = (ev.data as SseToken).t;
        if (typeof t === 'string' && t.length > 0) {
          session.appendAssistantToken(assistantId, t);
        }
      } else if (ev.event === 'error') {
        finalErr = (ev.data as SseError).error;
        break;
      } else if (ev.event === 'done') {
        break;
      }
    }
    session.finalizeAssistantMessage(assistantId, finalErr);
  } catch (err) {
    session.finalizeAssistantMessage(
      assistantId,
      makeError('network', 'Network error during chat.', err),
    );
  }
}

export function useChat(): UseChatApi {
  const expandSuggestion = useCallback(async (s: Suggestion): Promise<void> => {
    const settings = useSettingsStore.getState();
    const session = useSessionStore.getState();
    if (settings.apiKey === '') {
      session.pushUserMessage(s.preview, { id: s.id, preview: s.preview });
      const aid = session.startAssistantMessage(s.id);
      session.finalizeAssistantMessage(
        aid,
        makeError('no_api_key', 'Add your Groq API key in Settings to chat.'),
      );
      return;
    }
    session.pushUserMessage(s.preview, { id: s.id, preview: s.preview });
    const aid = session.startAssistantMessage(s.id);
    const transcript = sliceTail(buildFullTranscript(), settings.expandContextChars);
    const history = snapshotHistory({ dropTrailingUser: false });
    await runStream({
      body: {
        mode: 'expand',
        suggestion: { id: s.id, type: s.type, preview: s.preview },
        transcript,
        history,
        expandPrompt: settings.expandPrompt,
        chatPrompt: settings.chatPrompt,
      },
      apiKey: settings.apiKey,
      assistantId: aid,
    });
  }, []);

  const sendMessage = useCallback(async (text: string): Promise<void> => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const settings = useSettingsStore.getState();
    const session = useSessionStore.getState();
    if (settings.apiKey === '') {
      session.pushUserMessage(trimmed);
      const aid = session.startAssistantMessage();
      session.finalizeAssistantMessage(
        aid,
        makeError('no_api_key', 'Add your Groq API key in Settings to chat.'),
      );
      return;
    }
    session.pushUserMessage(trimmed);
    const aid = session.startAssistantMessage();
    const transcript = sliceTail(buildFullTranscript(), settings.chatContextChars);
    const history = snapshotHistory({ dropTrailingUser: true });
    await runStream({
      body: {
        mode: 'chat',
        userText: trimmed,
        transcript,
        history,
        expandPrompt: settings.expandPrompt,
        chatPrompt: settings.chatPrompt,
      },
      apiKey: settings.apiKey,
      assistantId: aid,
    });
  }, []);

  return { expandSuggestion, sendMessage };
}
