import { beforeEach, describe, expect, it } from 'vitest';

import { useSessionStore } from '@/lib/store/session';
import type { Suggestion, SuggestionBatch, TranscriptChunk } from '@/lib/types';

const makeChunk = (id: string, startedAtMs: number, text = 'hi'): TranscriptChunk => ({
  id,
  text,
  startedAtMs,
  durationMs: 30_000,
});

const makeSuggestion = (id: string, preview: string): Suggestion => ({
  id,
  type: 'talking_point',
  preview,
});

const makeBatch = (id: string, generatedAt: number): SuggestionBatch => ({
  id,
  generatedAt,
  suggestions: [
    makeSuggestion(`${id}-1`, `${id} first`),
    makeSuggestion(`${id}-2`, `${id} second`),
    makeSuggestion(`${id}-3`, `${id} third`),
  ],
});

beforeEach(() => {
  useSessionStore.getState().resetAll();
});

describe('useSessionStore', () => {
  it('appendChunk preserves insertion order', () => {
    const s = useSessionStore.getState();
    s.appendChunk(makeChunk('a', 1));
    s.appendChunk(makeChunk('b', 2));
    s.appendChunk(makeChunk('c', 3));

    expect(useSessionStore.getState().chunks.map((c) => c.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('prependBatch puts newest at index 0 and preserves older entries', () => {
    const s = useSessionStore.getState();
    s.prependBatch(makeBatch('one', 1));
    s.prependBatch(makeBatch('two', 2));
    s.prependBatch(makeBatch('three', 3));

    const ids = useSessionStore.getState().batches.map((b) => b.id);
    expect(ids).toEqual(['three', 'two', 'one']);
  });

  it('pushUserMessage appends a user message and returns its id; carries source preview', () => {
    const s = useSessionStore.getState();
    const id1 = s.pushUserMessage('hello world');
    const id2 = s.pushUserMessage('expand this', { id: 'sug_1', preview: 'preview text' });

    const chat = useSessionStore.getState().chat;
    expect(chat).toHaveLength(2);
    const first = chat[0];
    const second = chat[1];
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    if (!first || !second) return;

    expect(first.id).toBe(id1);
    expect(first.role).toBe('user');
    expect(first.text).toBe('hello world');
    expect(first.sourceSuggestionId).toBeUndefined();

    expect(second.id).toBe(id2);
    expect(second.sourceSuggestionId).toBe('sug_1');
    expect(second.sourceSuggestionPreview).toBe('preview text');
  });

  it('streaming sequence concatenates tokens, then finalize clears streaming flags', () => {
    const s = useSessionStore.getState();
    const id = s.startAssistantMessage();
    expect(useSessionStore.getState().chatStreaming).toBe(true);

    s.appendAssistantToken(id, 'a');
    s.appendAssistantToken(id, 'b');
    s.finalizeAssistantMessage(id);

    const chat = useSessionStore.getState().chat;
    const msg = chat.find((m) => m.id === id);
    expect(msg).toBeDefined();
    if (!msg) return;
    expect(msg.text).toBe('ab');
    expect(msg.streaming).toBe(false);
    expect(useSessionStore.getState().chatStreaming).toBe(false);
  });

  it('two parallel assistant streams keep chatStreaming true until both finalize', () => {
    const s = useSessionStore.getState();
    const idA = s.startAssistantMessage();
    const idB = s.startAssistantMessage();
    expect(useSessionStore.getState().chatStreaming).toBe(true);

    s.finalizeAssistantMessage(idA);
    expect(useSessionStore.getState().chatStreaming).toBe(true);

    s.finalizeAssistantMessage(idB);
    expect(useSessionStore.getState().chatStreaming).toBe(false);
  });

  it('markChunkPending and unmarkChunkPending mutate the set immutably', () => {
    const s = useSessionStore.getState();
    const initialSet = useSessionStore.getState().pendingChunkIds;

    s.markChunkPending('c1');
    const afterMark = useSessionStore.getState().pendingChunkIds;
    expect(afterMark).not.toBe(initialSet);
    expect(initialSet.has('c1')).toBe(false);
    expect(afterMark.has('c1')).toBe(true);

    s.markChunkPending('c2');
    const afterMark2 = useSessionStore.getState().pendingChunkIds;
    expect(afterMark2).not.toBe(afterMark);
    expect(afterMark.has('c2')).toBe(false);
    expect(afterMark2.has('c2')).toBe(true);

    s.unmarkChunkPending('c1');
    const afterUnmark = useSessionStore.getState().pendingChunkIds;
    expect(afterUnmark).not.toBe(afterMark2);
    expect(afterMark2.has('c1')).toBe(true);
    expect(afterUnmark.has('c1')).toBe(false);
    expect(afterUnmark.has('c2')).toBe(true);
  });

  it('resetAll wipes chunks, batches, chat, recording state back to defaults', () => {
    const s = useSessionStore.getState();
    s.appendChunk(makeChunk('a', 1));
    s.prependBatch(makeBatch('b', 2));
    s.pushUserMessage('hi');
    const aid = s.startAssistantMessage();
    s.appendAssistantToken(aid, 'tok');
    s.markChunkPending('a');
    s.setRecording('recording');
    s.setSuggestionsLoading(true);
    s.setNextRefreshAtMs(1234);

    s.resetAll();

    const after = useSessionStore.getState();
    expect(after.chunks).toEqual([]);
    expect(after.batches).toEqual([]);
    expect(after.chat).toEqual([]);
    expect(after.chatStreaming).toBe(false);
    expect(after.pendingChunkIds.size).toBe(0);
    expect(after.recording).toBe('idle');
    expect(after.micError).toBeUndefined();
    expect(after.suggestionsLoading).toBe(false);
    expect(after.suggestionsError).toBeUndefined();
    expect(after.nextRefreshAtMs).toBe(0);
  });
});
