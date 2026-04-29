export type SseSend = (event: string, data: unknown) => void;

export interface SseStreamOptions {
  signal?: AbortSignal;
  onError?: (error: unknown, send: SseSend) => void;
}

/**
 * Wraps a generator-style start function in a `Response` whose body is a
 * Server-Sent Events stream. The start callback receives a `send(event, data)`
 * helper that JSON-encodes the data payload. The stream closes when start
 * returns, throws, or the client disconnects.
 */
export function sseStream(
  start: (send: SseSend, signal?: AbortSignal) => Promise<void>,
  opts: SseStreamOptions = {},
): Response {
  const { signal, onError } = opts;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;

      const close = (): void => {
        if (closed) return;
        closed = true;
        controller.close();
      };

      const send: SseSend = (event, data) => {
        if (closed || signal?.aborted) return;
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        try {
          controller.enqueue(encoder.encode(payload));
        } catch {
          close();
        }
      };

      const onAbort = (): void => {
        close();
      };

      signal?.addEventListener('abort', onAbort, { once: true });

      try {
        await start(send, signal);
      } catch (error) {
        if (!signal?.aborted) onError?.(error, send);
      } finally {
        signal?.removeEventListener('abort', onAbort);
        close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
