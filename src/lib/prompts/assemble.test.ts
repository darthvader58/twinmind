import { describe, expect, it } from 'vitest';

import type { ChatMessage, Suggestion, TopicGraphNode } from '@/lib/types';

import {
  buildChatMessages,
  buildExpandMessages,
  buildExtractMessages,
  buildSuggestMessages,
  sizeTranscript,
  sliceTail,
} from './assemble';
import {
  DEFAULT_CHAT_PROMPT,
  DEFAULT_EXPAND_PROMPT,
  DEFAULT_EXTRACT_PROMPT,
  DEFAULT_SUGGEST_PROMPT,
} from './defaults';
import { SuggestionTypeSchema } from './schemas';

const graphNode = (
  overrides: Partial<TopicGraphNode> & {
    label: string;
    kind: TopicGraphNode['kind'];
  },
): TopicGraphNode => ({
  id: overrides.label,
  display: overrides.label,
  firstMentionedAtMs: 1000,
  lastMentionedAtMs: 1000,
  covered: false,
  relatedLabels: [],
  ...overrides,
});

describe('sliceTail', () => {
  it('returns input unchanged when length <= max', () => {
    const input = 'hello world';
    expect(sliceTail(input, 100)).toBe(input);
    expect(sliceTail(input, input.length)).toBe(input);
  });

  it('returns at most maxChars characters when text is longer', () => {
    const input = 'a'.repeat(500);
    const out = sliceTail(input, 100);
    expect(out.length).toBeLessThanOrEqual(100);
  });

  it('backs up to a sentence boundary when one exists in the head 200 chars', () => {
    const head = 'mid-sentence garbage. ';
    const tail = 'b'.repeat(300);
    const input = 'PREFIX_SHOULD_BE_DROPPED ' + head + tail;
    const out = sliceTail(input, head.length + tail.length);
    expect(out.startsWith('b')).toBe(true);
    expect(out.includes('mid-sentence garbage')).toBe(false);
  });

  it('backs up to a newline when one exists in the head 200 chars', () => {
    const head = 'partial line\n';
    const tail = 'c'.repeat(300);
    const input = 'DROPPED_PREFIX ' + head + tail;
    const out = sliceTail(input, head.length + tail.length);
    expect(out.startsWith('c')).toBe(true);
    expect(out.includes('partial line')).toBe(false);
  });

  it('returns the slice as-is when no boundary exists in head', () => {
    const input = 'x'.repeat(1000);
    const out = sliceTail(input, 100);
    expect(out).toBe('x'.repeat(100));
  });

  it('returns empty string when maxChars is 0 or negative', () => {
    expect(sliceTail('hello', 0)).toBe('');
    expect(sliceTail('hello', -5)).toBe('');
  });
});

describe('sizeTranscript (full-when-small / tail-when-large per CLAUDE.md §7.3)', () => {
  it('returns the transcript unchanged when length <= ceiling', () => {
    const small = 'a'.repeat(5000);
    expect(sizeTranscript(small, 12000)).toBe(small);
    expect(sizeTranscript(small, 12000).length).toBe(5000);
  });

  it('tail-slices when length > ceiling, never exceeding ceiling', () => {
    const large = 'a'.repeat(30000);
    const out = sizeTranscript(large, 12000);
    expect(out.length).toBeLessThanOrEqual(12000);
    expect(out.length).toBeGreaterThan(0);
  });

  it('returns empty string for empty input', () => {
    expect(sizeTranscript('', 12000)).toBe('');
  });

  it('returns the full transcript when its length equals the ceiling exactly', () => {
    const exact = 'b'.repeat(12000);
    expect(sizeTranscript(exact, 12000)).toBe(exact);
  });
});

describe('buildSuggestMessages', () => {
  const settings = { suggestPrompt: 'SYSTEM_SUGGEST' };

  it('with no previous previews: system equals settings.suggestPrompt and user includes (none yet)', () => {
    const msgs = buildSuggestMessages({
      transcriptWindow: 'Hello there.',
      previousPreviews: [],
      settings,
    });
    expect(msgs).toHaveLength(2);
    expect(msgs[0]).toEqual({ role: 'system', content: 'SYSTEM_SUGGEST' });
    expect(msgs[1]?.role).toBe('user');
    expect(msgs[1]?.content).toContain(
      'PREVIOUS_PREVIEWS (avoid repeating, including semantic duplicates): (none yet)',
    );
    expect(msgs[1]?.content).toContain('Now produce exactly 3 suggestions');
  });

  it('user message reminds the model to mirror the user\'s next thought', () => {
    const msgs = buildSuggestMessages({
      transcriptWindow: 'anything',
      previousPreviews: [],
      settings,
    });
    const user = msgs[1]?.content ?? '';
    expect(user).toContain("user's own next thought");
    expect(user).toContain('Vary the types');
    expect(user).toContain('PREVIOUS_PREVIEWS');
  });

  it('with two previous previews: user includes "- prev1" and "- prev2"', () => {
    const msgs = buildSuggestMessages({
      transcriptWindow: 'Some transcript text.',
      previousPreviews: ['prev1', 'prev2'],
      settings,
    });
    const user = msgs[1]?.content ?? '';
    expect(user).toContain(
      'PREVIOUS_PREVIEWS (avoid repeating, including semantic duplicates):',
    );
    expect(user).toContain('- prev1');
    expect(user).toContain('- prev2');
    expect(user).not.toContain('(none yet)');
  });

  it('with empty transcript: user includes the (no transcript yet ...) clause and no triple-quotes', () => {
    const msgs = buildSuggestMessages({
      transcriptWindow: '   \n  ',
      previousPreviews: [],
      settings,
    });
    const user = msgs[1]?.content ?? '';
    expect(user).toContain(
      '(no transcript yet — produce 3 useful kickoff suggestions for an unknown live conversation)',
    );
    expect(user).not.toContain('"""');
  });

  it('uses transcriptWindow.length for the (last ~N chars) marker', () => {
    const window = 'x'.repeat(123);
    const msgs = buildSuggestMessages({
      transcriptWindow: window,
      previousPreviews: [],
      settings,
    });
    expect(msgs[1]?.content).toContain('RECENT_TRANSCRIPT (last ~123 chars):');
    expect(msgs[1]?.content).toContain('"""');
  });

  it('renders the empty-graph marker when topicGraph is undefined or []', () => {
    const a = buildSuggestMessages({
      transcriptWindow: 'x',
      previousPreviews: [],
      settings,
    });
    const b = buildSuggestMessages({
      transcriptWindow: 'x',
      previousPreviews: [],
      settings,
      topicGraph: [],
    });
    for (const msgs of [a, b]) {
      expect(msgs[1]?.content).toContain(
        'KNOWLEDGE_GRAPH (topics raised so far in the call): (empty — no nodes yet)',
      );
    }
  });

  it('uses the annotated transcript block when annotatedTranscript is non-empty (replaces the plain RECENT_TRANSCRIPT)', () => {
    const msgs = buildSuggestMessages({
      transcriptWindow: 'plain transcript should not appear',
      previousPreviews: [],
      settings,
      annotatedTranscript: '[user]: hello  [other]: world',
    });
    const user = msgs[1]?.content ?? '';
    expect(user).toContain('speaker-annotated');
    expect(user).toContain('[user]: hello  [other]: world');
    expect(user).not.toContain('plain transcript should not appear');
  });

  it('falls back to the plain transcript window when annotatedTranscript is empty or whitespace', () => {
    const msgs = buildSuggestMessages({
      transcriptWindow: 'plain text wins here',
      previousPreviews: [],
      settings,
      annotatedTranscript: '   ',
    });
    const user = msgs[1]?.content ?? '';
    expect(user).toContain('plain text wins here');
    expect(user).not.toContain('speaker-annotated');
  });

  it('renders KNOWLEDGE_GRAPH lines with [kind], display, and (covered: ...)', () => {
    const msgs = buildSuggestMessages({
      transcriptWindow: 'we talked about Whisper',
      previousPreviews: [],
      settings,
      topicGraph: [
        graphNode({ label: 'whisper', display: 'Whisper', kind: 'entity' }),
        graphNode({
          label: 'p99 latency target is 200 ms',
          display: 'p99 latency target is 200 ms',
          kind: 'claim',
          covered: true,
        }),
        graphNode({
          label: 'whisperx',
          display: 'WhisperX',
          kind: 'tangent_seed',
          relatedLabels: ['speaker diarization'],
        }),
      ],
    });
    const user = msgs[1]?.content ?? '';
    expect(user).toContain(
      'KNOWLEDGE_GRAPH (topics raised so far in the call; "covered" means already explored or already suggested):',
    );
    expect(user).toContain('- [entity] Whisper (covered: false)');
    expect(user).toContain('- [claim] p99 latency target is 200 ms (covered: true)');
    expect(user).toContain(
      '- [tangent_seed] WhisperX → speaker diarization (covered: false)',
    );
  });

});

describe('SuggestionTypeSchema (single source of truth for the type enum)', () => {
  it('accepts every current SuggestionType including tangent', () => {
    for (const t of [
      'question_to_ask',
      'talking_point',
      'answer',
      'fact_check',
      'clarifying_info',
      'tangent',
    ] as const) {
      expect(SuggestionTypeSchema.safeParse(t).success).toBe(true);
    }
  });

  it('rejects unknown type strings', () => {
    expect(SuggestionTypeSchema.safeParse('rant').success).toBe(false);
  });
});

describe('buildExtractMessages', () => {
  it('system equals settings.extractPrompt; user wraps the chunk in triple-quotes', () => {
    const msgs = buildExtractMessages({
      chunkText: 'hello there.',
      settings: { extractPrompt: 'SYSTEM_EXTRACT' },
    });
    expect(msgs).toHaveLength(2);
    expect(msgs[0]).toEqual({ role: 'system', content: 'SYSTEM_EXTRACT' });
    expect(msgs[1]?.role).toBe('user');
    expect(msgs[1]?.content).toBe('RECENT_CHUNK:\n"""\nhello there.\n"""');
  });
});

describe('buildExpandMessages', () => {
  it('system equals settings.expandPrompt; user has SUGGESTION_TYPE, SUGGESTION_PREVIEW, and triple-quoted transcript', () => {
    const suggestion: Suggestion = {
      id: 's_1',
      type: 'fact_check',
      preview: 'Fact-check: claim — verdict',
    };
    const msgs = buildExpandMessages({
      suggestion,
      transcript: 'Some transcript content.',
      settings: { expandPrompt: 'SYSTEM_EXPAND' },
    });
    expect(msgs).toHaveLength(2);
    expect(msgs[0]).toEqual({ role: 'system', content: 'SYSTEM_EXPAND' });
    const user = msgs[1]?.content ?? '';
    expect(user).toContain('SUGGESTION_TYPE: fact_check');
    expect(user).toContain('SUGGESTION_PREVIEW: Fact-check: claim — verdict');
    expect(user).toContain('TRANSCRIPT:\n"""\nSome transcript content.\n"""');
  });
});

describe('buildChatMessages', () => {
  it('system contains chat prompt + LIVE_TRANSCRIPT + transcript; history preserved in order; final is user', () => {
    const history: ChatMessage[] = [
      { id: 'm1', role: 'user', text: 'first user', createdAt: 1 },
      { id: 'm2', role: 'assistant', text: 'first assistant', createdAt: 2 },
      { id: 'm3', role: 'user', text: 'second user', createdAt: 3 },
      { id: 'm4', role: 'assistant', text: 'second assistant', createdAt: 4 },
    ];
    const msgs = buildChatMessages({
      history,
      userText: 'NEW_USER_MESSAGE',
      transcript: 'LIVE TRANSCRIPT BODY',
      settings: { chatPrompt: 'SYSTEM_CHAT' },
    });

    expect(msgs).toHaveLength(1 + history.length + 1);
    const system = msgs[0];
    expect(system?.role).toBe('system');
    expect(system?.content).toContain('SYSTEM_CHAT');
    expect(system?.content).toContain('LIVE_TRANSCRIPT (most recent):');
    expect(system?.content).toContain('"""\nLIVE TRANSCRIPT BODY\n"""');

    expect(msgs[1]).toEqual({ role: 'user', content: 'first user' });
    expect(msgs[2]).toEqual({ role: 'assistant', content: 'first assistant' });
    expect(msgs[3]).toEqual({ role: 'user', content: 'second user' });
    expect(msgs[4]).toEqual({ role: 'assistant', content: 'second assistant' });

    const last = msgs[msgs.length - 1];
    expect(last).toEqual({ role: 'user', content: 'NEW_USER_MESSAGE' });
  });
});

describe('default prompts contain key phrases verbatim', () => {
  it('DEFAULT_SUGGEST_PROMPT is non-empty and has the key markers', () => {
    expect(DEFAULT_SUGGEST_PROMPT.length).toBeGreaterThan(0);
    expect(DEFAULT_SUGGEST_PROMPT.includes('EXACTLY 3')).toBe(true);
    expect(DEFAULT_SUGGEST_PROMPT.includes('PREVIEW RULES')).toBe(true);
    expect(DEFAULT_SUGGEST_PROMPT.includes('HOW TO THINK')).toBe(true);
    expect(DEFAULT_SUGGEST_PROMPT.includes('ANTI-REPETITION')).toBe(true);
    expect(DEFAULT_SUGGEST_PROMPT.includes('• tangent')).toBe(true);
    expect(DEFAULT_SUGGEST_PROMPT.includes('KNOWLEDGE_GRAPH')).toBe(true);
    expect(DEFAULT_SUGGEST_PROMPT.includes("user's own next thought")).toBe(true);
  });

  it('DEFAULT_EXTRACT_PROMPT is non-empty and lists the four output buckets', () => {
    expect(DEFAULT_EXTRACT_PROMPT.length).toBeGreaterThan(0);
    expect(DEFAULT_EXTRACT_PROMPT.includes('entities')).toBe(true);
    expect(DEFAULT_EXTRACT_PROMPT.includes('claims')).toBe(true);
    expect(DEFAULT_EXTRACT_PROMPT.includes('open_questions')).toBe(true);
    expect(DEFAULT_EXTRACT_PROMPT.includes('tangent_seeds')).toBe(true);
  });

  it('DEFAULT_EXPAND_PROMPT is non-empty and covers the tangent type', () => {
    expect(DEFAULT_EXPAND_PROMPT.length).toBeGreaterThan(0);
    expect(DEFAULT_EXPAND_PROMPT.includes('LENGTH: 90–180 words')).toBe(true);
    expect(DEFAULT_EXPAND_PROMPT.includes('tangent')).toBe(true);
  });

  it('DEFAULT_CHAT_PROMPT is non-empty and has the lead-with-the-answer marker', () => {
    expect(DEFAULT_CHAT_PROMPT.length).toBeGreaterThan(0);
    expect(DEFAULT_CHAT_PROMPT.includes('Lead with the answer')).toBe(true);
  });
});
