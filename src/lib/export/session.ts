import { formatClock, formatStamp } from '@/lib/time';
import type { ChatMessage, SuggestionBatch, TranscriptChunk } from '@/lib/types';

export interface SerializeInput {
  chunks: TranscriptChunk[];
  batches: SuggestionBatch[];
  chat: ChatMessage[];
}

export interface SerializeResult {
  json: string;
  text: string;
  fileBase: string;
}

interface JsonShape {
  exportedAt: string;
  sessionStartedAt: string;
  transcript: Array<{ startedAt: string; durationMs: number; text: string }>;
  suggestionBatches: Array<{
    generatedAt: string;
    suggestions: Array<{ type: string; preview: string }>;
  }>;
  chat: Array<{
    role: 'user' | 'assistant';
    createdAt: string;
    text: string;
    sourceSuggestionPreview?: string;
  }>;
}

type BlockKind = 'TRANSCRIPT' | 'SUGGESTIONS BATCH' | 'USER' | 'ASSISTANT';
interface Block {
  ts: number;
  kind: BlockKind;
  lines: string[];
}

/** Pure session serializer. Produces JSON + chronologically interleaved text. */
export function serializeSession(
  input: SerializeInput,
  now: number = Date.now(),
): SerializeResult {
  const { chunks, batches, chat } = input;

  const allStarts: number[] = [
    ...chunks.map((c) => c.startedAtMs),
    ...chat.map((m) => m.createdAt),
  ];
  const earliest = allStarts.reduce<number>(
    (a, b) => (a === 0 ? b : Math.min(a, b)),
    0,
  );
  const sessionStartedAt =
    earliest === 0 ? new Date(now).toISOString() : new Date(earliest).toISOString();

  const json: JsonShape = {
    exportedAt: new Date(now).toISOString(),
    sessionStartedAt,
    transcript: chunks.map((c) => ({
      startedAt: new Date(c.startedAtMs).toISOString(),
      durationMs: c.durationMs,
      text: c.text,
    })),
    suggestionBatches: [...batches].reverse().map((b) => ({
      generatedAt: new Date(b.generatedAt).toISOString(),
      suggestions: b.suggestions.map((s) => ({ type: s.type, preview: s.preview })),
    })),
    chat: chat.map((m) => ({
      role: m.role,
      createdAt: new Date(m.createdAt).toISOString(),
      text: m.text,
      ...(m.sourceSuggestionPreview
        ? { sourceSuggestionPreview: m.sourceSuggestionPreview }
        : {}),
    })),
  };

  const blocks: Block[] = [];
  for (const c of chunks) {
    blocks.push({ ts: c.startedAtMs, kind: 'TRANSCRIPT', lines: [c.text] });
  }
  for (const b of [...batches].reverse()) {
    const lines = b.suggestions.map((s) => `- [${s.type}] ${s.preview}`);
    blocks.push({ ts: b.generatedAt, kind: 'SUGGESTIONS BATCH', lines });
  }
  for (const m of chat) {
    blocks.push({
      ts: m.createdAt,
      kind: m.role === 'user' ? 'USER' : 'ASSISTANT',
      lines: [m.text],
    });
  }
  blocks.sort((a, z) => a.ts - z.ts);

  const text = blocks
    .map((b) => `[${formatClock(b.ts)}] ${b.kind}\n${b.lines.join('\n')}`)
    .join('\n\n');

  return {
    json: JSON.stringify(json, null, 2),
    text,
    fileBase: `twinmind-session-${formatStamp(now)}`,
  };
}
