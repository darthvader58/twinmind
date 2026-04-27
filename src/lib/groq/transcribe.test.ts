import { describe, expect, it } from 'vitest';

import {
  isLikelySilenceFromSegments,
  isWhisperHallucination,
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
    expect(isLikelySilenceFromSegments([], 'anything')).toBe(false);
    expect(isLikelySilenceFromSegments([], '')).toBe(false);
  });

  it('flags high no_speech_prob even with short text', () => {
    const segments: WhisperSegment[] = [
      { no_speech_prob: 0.8, avg_logprob: -0.3, start: 0, end: 5 },
    ];
    expect(isLikelySilenceFromSegments(segments, 'Thank you')).toBe(true);
  });

  it('does not flag moderate no_speech_prob with reasonable text', () => {
    const segments: WhisperSegment[] = [
      { no_speech_prob: 0.2, avg_logprob: -0.3, start: 0, end: 4 },
      { no_speech_prob: 0.4, avg_logprob: -0.3, start: 4, end: 8 },
    ];
    expect(
      isLikelySilenceFromSegments(segments, 'This is a coherent statement.'),
    ).toBe(false);
  });

  it('flags low avg_logprob when text is short', () => {
    const segments: WhisperSegment[] = [
      { no_speech_prob: 0.2, avg_logprob: -1.2, start: 0, end: 3 },
      { no_speech_prob: 0.2, avg_logprob: -1.2, start: 3, end: 6 },
    ];
    expect(isLikelySilenceFromSegments(segments, 'you you you')).toBe(true);
  });

  it('does not flag low avg_logprob when text is long', () => {
    const segments: WhisperSegment[] = [
      { no_speech_prob: 0.2, avg_logprob: -1.2, start: 0, end: 3 },
      { no_speech_prob: 0.2, avg_logprob: -1.2, start: 3, end: 6 },
    ];
    expect(
      isLikelySilenceFromSegments(
        segments,
        'This is a long substantive sentence that goes on for a while.',
      ),
    ).toBe(false);
  });

  it('does not flag long substantive text with high confidence', () => {
    const segments: WhisperSegment[] = [
      { no_speech_prob: 0.05, avg_logprob: -0.2, start: 0, end: 4 },
      { no_speech_prob: 0.05, avg_logprob: -0.2, start: 4, end: 8 },
    ];
    expect(
      isLikelySilenceFromSegments(
        segments,
        'We need to align on the launch date and the rollback plan before Friday.',
      ),
    ).toBe(false);
  });
});
