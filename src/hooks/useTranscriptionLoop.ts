'use client';

import { useEffect, useRef } from 'react';

import type { RollingRecorderChunk } from '@/lib/audio/recorder';
import { useSessionStore } from '@/lib/store/session';
import { useSettingsStore } from '@/lib/store/settings';
import {
  makeError,
  type TopicGraphNode,
  type TopicNodeKind,
  type TranscriptChunk,
  type TwinMindError,
  type TwinMindErrorKind,
} from '@/lib/types';

import type { UseRecorderApi } from './useRecorder';

interface ExtractedItem {
  label: string;
  display: string;
  related_to?: string;
  why?: string;
}

interface ExtractResponseBody {
  entities?: ExtractedItem[];
  claims?: ExtractedItem[];
  open_questions?: ExtractedItem[];
  tangent_seeds?: ExtractedItem[];
}

const canon = (s: string): string => s.trim().toLowerCase();

const mapItems = (
  items: ExtractedItem[] | undefined,
  kind: TopicNodeKind,
  startedAtMs: number,
): Omit<TopicGraphNode, 'id'>[] => {
  if (!Array.isArray(items)) return [];
  return items
    .filter((it) => typeof it.label === 'string' && it.label.trim() !== '')
    .map((it) => {
      const related: string[] = [];
      if (kind === 'tangent_seed') {
        if (typeof it.related_to === 'string' && it.related_to.trim() !== '') {
          related.push(canon(it.related_to));
        }
      }
      return {
        label: canon(it.label),
        display: it.display.trim() === '' ? it.label.trim() : it.display.trim(),
        kind,
        firstMentionedAtMs: startedAtMs,
        lastMentionedAtMs: startedAtMs,
        covered: false,
        relatedLabels: related,
      };
    });
};

const fireExtract = async (chunk: TranscriptChunk): Promise<void> => {
  if (chunk.text.trim() === '' || chunk.error) return;
  const settings = useSettingsStore.getState();
  if (settings.apiKey === '') return;
  try {
    const res = await fetch('/api/extract', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-groq-key': settings.apiKey },
      body: JSON.stringify({
        chunkText: chunk.text,
        extractPrompt: settings.extractPrompt,
      }),
    });
    if (!res.ok) return;
    const body = (await res.json().catch(() => ({}))) as ExtractResponseBody;
    const merged: Omit<TopicGraphNode, 'id'>[] = [
      ...mapItems(body.entities, 'entity', chunk.startedAtMs),
      ...mapItems(body.claims, 'claim', chunk.startedAtMs),
      ...mapItems(body.open_questions, 'open_question', chunk.startedAtMs),
      ...mapItems(body.tangent_seeds, 'tangent_seed', chunk.startedAtMs),
    ];
    if (merged.length > 0) {
      useSessionStore.getState().mergeGraphNodes(merged);
    }
  } catch {
    /* fire-and-forget — extraction failure must never block the transcript */
  }
};

interface TranscribeSuccess {
  text: string;
  durationMs: number;
  language: string;
}

interface TranscribeFailure {
  error: TwinMindError;
}

const isError = (v: unknown): v is TranscribeFailure => {
  if (typeof v !== 'object' || v === null) return false;
  const e = (v as { error?: unknown }).error;
  return typeof e === 'object' && e !== null && 'kind' in e;
};

const isSuccess = (v: unknown): v is TranscribeSuccess => {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as { text?: unknown };
  return typeof o.text === 'string';
};

const extOf = (mime: string): string => {
  if (mime.includes('mp4')) return 'mp4';
  return 'webm';
};

/**
 * Drains chunks from the recorder via a single in-flight POST to
 * `/api/transcribe`. Backpressure: only one request is on the wire at any
 * time per loop, so chunk order is preserved. Failures append a typed-error
 * `TranscriptChunk` rather than throwing — the UI uses `chunk.error` to
 * render a retry affordance.
 */
export const useTranscriptionLoop = (recorder: UseRecorderApi): void => {
  const queueRef = useRef<RollingRecorderChunk[]>([]);
  const inFlightRef = useRef(false);
  const appendChunk = useSessionStore((s) => s.appendChunk);
  const markPending = useSessionStore((s) => s.markChunkPending);
  const unmarkPending = useSessionStore((s) => s.unmarkChunkPending);

  useEffect(() => {
    let cancelled = false;

    const drain = async (): Promise<void> => {
      if (inFlightRef.current) return;
      const next = queueRef.current.shift();
      if (!next) return;
      inFlightRef.current = true;
      markPending(next.id);
      const apiKey = useSettingsStore.getState().apiKey;

      let appended: TranscriptChunk;
      try {
        if (!apiKey) {
          appended = {
            id: next.id,
            text: '',
            startedAtMs: next.startedAtMs,
            durationMs: next.durationMs,
            error: makeError('no_api_key', 'Add your Groq API key in settings.'),
          };
        } else {
          const fd = new FormData();
          fd.append('audio', next.blob, `chunk.${extOf(next.mime)}`);
          fd.append('mime', next.mime);
          const res = await fetch('/api/transcribe', {
            method: 'POST',
            body: fd,
            headers: { 'x-groq-key': apiKey },
          });
          const json: unknown = await res.json().catch(() => ({}));

          if (!res.ok) {
            const tm: TwinMindError = isError(json)
              ? json.error
              : makeError(
                  classifyStatus(res.status),
                  `Transcribe failed (${res.status}).`,
                );
            appended = {
              id: next.id,
              text: '',
              startedAtMs: next.startedAtMs,
              durationMs: next.durationMs,
              error: tm,
            };
          } else if (isSuccess(json)) {
            appended = {
              id: next.id,
              text: json.text,
              startedAtMs: next.startedAtMs,
              durationMs:
                typeof json.durationMs === 'number'
                  ? json.durationMs
                  : next.durationMs,
              ...(typeof json.language === 'string'
                ? { language: json.language }
                : {}),
            };
          } else {
            appended = {
              id: next.id,
              text: '',
              startedAtMs: next.startedAtMs,
              durationMs: next.durationMs,
              error: makeError(
                'invalid_json',
                'Transcribe returned an unexpected payload.',
              ),
            };
          }
        }
      } catch (err) {
        appended = {
          id: next.id,
          text: '',
          startedAtMs: next.startedAtMs,
          durationMs: next.durationMs,
          error: makeError('network', 'Network error during transcription.', err),
        };
      } finally {
        unmarkPending(next.id);
        inFlightRef.current = false;
      }

      if (!cancelled) {
        appendChunk(appended);
        if (!appended.error && appended.text.trim() !== '') {
          void fireExtract(appended);
        }
        if (queueRef.current.length > 0) void drain();
      }
    };

    const off = recorder.onChunk((c) => {
      queueRef.current.push(c);
      void drain();
    });

    return () => {
      cancelled = true;
      off();
    };
  }, [recorder, appendChunk, markPending, unmarkPending]);
};

const classifyStatus = (status: number): TwinMindErrorKind => {
  if (status === 401) return 'groq_unauthorized';
  if (status === 429) return 'groq_rate_limit';
  if (status >= 500) return 'groq_server';
  return 'network';
};
