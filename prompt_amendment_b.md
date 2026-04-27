# prompt.md — Amendment B: VAD Chunking, Transcript Streaming UX, Chat Abort

> This file is a targeted amendment runbook. The build is already complete and deployed.
> Apply only the changes in §1–§3 below. Do not re-scaffold, do not touch unrelated files.
> Read `CLAUDE.md` in full first — it is still binding. If anything below contradicts it, surface the conflict and stop.

---

## Preflight

1. Read `CLAUDE.md` in full.
2. Confirm the repo builds cleanly: `pnpm typecheck && pnpm lint && pnpm test --run && pnpm build`. Fix any pre-existing failures before touching anything in this runbook.
3. Confirm the existing deploy is live and working (paste the Vercel URL if unsure).
4. Reply with a one-paragraph plan, then proceed.

---

## Feature 1 — VAD-based dynamic chunking

**What:** Replace the flat 30-second `setInterval` in `RollingRecorder` with voice-activity detection so chunks fire on natural speech pauses (silence ≥ 1.2s) rather than a fixed wall-clock timer. This cuts transcript latency on short utterances from up to 30s → 2–4s, without breaking Whisper decode reliability (self-contained chunks still required).

**Library:** `@ricky0123/vad-web` (MIT, ~35 KB gzip, ships its own ONNX runtime worker — no MediaRecorder dependency). Install: `pnpm add @ricky0123/vad-web`.

**Implementation:**

In `src/lib/audio/recorder.ts`, add a `vadMode: boolean` constructor option (default `true`). When `vadMode` is true:

- Instead of `MediaRecorder` + `setInterval`, use `@ricky0123/vad-web`'s `MicVAD.new({ ... })` API:
  ```ts
  import { MicVAD } from '@ricky0123/vad-web';

  this.vad = await MicVAD.new({
    onSpeechEnd: (audio: Float32Array) => {
      // audio is 16kHz Float32. Convert to wav blob, emit chunk.
      const blob = float32ToWav(audio);
      this.emit('chunk', { blob, mime: 'audio/wav', startedAtMs: this.chunkStartMs, durationMs: Date.now() - this.chunkStartMs });
      this.chunkStartMs = Date.now();
    },
    positiveSpeechThreshold: 0.85,
    negativeSpeechThreshold: 0.35,
    minSpeechFrames: 5,
    preSpeechPadFrames: 10,
  });
  await this.vad.start();
  ```
- Add a pure helper `float32ToWav(samples: Float32Array, sampleRate = 16000): Blob` in `src/lib/audio/wav.ts`. WAV is a PCM container — write the 44-byte header + raw samples. Groq Whisper accepts `audio/wav`.
- When `vadMode` is false (settings toggle), fall back to the existing `MediaRecorder` + `setInterval` behavior unchanged.
- On `stop()`, call `this.vad.pause()` then destroy.

Add a toggle in the settings modal: **"VAD chunking"** (default on). When off, the flat-timer path runs and `chunkSeconds` is respected as before. Surface the current mode as a small pill in the transcript column header ("VAD" or "30s").

Add to `useSettingsStore`: `vadMode: boolean` (default `true`). Persist with other settings.

Update `src/lib/audio/mime.ts`: when `vadMode` is true, `pickMime()` returns `'audio/wav'` (the VAD path produces WAV). When false, return the existing webm/mp4 priority list.

**Tests:**
- Unit test `float32ToWav`: feed 16000 samples (1 second of silence), assert the blob is a valid WAV (checks the `RIFF` header bytes).
- Unit test the `RollingRecorder` constructor: when `vadMode: false`, it uses `MediaRecorder`; when `vadMode: true`, it uses `MicVAD` (mock both).

**What NOT to do:**
- Do not remove the `MediaRecorder` path — Safari and some mobile browsers may not support the VAD library's ONNX runtime.
- Do not send raw Float32 to Groq — always convert to WAV first.
- Do not change anything in `useTranscriptionLoop` — it receives chunks via the same `chunk` event regardless of the recording mode.

---

## Feature 2 — Transcript streaming UX (in-flight placeholder)

**What:** Groq Whisper returns only after the full chunk is processed (~1–3 s). During that gap the user sees nothing. Add a live "transcribing…" placeholder that appears immediately when a chunk enters the queue and is replaced with real text when the response arrives. This is a pure UI improvement — no API changes.

**Implementation:**

Add a new field to `TranscriptChunk` in `src/lib/types.ts`:
```ts
type TranscriptChunkStatus = 'pending' | 'transcribing' | 'done' | 'error';

interface TranscriptChunk {
  id: string;
  text: string;
  startedAtMs: number;
  durationMs: number;
  status: TranscriptChunkStatus;
  error?: TwinMindError;
}
```

In `useSessionStore`, update `appendChunk` to accept partial chunks and add `updateChunk(id, partial: Partial<TranscriptChunk>)` action.

In `useTranscriptionLoop`, update the queue flow:
1. When a blob arrives from the recorder, immediately call `appendChunk({ id, text: '', startedAtMs, durationMs, status: 'pending' })`.
2. When it moves to in-flight, call `updateChunk(id, { status: 'transcribing' })`.
3. On success: `updateChunk(id, { text, status: 'done' })`.
4. On error: `updateChunk(id, { status: 'error', error })`.

In `TranscriptLine.tsx`, render by status:
- `pending`: muted timestamp + a subtle animated shimmer bar (pure CSS, `animate-pulse` on a rounded rect).
- `transcribing`: timestamp + "transcribing…" in muted italic with a pulsing dot (3-dot CSS animation, no external dep).
- `done`: existing timestamp + text style.
- `error`: existing error style + inline retry button.

The shimmer/pulse should match the dark token palette. Keep the animation subtle — it should be clearly "something is happening" without being distracting during a live meeting.

**Tests:**
- Unit test `useTranscriptionLoop` queue: mock the `/api/transcribe` fetch, assert the chunk status transitions `pending → transcribing → done` in order.
- Snapshot test `TranscriptLine` for each status variant.

---

## Feature 3 — Abort-mid-stream chat cancel UI

**What:** Add a "Stop generating" button that appears on the active assistant message bubble while it is streaming. Clicking it aborts the SSE connection and finalizes the partial message. The user keeps whatever was streamed — no data is lost.

**Implementation:**

In `src/lib/store/session.ts`, extend `ChatMessage`:
```ts
interface ChatMessage {
  // existing fields ...
  streaming?: boolean;
  aborted?: boolean;      // true if user cancelled before completion
  abortFn?: () => void;   // called by the button; cleared after abort
}
```

In `useChat.ts`:
- When starting a stream, create an `AbortController`. Store `controller.abort.bind(controller)` on the message via `updateChatMessage(id, { abortFn })`.
- Pass `signal: controller.signal` to the `fetch` call for `/api/chat`.
- On the `done` event: call `finalizeAssistantMessage(id)` (existing), clear `abortFn`.
- On abort (the fetch throws `AbortError`): call `finalizeAssistantMessage(id)` with `{ aborted: true }`. Do NOT show an error state — partial content is intentional.
- On the `error` event from SSE: existing error handling unchanged.

Add `updateChatMessage(id: string, partial: Partial<ChatMessage>): void` action to `useSessionStore`.

In `ChatMessage.tsx`, when `message.streaming === true && message.abortFn`:
- Render a small "◼ Stop" button below the partial text. Tailwind: `text-xs text-muted border border-muted/40 rounded px-2 py-0.5 hover:border-muted/80 transition-colors`.
- On click: call `message.abortFn()`. The button disappears immediately (optimistic: `streaming` will flip to false once the abort propagates).
- When `message.aborted === true` and streaming is done: render a small muted note "— generation stopped" at the end of the message text.

**What NOT to do:**
- Do not expose `abortFn` to the Zustand store's external consumers — it is internal to the message object and only the button should call it.
- Do not show a red error state for aborted messages — aborts are intentional, not errors.
- Do not abort the transcription loop or suggestion loop — only the active chat stream.

**Tests:**
- Unit test `useChat`: mock SSE, call the `abortFn` mid-stream, assert the message ends up with `streaming: false, aborted: true` and the partial text is retained.

---

## Post-amendment gates

Run in order. Fix any failure before proceeding to the next.

```
pnpm install            # picks up @ricky0123/vad-web
pnpm typecheck
pnpm lint --max-warnings=0
pnpm test --run         # update snapshots deliberately; do not delete assertions
pnpm build
```

Then **local smoke** (required before deploy):

1. Open `pnpm dev`, paste Groq key, enable VAD chunking (default on).
2. Click mic, speak a sentence, then pause for 2 seconds. Confirm a transcript line appears within 3–4 seconds of you finishing speaking (not after 30s).
3. Confirm a "transcribing…" pulse appears immediately after the chunk fires, before the Groq response arrives.
4. Start a chat message from a suggestion. While it is streaming, click "◼ Stop". Confirm the partial text is retained, the "— generation stopped" note appears, and no error state is shown.
5. Open Settings, toggle VAD off, re-test chunking — confirm the 30s flat-timer path still works.
6. Export JSON — confirm the chunk status field appears in the export (`"status": "done"` on completed lines).

Then **pause and tell me** — I will run `pnpm dlx vercel --prod` from my terminal.

---

## README updates required

After the features are working, add these entries:

**In "How it works" / pipeline diagram:** annotate the audio box with "VAD: fires on silence ≥1.2s (or 30s flat-timer fallback)".

**In "What I would do next with more time":** move items 1, 2, and 3 out of that list (or strike them with a note "✓ shipped"). Keep items 4–8 as-is.

**In "Architecture decisions":** add one bullet: "VAD-based chunking via `@ricky0123/vad-web` — fires on natural speech pauses instead of a wall-clock timer, cutting perceived transcript latency from up to 30 s to 2–4 s on short utterances. MediaRecorder flat-timer is retained as a fallback for environments where the ONNX runtime does not load."

**Do NOT change the "Comparison vs. TwinMind's live suggestions" section** — those bullets are already correct.

---

## What NOT to add (explicit exclusions)

- **Multi-user rooms (item 7):** requires auth, a database, and real-time sync — contradicts the brief's "no login, no data persistence" requirement. It stays in "what I'd do next," not in the build.
- **Persistent sessions behind auth (item 8):** same reason.
- **Lightweight telemetry panel (item 5):** nice-to-have but adds surface area without improving the eval rubric criteria.
- **Playwright e2e (item 6):** out of scope for the amendment; the brief doesn't grade test coverage explicitly.
- **Notes scratchpad, Summary tab, action items, post-recording recap:** still banned per the brief.