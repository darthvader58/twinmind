import { describe, expect, it } from 'vitest';

import type { TranscriptChunk } from '@/lib/types';

import { buildAnnotatedTranscript } from './useSuggestionLoop';

const chunk = (
  overrides: Partial<TranscriptChunk> & { id: string; text: string },
): TranscriptChunk => ({
  startedAtMs: 0,
  durationMs: 5000,
  ...overrides,
});

describe('buildAnnotatedTranscript', () => {
  it('returns empty string when there are no chunks', () => {
    expect(buildAnnotatedTranscript([], 1000)).toBe('');
  });

  it('returns empty string when every chunk has speakerRole=unknown (route falls back to plain transcript)', () => {
    const chunks: TranscriptChunk[] = [
      chunk({ id: 'a', text: 'hello', speakerRole: 'unknown' }),
      chunk({ id: 'b', text: 'world', speakerRole: 'unknown' }),
    ];
    expect(buildAnnotatedTranscript(chunks, 1000)).toBe('');
  });

  it('skips chunks that errored or are empty', () => {
    const chunks: TranscriptChunk[] = [
      chunk({
        id: 'a',
        text: '',
        speakerRole: 'user',
        error: { kind: 'network', message: 'x' },
      }),
      chunk({ id: 'b', text: '   ', speakerRole: 'user' }),
      chunk({ id: 'c', text: 'real text', speakerRole: 'user' }),
    ];
    expect(buildAnnotatedTranscript(chunks, 1000)).toBe('[user]: real text');
  });

  it('renders role tags and collapses adjacent same-role chunks', () => {
    const chunks: TranscriptChunk[] = [
      chunk({ id: 'a', text: 'hello there', speakerRole: 'user' }),
      chunk({ id: 'b', text: 'how are you', speakerRole: 'user' }),
      chunk({ id: 'c', text: 'doing well', speakerRole: 'other' }),
      chunk({ id: 'd', text: 'great to hear', speakerRole: 'user' }),
    ];
    const out = buildAnnotatedTranscript(chunks, 1000);
    expect(out).toBe(
      '[user]: hello there  how are you  [other]: doing well  [user]: great to hear',
    );
  });

  it('treats unknown chunks as untagged interjections amid known speakers', () => {
    const chunks: TranscriptChunk[] = [
      chunk({ id: 'a', text: 'first', speakerRole: 'user' }),
      chunk({ id: 'b', text: 'middle', speakerRole: 'unknown' }),
      chunk({ id: 'c', text: 'third', speakerRole: 'other' }),
    ];
    const out = buildAnnotatedTranscript(chunks, 1000);
    expect(out).toContain('[user]: first');
    expect(out).toContain('[other]: third');
  });

  it('tail-truncates when the joined string exceeds maxChars', () => {
    const chunks: TranscriptChunk[] = [
      chunk({ id: 'a', text: 'a'.repeat(200), speakerRole: 'user' }),
      chunk({ id: 'b', text: 'b'.repeat(200), speakerRole: 'other' }),
    ];
    const out = buildAnnotatedTranscript(chunks, 100);
    expect(out.length).toBeLessThanOrEqual(100);
    expect(out.endsWith('b')).toBe(true);
  });

  it('renders mixed role correctly', () => {
    const chunks: TranscriptChunk[] = [
      chunk({ id: 'a', text: 'overlapping speech', speakerRole: 'mixed' }),
    ];
    expect(buildAnnotatedTranscript(chunks, 1000)).toBe(
      '[mixed]: overlapping speech',
    );
  });
});
