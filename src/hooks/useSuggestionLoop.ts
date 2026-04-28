'use client';

import { useCallback, useEffect, useRef } from 'react';

import { isWhisperHallucination, joinTranscriptForContext } from '@/lib/groq/transcribe';
import { newId } from '@/lib/ids';
import { sliceTail } from '@/lib/prompts/assemble';
import { useSessionStore } from '@/lib/store/session';
import { useSettingsStore } from '@/lib/store/settings';
import {
  makeError,
  type SpeakerRole,
  type Suggestion,
  type SuggestionBatch,
  type TopicGraphNode,
  type TranscriptChunk,
  type TwinMindError,
} from '@/lib/types';

interface SuggestResponseBody {
  suggestions?: Suggestion[];
  generatedAt?: number;
  latencyMs?: number;
  error?: TwinMindError;
}

const ROLE_TAG: Record<SpeakerRole, string> = {
  user: '[user]',
  other: '[other]',
  mixed: '[mixed]',
  unknown: '',
};

/**
 * Renders speaker-tagged transcript like
 * `[user]: hello there  [other]: that sounds great`
 * Adjacent same-role chunks collapse into one tag. Returns '' if every chunk
 * is `unknown` — the route then falls back to the plain transcript window.
 */
export function buildAnnotatedTranscript(
  chunks: readonly TranscriptChunk[],
  maxChars: number,
): string {
  const speaking = chunks.filter(
    (c) =>
      !c.error &&
      c.text.trim() !== '' &&
      c.speakerRole !== undefined &&
      !isWhisperHallucination(c.text),
  );
  if (speaking.length === 0) return '';
  const allUnknown = speaking.every((c) => c.speakerRole === 'unknown');
  if (allUnknown) return '';
  const parts: string[] = [];
  let lastRole: SpeakerRole | null = null;
  for (const c of speaking) {
    const role = c.speakerRole ?? 'unknown';
    const tag = ROLE_TAG[role];
    if (tag === '') {
      parts.push(c.text.trim());
    } else if (role !== lastRole) {
      parts.push(`${tag}: ${c.text.trim()}`);
    } else {
      parts.push(c.text.trim());
    }
    lastRole = role;
  }
  const joined = parts.join('  ');
  if (joined.length <= maxChars) return joined;
  return joined.slice(joined.length - maxChars);
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

    const fullTranscript = joinTranscriptForContext(session.chunks);
    const transcriptWindow = sliceTail(fullTranscript, settings.suggestContextChars);
    const annotatedTranscript = buildAnnotatedTranscript(
      session.chunks,
      settings.suggestContextChars,
    );
    const autoPreviews = session.batches
      .slice(0, 2)
      .flatMap((b) => b.suggestions.map((s) => s.preview));
    const previousPreviews = Array.from(
      new Set([...session.manualPreviousPreviews, ...autoPreviews]),
    ).slice(-20);
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
          ...(annotatedTranscript !== '' ? { annotatedTranscript } : {}),
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
