export interface SseEvent<T = unknown> {
  event: string;
  data: T;
}

/**
 * Async iterator over a Server-Sent Events response body. Yields one event
 * per `data:` block; multi-line `data:` payloads are joined with newlines and
 * parsed as JSON. Malformed JSON is silently skipped to keep the stream alive.
 */
export async function* readSSE<T = unknown>(
  res: Response,
): AsyncGenerator<SseEvent<T>, void, void> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx = buffer.indexOf('\n\n');
    while (idx !== -1) {
      const raw = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      let event = 'message';
      const dataLines: string[] = [];
      for (const line of raw.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
      }
      if (dataLines.length > 0) {
        const dataStr = dataLines.join('\n');
        try {
          const data = JSON.parse(dataStr) as T;
          yield { event, data };
        } catch {
          // skip malformed payload
        }
      }
      idx = buffer.indexOf('\n\n');
    }
  }
}
