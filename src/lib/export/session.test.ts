import { describe, expect, it } from 'vitest';

import { serializeSession } from '@/lib/export/session';
import type { ChatMessage, SuggestionBatch, TranscriptChunk } from '@/lib/types';

const NOW = Date.parse('2026-04-25T20:00:00Z');

describe('serializeSession', () => {
  it('handles empty input cleanly', () => {
    const out = serializeSession({ chunks: [], batches: [], chat: [] }, NOW);
    const parsed = JSON.parse(out.json) as Record<string, unknown>;
    expect(typeof parsed.exportedAt).toBe('string');
    expect(typeof parsed.sessionStartedAt).toBe('string');
    expect(parsed.transcript).toEqual([]);
    expect(parsed.suggestionBatches).toEqual([]);
    expect(parsed.chat).toEqual([]);
    expect(out.text).toBe('');
    expect(out.fileBase).toMatch(/^twinmind-session-\d{8}-\d{6}$/);
  });

  it('serializes mixed input chronologically', () => {
    const t0 = Date.parse('2026-04-25T19:55:00Z');
    const t1 = Date.parse('2026-04-25T19:55:30Z');
    const t2 = Date.parse('2026-04-25T19:56:00Z');
    const t3 = Date.parse('2026-04-25T19:56:05Z');

    const chunks: TranscriptChunk[] = [
      { id: 'c1', text: 'hello world', startedAtMs: t0, durationMs: 30000 },
    ];
    const batches: SuggestionBatch[] = [
      {
        id: 'b1',
        generatedAt: t1,
        suggestions: [
          { id: 's1', type: 'question_to_ask', preview: 'Ask about pricing' },
          { id: 's2', type: 'talking_point', preview: 'Mention Q4 growth' },
          { id: 's3', type: 'fact_check', preview: 'Fact-check: 30% — close to 28%' },
        ],
      },
    ];
    const chat: ChatMessage[] = [
      { id: 'm1', role: 'user', text: 'What did they say?', createdAt: t2 },
      { id: 'm2', role: 'assistant', text: 'They mentioned Q4.', createdAt: t3 },
    ];

    const out = serializeSession({ chunks, batches, chat }, NOW);
    const parsed = JSON.parse(out.json) as {
      transcript: unknown[];
      suggestionBatches: Array<{ suggestions: unknown[] }>;
      chat: unknown[];
    };
    expect(parsed.transcript).toHaveLength(1);
    expect(parsed.suggestionBatches).toHaveLength(1);
    expect(parsed.suggestionBatches[0]?.suggestions).toHaveLength(3);
    expect(parsed.chat).toHaveLength(2);

    expect(out.text).toContain('TRANSCRIPT');
    expect(out.text).toContain('SUGGESTIONS BATCH');
    expect(out.text).toContain('USER');
    expect(out.text).toContain('ASSISTANT');

    const idxT = out.text.indexOf('TRANSCRIPT');
    const idxS = out.text.indexOf('SUGGESTIONS BATCH');
    const idxU = out.text.indexOf('USER');
    const idxA = out.text.indexOf('ASSISTANT');
    expect(idxT).toBeGreaterThanOrEqual(0);
    expect(idxS).toBeGreaterThan(idxT);
    expect(idxU).toBeGreaterThan(idxS);
    expect(idxA).toBeGreaterThan(idxU);
  });
});
