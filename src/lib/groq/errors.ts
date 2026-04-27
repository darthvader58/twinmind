import { makeError, type TwinMindError } from '@/lib/types';

const GROQ_KEY_PATTERN = /gsk_[A-Za-z0-9_-]+/g;

/** Removes anything that looks like a Groq API key from a string. */
export function stripKey(s: string): string {
  return s.replace(GROQ_KEY_PATTERN, '[redacted]');
}

/**
 * Maps an unknown error (typically thrown by the Groq SDK) into a `TwinMindError`.
 * Inspects `.status` numerically when available; otherwise falls back to the
 * error's message. Always strips API-key fragments from the surfaced message.
 */
export function mapGroqError(err: unknown): TwinMindError {
  const statusRaw = (err as { status?: unknown })?.status;
  const status = typeof statusRaw === 'number' ? statusRaw : undefined;

  const rawMessage =
    typeof (err as { message?: unknown })?.message === 'string'
      ? ((err as { message: string }).message)
      : String(err);
  const message = stripKey(rawMessage);

  if (status === 401) {
    return makeError(
      'groq_unauthorized',
      'Groq rejected the API key — check it in Settings.',
      err,
    );
  }
  if (status === 429) {
    return makeError(
      'groq_rate_limit',
      'Groq is rate-limiting requests; please wait a moment.',
      err,
    );
  }
  if (typeof status === 'number' && status >= 500) {
    return makeError(
      'groq_server',
      'Groq server error; please retry shortly.',
      err,
    );
  }
  if (
    status === 400 &&
    (message.includes('json_validate_failed') ||
      message.includes('Failed to validate JSON'))
  ) {
    return makeError(
      'invalid_json',
      'Groq JSON validator rejected model output (likely truncated).',
      err,
    );
  }

  return makeError('unknown', message, err);
}

/**
 * Strips the `cause` field and re-runs `stripKey` over the message so the
 * wire-side payload never carries SDK internals or auth fragments.
 */
export function toSafeError(error: TwinMindError): {
  kind: TwinMindError['kind'];
  message: string;
} {
  return { kind: error.kind, message: stripKey(error.message) };
}
