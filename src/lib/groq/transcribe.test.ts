import { describe, expect, it } from 'vitest';

import { isWhisperHallucination } from './transcribe';

describe('isWhisperHallucination', () => {
  it.each([
    '',
    '   ',
    '\n',
    '.',
    '...',
    'Thank you',
    'Thank you.',
    'thank you!',
    'Thanks for watching',
    'Thanks for watching.',
    'Please subscribe',
    'Please subscribe.',
    'Bye',
    'bye.',
    'you',
    'you.',
    'youu',
    'YouUu',
    '(silence)',
    '[Music]',
    'Subtitles by Joe',
    'Transcribed by AI',
    '[applause]',
    'you you you',
    'yes yes yes yes',
    'okay okay okay',
  ])('flags %j as hallucination', (input) => {
    expect(isWhisperHallucination(input)).toBe(true);
  });

  it.each([
    'Hello world.',
    'Yes, I think so.',
    'We should talk about Whisper hallucinations.',
    'The p99 latency target is 200 ms.',
    'Thanks for watching the demo I prepared.',
    'I said you, you, and the third one too.',
  ])('does NOT flag %j as hallucination', (input) => {
    expect(isWhisperHallucination(input)).toBe(false);
  });
});
