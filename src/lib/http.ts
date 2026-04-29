import { toSafeError } from '@/lib/groq/errors';
import { makeError, type TwinMindError } from '@/lib/types';

export const STATUS_BY_KIND: Record<TwinMindError['kind'], number> = {
  no_api_key: 400,
  groq_unauthorized: 401,
  groq_rate_limit: 429,
  groq_server: 502,
  invalid_json: 400,
  mic_denied: 400,
  mic_unavailable: 400,
  network: 502,
  unknown: 500,
};

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/**
 * Returns a typed error when the declared request body size exceeds the route's
 * budget. Missing or malformed Content-Length headers are ignored so compliant
 * browsers and frameworks continue to work.
 */
export function contentLengthError(
  req: Request,
  maxBytes: number,
  label: string,
): TwinMindError | undefined {
  const raw = req.headers.get('content-length');
  if (!raw) return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  if (parsed <= maxBytes) return undefined;
  return makeError(
    'invalid_json',
    `${label} is too large (max ${formatBytes(maxBytes)}).`,
  );
}

export function jsonError(error: TwinMindError): Response {
  return Response.json(
    { error: toSafeError(error) },
    { status: STATUS_BY_KIND[error.kind] },
  );
}

export function missingApiKeyError(): TwinMindError {
  return makeError(
    'no_api_key',
    'Missing x-groq-key header. Open Settings and paste your key.',
  );
}
