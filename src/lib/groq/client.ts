import Groq from 'groq-sdk';

import { makeError, type TwinMindError } from '@/lib/types';

export interface NoApiKeyThrown extends Error {
  twinMindError: TwinMindError;
}

/**
 * Returns a Groq SDK client. Throws a tagged error when the key is blank so
 * route handlers can convert it into a JSON 400 before opening any stream.
 */
export function makeGroq(apiKey: string): Groq {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    const err = makeError(
      'no_api_key',
      'No Groq API key provided. Open Settings and paste your key.',
    );
    const thrown = new Error(err.message) as NoApiKeyThrown;
    thrown.twinMindError = err;
    throw thrown;
  }
  return new Groq({ apiKey: trimmed });
}

export function isNoApiKeyError(err: unknown): err is NoApiKeyThrown {
  return (
    typeof err === 'object' &&
    err !== null &&
    'twinMindError' in err &&
    (err as NoApiKeyThrown).twinMindError?.kind === 'no_api_key'
  );
}
