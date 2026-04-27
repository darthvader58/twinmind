import { isNoApiKeyError, makeGroq } from '@/lib/groq/client';
import { toSafeError } from '@/lib/groq/errors';
import { transcribeChunk } from '@/lib/groq/transcribe';
import { makeError, type TwinMindError } from '@/lib/types';

export const runtime = 'nodejs';

const STATUS_BY_KIND: Record<TwinMindError['kind'], number> = {
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

function errorResponse(error: TwinMindError): Response {
  return Response.json(
    { error: toSafeError(error) },
    { status: STATUS_BY_KIND[error.kind] },
  );
}

export async function POST(req: Request): Promise<Response> {
  const apiKey = req.headers.get('x-groq-key') ?? '';
  if (!apiKey.trim()) {
    return errorResponse(
      makeError(
        'no_api_key',
        'Missing x-groq-key header. Open Settings and paste your key.',
      ),
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return errorResponse(
      makeError('invalid_json', 'Request body was not valid multipart/form-data.'),
    );
  }

  const audio = form.get('audio');
  const mime = form.get('mime');
  if (!(audio instanceof Blob)) {
    return errorResponse(
      makeError('invalid_json', 'Missing or invalid "audio" field in form data.'),
    );
  }

  const mimeStr = typeof mime === 'string' && mime.length > 0 ? mime : 'audio/webm';
  const ext = mimeStr.includes('mp4') ? 'mp4' : 'webm';
  const file =
    audio instanceof File
      ? audio
      : new File([audio], `chunk.${ext}`, { type: mimeStr });

  let client;
  try {
    client = makeGroq(apiKey);
  } catch (err) {
    if (isNoApiKeyError(err)) return errorResponse(err.twinMindError);
    return errorResponse(makeError('unknown', 'Failed to initialize Groq client.'));
  }

  const result = await transcribeChunk(client, file);
  if (!result.ok) return errorResponse(result.error);

  return Response.json({
    text: result.data.text,
    durationMs: result.data.durationMs,
    language: result.data.language,
  });
}
