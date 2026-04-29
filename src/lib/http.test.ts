import { describe, expect, it } from 'vitest';

import { contentLengthError, jsonError, missingApiKeyError } from './http';

describe('contentLengthError', () => {
  it('ignores requests without a content-length header', () => {
    const req = new Request('https://example.com');
    expect(contentLengthError(req, 100, 'Body')).toBeUndefined();
  });

  it('ignores malformed content-length values', () => {
    const req = new Request('https://example.com', {
      headers: { 'content-length': 'not-a-number' },
    });
    expect(contentLengthError(req, 100, 'Body')).toBeUndefined();
  });

  it('returns a typed invalid_json error when the body is too large', () => {
    const req = new Request('https://example.com', {
      headers: { 'content-length': '2048' },
    });
    expect(contentLengthError(req, 1024, 'Body')).toEqual({
      kind: 'invalid_json',
      message: 'Body is too large (max 1 KB).',
      cause: undefined,
    });
  });
});

describe('jsonError', () => {
  it('maps typed errors to JSON responses with safe payloads', async () => {
    const res = jsonError(missingApiKeyError());
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: {
        kind: 'no_api_key',
        message: 'Missing x-groq-key header. Open Settings and paste your key.',
      },
    });
  });
});
