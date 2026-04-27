import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

import { newId } from '@/lib/ids';
import { nowMs } from '@/lib/time';
import type {
  ChatMessage,
  RecordingState,
  SuggestionBatch,
  TranscriptChunk,
  TwinMindError,
} from '@/lib/types';

export interface SessionState {
  recording: RecordingState;
  micError?: TwinMindError;

  chunks: TranscriptChunk[];
  pendingChunkIds: ReadonlySet<string>;

  batches: SuggestionBatch[];
  suggestionsLoading: boolean;
  suggestionsError?: TwinMindError;
  nextRefreshAtMs: number;

  chat: ChatMessage[];
  chatStreaming: boolean;

  setRecording: (state: RecordingState, error?: TwinMindError) => void;
  appendChunk: (chunk: TranscriptChunk) => void;
  markChunkPending: (id: string) => void;
  unmarkChunkPending: (id: string) => void;
  prependBatch: (batch: SuggestionBatch) => void;
  setSuggestionsLoading: (loading: boolean) => void;
  setSuggestionsError: (error: TwinMindError | undefined) => void;
  setNextRefreshAtMs: (ts: number) => void;
  pushUserMessage: (
    text: string,
    source?: { id: string; preview: string },
  ) => string;
  startAssistantMessage: (sourceSuggestionId?: string) => string;
  appendAssistantToken: (id: string, token: string) => void;
  finalizeAssistantMessage: (id: string, error?: TwinMindError) => void;
  resetAll: () => void;
}

const initialState = {
  recording: 'idle' as RecordingState,
  micError: undefined,
  chunks: [] as TranscriptChunk[],
  pendingChunkIds: new Set<string>() as ReadonlySet<string>,
  batches: [] as SuggestionBatch[],
  suggestionsLoading: false,
  suggestionsError: undefined,
  nextRefreshAtMs: 0,
  chat: [] as ChatMessage[],
  chatStreaming: false,
};

export const useSessionStore = create<SessionState>()(
  subscribeWithSelector((set) => ({
    ...initialState,

    setRecording: (state, error) => {
      set({ recording: state, micError: error });
    },

    appendChunk: (chunk) => {
      set((s) => ({ chunks: [...s.chunks, chunk] }));
    },

    markChunkPending: (id) => {
      set((s) => ({ pendingChunkIds: new Set([...s.pendingChunkIds, id]) }));
    },

    unmarkChunkPending: (id) => {
      set((s) => {
        const next = new Set(s.pendingChunkIds);
        next.delete(id);
        return { pendingChunkIds: next };
      });
    },

    prependBatch: (batch) => {
      set((s) => ({ batches: [batch, ...s.batches] }));
    },

    setSuggestionsLoading: (loading) => {
      set({ suggestionsLoading: loading });
    },

    setSuggestionsError: (error) => {
      set({ suggestionsError: error });
    },

    setNextRefreshAtMs: (ts) => {
      set({ nextRefreshAtMs: ts });
    },

    pushUserMessage: (text, source) => {
      const id = newId('m');
      const message: ChatMessage = {
        id,
        role: 'user',
        text,
        createdAt: nowMs(),
        ...(source
          ? { sourceSuggestionId: source.id, sourceSuggestionPreview: source.preview }
          : {}),
      };
      set((s) => ({ chat: [...s.chat, message] }));
      return id;
    },

    startAssistantMessage: (sourceSuggestionId) => {
      const id = newId('m');
      const message: ChatMessage = {
        id,
        role: 'assistant',
        text: '',
        createdAt: nowMs(),
        streaming: true,
        ...(sourceSuggestionId ? { sourceSuggestionId } : {}),
      };
      set((s) => ({ chat: [...s.chat, message], chatStreaming: true }));
      return id;
    },

    appendAssistantToken: (id, token) => {
      set((s) => ({
        chat: s.chat.map((m) =>
          m.id === id ? { ...m, text: m.text + token } : m,
        ),
      }));
    },

    finalizeAssistantMessage: (id, error) => {
      set((s) => {
        const chat = s.chat.map((m) =>
          m.id === id
            ? { ...m, streaming: false, ...(error ? { error } : {}) }
            : m,
        );
        const stillStreaming = chat.some(
          (m) => m.role === 'assistant' && m.streaming === true,
        );
        return { chat, chatStreaming: stillStreaming };
      });
    },

    resetAll: () => {
      set({
        ...initialState,
        pendingChunkIds: new Set<string>(),
      });
    },
  })),
);
