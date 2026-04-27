import { describe, expect, it } from 'vitest';

import type { ChatMessage, Suggestion } from '@/lib/types';

import {
  buildChatMessages,
  buildExpandMessages,
  buildSuggestMessages,
  sliceTail,
} from './assemble';
import {
  DEFAULT_CHAT_PROMPT,
  DEFAULT_EXPAND_PROMPT,
  DEFAULT_SUGGEST_PROMPT,
} from './defaults';

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
    expect(msgs[1]?.content).toContain('PREVIOUS_PREVIEWS (avoid repeating): (none yet)');
    expect(msgs[1]?.content).toContain('Now produce exactly 3 suggestions per the rules.');
  });

  it('with two previous previews: user includes "- prev1" and "- prev2"', () => {
    const msgs = buildSuggestMessages({
      transcriptWindow: 'Some transcript text.',
      previousPreviews: ['prev1', 'prev2'],
      settings,
    });
    const user = msgs[1]?.content ?? '';
    expect(user).toContain('PREVIOUS_PREVIEWS (avoid repeating):');
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
  });

  it('DEFAULT_EXPAND_PROMPT is non-empty and has the en-dash length marker', () => {
    expect(DEFAULT_EXPAND_PROMPT.length).toBeGreaterThan(0);
    expect(DEFAULT_EXPAND_PROMPT.includes('LENGTH: 90–180 words')).toBe(true);
  });

  it('DEFAULT_CHAT_PROMPT is non-empty and has the lead-with-the-answer marker', () => {
    expect(DEFAULT_CHAT_PROMPT.length).toBeGreaterThan(0);
    expect(DEFAULT_CHAT_PROMPT.includes('Lead with the answer')).toBe(true);
  });
});
