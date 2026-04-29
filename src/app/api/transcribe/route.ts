import { isNoApiKeyError, makeGroq } from '@/lib/groq/client';
import { transcribeChunk } from '@/lib/groq/transcribe';
import { contentLengthError, jsonError, missingApiKeyError } from '@/lib/http';
import { makeError } from '@/lib/types';

export const runtime = 'nodejs';

const MAX_AUDIO_REQUEST_BYTES = 10 * 1024 * 1024;
const MAX_AUDIO_CHUNK_BYTES = 10 * 1024 * 1024;
const SUPPORTED_AUDIO_MIME_PREFIXES = ['audio/webm', 'audio/mp4'] as const;

function isSupportedAudioMime(mime: string): boolean {
  return SUPPORTED_AUDIO_MIME_PREFIXES.some(
    (prefix) => mime === prefix || mime.startsWith(`${prefix};`),
  );
}

export async function POST(req: Request): Promise<Response> {
  const sizeError = contentLengthError(req, MAX_AUDIO_REQUEST_BYTES, 'Audio upload');
  if (sizeError) return jsonError(sizeError);

  const apiKey = req.headers.get('x-groq-key') ?? '';
  if (!apiKey.trim()) {
    return jsonError(missingApiKeyError());
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError(
      makeError('invalid_json', 'Request body was not valid multipart/form-data.'),
    );
  }

  const audio = form.get('audio');
  const mime = form.get('mime');
  if (!(audio instanceof Blob)) {
    return jsonError(
      makeError('invalid_json', 'Missing or invalid "audio" field in form data.'),
    );
  }

  const mimeStr =
    typeof mime === 'string' && mime.length > 0 ? mime : audio.type || 'audio/webm';
  if (!isSupportedAudioMime(mimeStr)) {
    return jsonError(
      makeError(
        'invalid_json',
        'Unsupported audio format. Use audio/webm or audio/mp4.',
      ),
    );
  }
  if (audio.size === 0) {
    return jsonError(
      makeError('invalid_json', 'Audio chunk was empty.'),
    );
  }
  if (audio.size > MAX_AUDIO_CHUNK_BYTES) {
    return jsonError(
      makeError('invalid_json', 'Audio chunk is too large (max 10 MB).'),
    );
  }

  const ext = mimeStr.includes('mp4') ? 'mp4' : 'webm';
  const file =
    audio instanceof File
      ? audio
      : new File([audio], `chunk.${ext}`, { type: mimeStr });

  let client;
  try {
    client = makeGroq(apiKey);
  } catch (err) {
    if (isNoApiKeyError(err)) return jsonError(err.twinMindError);
    return jsonError(makeError('unknown', 'Failed to initialize Groq client.'));
  }

  const result = await transcribeChunk(client, file);
  if (!result.ok) return jsonError(result.error);

  return Response.json({
    text: result.data.text,
    durationMs: result.data.durationMs,
    language: result.data.language,
  });
}
