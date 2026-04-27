import type { ChatMessage, Suggestion } from '@/lib/types';

export interface ChatMsg {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface SuggestSettings {
  suggestPrompt: string;
}

export interface ExpandSettings {
  expandPrompt: string;
}

export interface ChatPromptSettings {
  chatPrompt: string;
}

const SENTENCE_BOUNDARY_LOOKAHEAD = 200;

/**
 * Returns the tail of `text` of at most `maxChars` characters, attempting to
 * back up to a sentence boundary or newline within the first 200 chars of the
 * slice so the window does not start mid-sentence. Pure; never throws.
 */
export function sliceTail(text: string, maxChars: number): string {
  if (maxChars <= 0) return '';
  if (text.length <= maxChars) return text;
  const slice = text.slice(text.length - maxChars);
  const head = slice.slice(0, SENTENCE_BOUNDARY_LOOKAHEAD);
  const newlineIdx = head.indexOf('\n');
  const sentenceIdx = head.indexOf('. ');
  const candidates: number[] = [];
  if (newlineIdx !== -1) candidates.push(newlineIdx + 1);
  if (sentenceIdx !== -1) candidates.push(sentenceIdx + 2);
  if (candidates.length === 0) return slice;
  const cut = Math.min(...candidates);
  return slice.slice(cut);
}

export function buildSuggestMessages(args: {
  transcriptWindow: string;
  previousPreviews: string[];
  settings: SuggestSettings;
}): ChatMsg[] {
  const { transcriptWindow, previousPreviews, settings } = args;
  const previewsBlock =
    previousPreviews.length === 0
      ? 'PREVIOUS_PREVIEWS (avoid repeating): (none yet)'
      : `PREVIOUS_PREVIEWS (avoid repeating):\n${previousPreviews.map((p) => `- ${p}`).join('\n')}`;

  const transcriptIsEmpty = transcriptWindow.trim() === '';
  const transcriptBlock = transcriptIsEmpty
    ? 'RECENT_TRANSCRIPT (last ~0 chars): (no transcript yet — produce 3 useful kickoff suggestions for an unknown live conversation)'
    : `RECENT_TRANSCRIPT (last ~${transcriptWindow.length} chars):\n"""\n${transcriptWindow}\n"""`;

  const userContent = `${previewsBlock}\n\n${transcriptBlock}\n\nNow produce exactly 3 suggestions per the rules.`;

  return [
    { role: 'system', content: settings.suggestPrompt },
    { role: 'user', content: userContent },
  ];
}

export function buildExpandMessages(args: {
  suggestion: Suggestion;
  transcript: string;
  settings: ExpandSettings;
}): ChatMsg[] {
  const { suggestion, transcript, settings } = args;
  const userContent = `SUGGESTION_TYPE: ${suggestion.type}\nSUGGESTION_PREVIEW: ${suggestion.preview}\n\nTRANSCRIPT:\n"""\n${transcript}\n"""`;
  return [
    { role: 'system', content: settings.expandPrompt },
    { role: 'user', content: userContent },
  ];
}

export function buildChatMessages(args: {
  history: ChatMessage[];
  userText: string;
  transcript: string;
  settings: ChatPromptSettings;
}): ChatMsg[] {
  const { history, userText, transcript, settings } = args;
  const system = `${settings.chatPrompt}\n\nLIVE_TRANSCRIPT (most recent):\n"""\n${transcript}\n"""`;
  const historyMsgs: ChatMsg[] = history.map((m) => ({
    role: m.role,
    content: m.text,
  }));
  return [
    { role: 'system', content: system },
    ...historyMsgs,
    { role: 'user', content: userText },
  ];
}
