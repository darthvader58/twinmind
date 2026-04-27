'use client';

import { useCallback, useEffect, useRef } from 'react';

import { newId } from '@/lib/ids';
import { sliceTail } from '@/lib/prompts/assemble';
import { useSessionStore } from '@/lib/store/session';
import { useSettingsStore } from '@/lib/store/settings';
import {
  makeError,
  type Suggestion,
  type SuggestionBatch,
  type TopicGraphNode,
  type TwinMindError,
} from '@/lib/types';

interface SuggestResponseBody {
  suggestions?: Suggestion[];
  generatedAt?: number;
  latencyMs?: number;
  error?: TwinMindError;
}

function matchCoveredLabels(
  suggestions: readonly Suggestion[],
  graph: readonly TopicGraphNode[],
): string[] {
  if (graph.length === 0) return [];
  const previewsLower = suggestions.map((s) => s.preview.toLowerCase());
  const matched = new Set<string>();
  for (const node of graph) {
    if (node.covered) continue;
    if (node.label.length < 3) continue;
    for (const p of previewsLower) {
      if (p.includes(node.label) || p.includes(node.display.toLowerCase())) {
        matched.add(node.label);
        break;
      }
    }
  }
  return [...matched];
}

export interface UseSuggestionLoopApi {
  reload: () => void;
}

export function useSuggestionLoop(): UseSuggestionLoopApi {
  const abortRef = useRef<AbortController | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fire = useCallback(async (): Promise<void> => {
    const settings = useSettingsStore.getState();
    const session = useSessionStore.getState();

    if (settings.apiKey === '') {
      session.setSuggestionsError(
        makeError('no_api_key', 'Add your Groq API key in Settings to generate suggestions.'),
      );
      return;
    }

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    session.setSuggestionsLoading(true);
    session.setSuggestionsError(undefined);

    const fullTranscript = session.chunks
      .filter((c) => c.text.length > 0)
      .map((c) => c.text)
      .join(' ');
    const transcriptWindow = sliceTail(fullTranscript, settings.suggestContextChars);
    const previousPreviews = session.batches
      .slice(0, 2)
      .flatMap((b) => b.suggestions.map((s) => s.preview));
    const topicGraph = session.topicGraph.slice(-30);

    try {
      const res = await fetch('/api/suggest', {
        method: 'POST',
        signal: ac.signal,
        headers: { 'content-type': 'application/json', 'x-groq-key': settings.apiKey },
        body: JSON.stringify({
          transcriptWindow,
          previousPreviews,
          suggestPrompt: settings.suggestPrompt,
          contextChars: settings.suggestContextChars,
          topicGraph,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as SuggestResponseBody;
      if (!res.ok || body.error || !body.suggestions || body.suggestions.length !== 3) {
        const err = body.error ?? makeError('network', `Suggest failed (${res.status})`);
        session.setSuggestionsError(err);
      } else {
        const [a, b, c] = body.suggestions;
        if (!a || !b || !c) {
          session.setSuggestionsError(
            makeError('invalid_json', 'Suggest returned an unexpected payload.'),
          );
        } else {
          const batch: SuggestionBatch = {
            id: newId('b'),
            suggestions: [a, b, c],
            generatedAt: typeof body.generatedAt === 'number' ? body.generatedAt : Date.now(),
            ...(typeof body.latencyMs === 'number' ? { latencyMs: body.latencyMs } : {}),
          };
          session.prependBatch(batch);
          const matched = matchCoveredLabels(batch.suggestions, topicGraph);
          if (matched.length > 0) session.markGraphNodesCovered(matched);
        }
      }
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return;
      session.setSuggestionsError(
        makeError('network', 'Network error while generating suggestions.', err),
      );
    } finally {
      if (abortRef.current === ac) {
        session.setSuggestionsLoading(false);
        const refreshSeconds = useSettingsStore.getState().refreshSeconds;
        session.setNextRefreshAtMs(Date.now() + refreshSeconds * 1000);
        abortRef.current = null;
      }
    }
  }, []);

  useEffect(() => {
    const tick = (): void => {
      const s = useSessionStore.getState();
      if (s.recording !== 'recording') return;
      if (s.suggestionsLoading) return;
      if (s.nextRefreshAtMs === 0) {
        const refreshSeconds = useSettingsStore.getState().refreshSeconds;
        s.setNextRefreshAtMs(Date.now() + refreshSeconds * 1000);
        return;
      }
      if (Date.now() >= s.nextRefreshAtMs) {
        void fire();
      }
    };
    tickRef.current = setInterval(tick, 1000);
    const currentTick = tickRef.current;
    const currentAbort = abortRef;
    return () => {
      if (currentTick) clearInterval(currentTick);
      currentAbort.current?.abort();
    };
  }, [fire]);

  return { reload: () => void fire() };
}
