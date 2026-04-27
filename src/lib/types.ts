export type RecordingState = 'idle' | 'recording' | 'starting' | 'stopping' | 'error';

export type SuggestionType =
  | 'question_to_ask'
  | 'talking_point'
  | 'answer'
  | 'fact_check'
  | 'clarifying_info'
  | 'tangent';

export type TopicNodeKind = 'entity' | 'claim' | 'open_question' | 'tangent_seed';

export interface TopicGraphNode {
  id: string;
  /** Canonicalized (lowercased, trimmed) — used for dedupe and substring matching. */
  label: string;
  /** Original-case form preserved for prompt rendering. */
  display: string;
  kind: TopicNodeKind;
  firstMentionedAtMs: number;
  lastMentionedAtMs: number;
  covered: boolean;
  /** For `tangent_seed` nodes, the related concepts the model proposed. */
  relatedLabels: string[];
}

export interface Suggestion {
  id: string;
  type: SuggestionType;
  preview: string;
}

export interface SuggestionBatch {
  id: string;
  suggestions: [Suggestion, Suggestion, Suggestion];
  generatedAt: number;
  latencyMs?: number;
  error?: TwinMindError;
}

export interface TranscriptChunk {
  id: string;
  text: string;
  startedAtMs: number;
  durationMs: number;
  language?: string;
  error?: TwinMindError;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: number;
  streaming?: boolean;
  sourceSuggestionId?: string;
  sourceSuggestionPreview?: string;
  error?: TwinMindError;
}

export type TwinMindErrorKind =
  | 'no_api_key'
  | 'groq_unauthorized'
  | 'groq_rate_limit'
  | 'groq_server'
  | 'invalid_json'
  | 'mic_denied'
  | 'mic_unavailable'
  | 'network'
  | 'unknown';

export interface TwinMindError {
  kind: TwinMindErrorKind;
  message: string;
  cause?: unknown;
}

export const makeError = (
  kind: TwinMindErrorKind,
  message: string,
  cause?: unknown,
): TwinMindError => ({ kind, message, cause });
