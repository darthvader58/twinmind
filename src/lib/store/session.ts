import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

import { newId } from '@/lib/ids';
import { nowMs } from '@/lib/time';
import type {
  ChatMessage,
  RecordingState,
  SuggestionBatch,
  TopicGraphNode,
  TranscriptChunk,
  TwinMindError,
} from '@/lib/types';

const TOPIC_GRAPH_CAP = 60;

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

  topicGraph: TopicGraphNode[];

  setRecording: (state: RecordingState, error?: TwinMindError) => void;
  appendChunk: (chunk: TranscriptChunk) => void;
  markChunkPending: (id: string) => void;
  unmarkChunkPending: (id: string) => void;
  prependBatch: (batch: SuggestionBatch) => void;
  setSuggestionsLoading: (loading: boolean) => void;
  setSuggestionsError: (error: TwinMindError | undefined) => void;
  setNextRefreshAtMs: (ts: number) => void;
  mergeGraphNodes: (incoming: Omit<TopicGraphNode, 'id'>[]) => void;
  markGraphNodesCovered: (labels: string[]) => void;
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
  topicGraph: [] as TopicGraphNode[],
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

    mergeGraphNodes: (incoming) => {
      if (incoming.length === 0) return;
      set((s) => {
        const next = [...s.topicGraph];
        for (const node of incoming) {
          const idx = next.findIndex(
            (n) => n.kind === node.kind && n.label === node.label,
          );
          if (idx >= 0) {
            const existing = next[idx];
            if (!existing) continue;
            const mergedRelated = Array.from(
              new Set([...existing.relatedLabels, ...node.relatedLabels]),
            );
            next[idx] = {
              ...existing,
              lastMentionedAtMs: Math.max(
                existing.lastMentionedAtMs,
                node.lastMentionedAtMs,
              ),
              relatedLabels: mergedRelated,
            };
          } else {
            next.push({ ...node, id: newId('g') });
          }
        }
        const trimmed =
          next.length > TOPIC_GRAPH_CAP
            ? next.slice(next.length - TOPIC_GRAPH_CAP)
            : next;
        return { topicGraph: trimmed };
      });
    },

    markGraphNodesCovered: (labels) => {
      if (labels.length === 0) return;
      const needles = labels
        .map((l) => l.trim().toLowerCase())
        .filter((l) => l.length > 0);
      if (needles.length === 0) return;
      set((s) => ({
        topicGraph: s.topicGraph.map((n) => {
          if (n.covered) return n;
          for (const needle of needles) {
            if (n.label.includes(needle) || needle.includes(n.label)) {
              return { ...n, covered: true };
            }
          }
          return n;
        }),
      }));
    },

    resetAll: () => {
      set({
        ...initialState,
        pendingChunkIds: new Set<string>(),
        topicGraph: [],
      });
    },
  })),
);
