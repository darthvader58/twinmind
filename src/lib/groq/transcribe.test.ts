import { describe, expect, it } from 'vitest';

import {
  isLikelySilenceFromSegments,
  isWhisperHallucination,
  joinTranscriptForContext,
  type WhisperSegment,
} from './transcribe';

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
    'Terima kasih telah menonton!',
    'Gracias por ver el video.',
    'Obrigado por assistir.',
    "Merci d'avoir regardé la vidéo!",
    'Danke fürs Zuschauen.',
    'Grazie per aver guardato.',
    'ご視聴ありがとうございました。',
    '谢谢观看。',
    '请订阅',
    '시청해주셔서 감사합니다.',
    'Спасибо за просмотр.',
    'شكرا لكم على المشاهدة',
    'देखने के लिए धन्यवाद',
    'Cảm ơn các bạn đã xem!',
    'İzlediğiniz için teşekkürler.',
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
    'Gracias, eso responde mi pregunta.',
    'Thanks, that helps a lot.',
  ])('does NOT flag %j as hallucination', (input) => {
    expect(isWhisperHallucination(input)).toBe(false);
  });
});

describe('isLikelySilenceFromSegments', () => {
  it('returns false when there are no segments', () => {
    expect(isLikelySilenceFromSegments([])).toBe(false);
  });

  it('flags weighted no_speech_prob at the new 0.5 threshold', () => {
    const segments: WhisperSegment[] = [
      { no_speech_prob: 0.55, avg_logprob: -0.3, start: 0, end: 5 },
    ];
    expect(isLikelySilenceFromSegments(segments)).toBe(true);
  });

  it('does not flag moderate no_speech_prob below 0.5', () => {
    const segments: WhisperSegment[] = [
      { no_speech_prob: 0.2, avg_logprob: -0.3, start: 0, end: 4 },
      { no_speech_prob: 0.4, avg_logprob: -0.3, start: 4, end: 8 },
    ];
    expect(isLikelySilenceFromSegments(segments)).toBe(false);
  });

  it('flags low avg_logprob length-agnostically — long, fluent hallucinations are the dangerous regime', () => {
    const segments: WhisperSegment[] = [
      { no_speech_prob: 0.2, avg_logprob: -0.8, start: 0, end: 3 },
      { no_speech_prob: 0.2, avg_logprob: -0.8, start: 3, end: 6 },
    ];
    // Was previously NOT flagged because text length > 30; now it is.
    expect(isLikelySilenceFromSegments(segments)).toBe(true);
  });

  it('does not flag long substantive text with high confidence', () => {
    const segments: WhisperSegment[] = [
      { no_speech_prob: 0.05, avg_logprob: -0.2, start: 0, end: 4 },
      { no_speech_prob: 0.05, avg_logprob: -0.2, start: 4, end: 8 },
    ];
    expect(isLikelySilenceFromSegments(segments)).toBe(false);
  });

  it('keeps short, confident speech (single word with high confidence does not trip)', () => {
    const segments: WhisperSegment[] = [
      { no_speech_prob: 0.1, avg_logprob: -0.4, start: 0, end: 1 },
    ];
    expect(isLikelySilenceFromSegments(segments)).toBe(false);
  });
});

describe('joinTranscriptForContext', () => {
  it('returns empty string for empty input', () => {
    expect(joinTranscriptForContext([])).toBe('');
  });

  it('drops chunks whose text matches a known hallucination pattern', () => {
    const out = joinTranscriptForContext([
      { text: 'We need to align on the launch date.' },
      { text: 'Thanks for watching' },
      { text: 'Then we ship next Tuesday.' },
    ]);
    expect(out).toBe('We need to align on the launch date. Then we ship next Tuesday.');
  });

  it('drops empty-text chunks (silence rows) without leaving double separators', () => {
    const out = joinTranscriptForContext([
      { text: 'First substantive line.' },
      { text: '' },
      { text: 'Second substantive line.' },
    ]);
    expect(out).toBe('First substantive line. Second substantive line.');
  });

  it('honours a custom separator', () => {
    const out = joinTranscriptForContext(
      [{ text: 'one' }, { text: 'two' }],
      '\n',
    );
    expect(out).toBe('one\ntwo');
  });

  it('preserves chunks that look like hallucinations only at substring level', () => {
    const out = joinTranscriptForContext([
      { text: 'I said thank you to the team after the demo.' },
    ]);
    expect(out).toBe('I said thank you to the team after the demo.');
  });
});
