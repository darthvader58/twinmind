export type SseSend = (event: string, data: unknown) => void;

/**
 * Wraps a generator-style start function in a `Response` whose body is a
 * Server-Sent Events stream. The start callback receives a `send(event, data)`
 * helper that JSON-encodes the data payload. The stream closes when start
 * returns or throws.
 */
export function sseStream(
  start: (send: SseSend) => Promise<void>,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send: SseSend = (event, data) => {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(payload));
      };
      try {
        await start(send);
      } finally {
        controller.close();
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
