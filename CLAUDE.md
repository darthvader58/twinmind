# CLAUDE.md — TwinMind Live Suggestions

> **Read this file before every action.** It defines the architecture, contracts, and non-negotiables for this repository. If a request conflicts with this file, surface the conflict and stop — do not silently deviate.

---

## 1. Mission

A web app that listens to live mic audio, streams a rolling transcript, surfaces **exactly 3 fresh, context-aware suggestions** every ~30 seconds, and opens detailed answers in a continuous session chat when a suggestion is tapped. Single page, 3 columns, no auth, no persistence beyond the current page session.

We are competing on **suggestion quality, prompt engineering, latency, and code quality** — in that order. UI is fixed by the reference mockup; do not invent layout.

---

## 2. Tech Stack (locked)

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 14 (App Router) + TypeScript strict** | One repo, server routes for Groq, easy Vercel deploy |
| Styling | **Tailwind CSS** + CSS variables for tokens | Matches mockup density, no design drift |
| State | **Zustand** (with `persist` middleware only for `settings`) | Minimal boilerplate, selectors prevent re-render storms |
| Validation | **Zod** at every API boundary | Type-safe, runtime-safe, single source of schema truth |
| LLM | **Groq SDK** (server-side only) | Whisper Large V3 + GPT-OSS 120B as required |
| Streaming | **SSE** via `ReadableStream` (Web standard) | Native fetch, no extra deps, works on Vercel Edge |
| Audio | **MediaRecorder** (rolling, stop/start every chunk) | Reliable self-contained chunks for Whisper |
| Runtime | `nodejs` runtime for `/api/transcribe` (multipart), `edge` for `/api/suggest` and `/api/chat` | Edge for streaming latency; Node for FormData → Groq file upload |
| Package mgr | **pnpm** | Fast; lockfile committed |
| Tests | **Vitest** for `lib/` units; **Playwright** smoke for the recording loop (optional) | Fast feedback on prompt assemblers and chunkers |

**Banned:** Redux, MobX, server-state libraries (TanStack Query is unnecessary here), CSS-in-JS, custom UI kits, any localStorage usage outside `settings` store, any persistence of transcript/chat/suggestions across page reloads, any hardcoded API key.

---

## 3. Directory Layout

```
twinmind/
├── CLAUDE.md
├── README.md
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── next.config.ts
├── tailwind.config.ts
├── postcss.config.mjs
├── .env.example                  # blank — no server-side keys
├── .gitignore
├── public/
│   └── favicon.ico
└── src/
    ├── app/
    │   ├── layout.tsx
    │   ├── page.tsx              # 3-column shell only; no logic
    │   ├── globals.css           # tokens + tailwind base
    │   └── api/
    │       ├── transcribe/route.ts   # POST audio chunk → text
    │       ├── suggest/route.ts      # POST recent transcript → 3 suggestions
    │       └── chat/route.ts         # POST messages → SSE stream
    ├── components/
    │   ├── columns/
    │   │   ├── TranscriptColumn.tsx
    │   │   ├── SuggestionsColumn.tsx
    │   │   └── ChatColumn.tsx
    │   ├── transcript/{MicButton,TranscriptList,TranscriptLine}.tsx
    │   ├── suggestions/{SuggestionBatch,SuggestionCard,ReloadButton,AutoRefreshTimer}.tsx
    │   ├── chat/{ChatMessages,ChatMessage,ChatInput}.tsx
    │   ├── settings/{SettingsModal,ApiKeyField,PromptEditor,NumberField}.tsx
    │   ├── header/{Header,ExportButton,SettingsButton}.tsx
    │   └── ui/{Button,Card,Modal,Spinner,Pill}.tsx
    ├── hooks/
    │   ├── useRecorder.ts            # owns MediaRecorder lifecycle
    │   ├── useTranscriptionLoop.ts   # consumes chunks → /api/transcribe
    │   ├── useSuggestionLoop.ts      # 30s timer + manual reload → /api/suggest
    │   └── useChat.ts                # SSE streaming + suggestion-click handler
    ├── lib/
    │   ├── audio/
    │   │   ├── recorder.ts           # RollingRecorder class
    │   │   └── mime.ts               # picks supported mime type
    │   ├── groq/
    │   │   ├── client.ts             # makeGroq(apiKey) factory
    │   │   ├── transcribe.ts         # whisper-large-v3
    │   │   ├── suggest.ts            # gpt-oss-120b, JSON mode
    │   │   └── chat.ts               # gpt-oss-120b, streaming
    │   ├── prompts/
    │   │   ├── defaults.ts           # exported DEFAULT_PROMPTS, DEFAULT_SETTINGS
    │   │   ├── assemble.ts           # pure functions: buildSuggestPrompt(...)
    │   │   └── schemas.ts            # Zod schemas for suggestion JSON
    │   ├── store/
    │   │   ├── session.ts            # transcript, batches, chat, recording state
    │   │   └── settings.ts           # apiKey, prompts, windows (persisted)
    │   ├── export/
    │   │   └── session.ts            # serializeSession() → { json, text }
    │   ├── sse/
    │   │   ├── server.ts             # sseEncode(), sseStream()
    │   │   └── client.ts             # readSSE(response) async iterator
    │   ├── ids.ts                    # short ulid-ish ids
    │   ├── time.ts                   # formatClock, nowMs
    │   └── types.ts                  # shared types (single source)
    └── styles/
        └── tokens.css                # color, radius, spacing variables
```

If you need a file outside this layout, justify it in the PR description.

---

## 4. Core Invariants

These must always be true. Violating any is a bug, not a tradeoff.

1. **API key never leaves the client by any path other than the `x-groq-key` request header.** It is never logged, never persisted server-side, never written to telemetry, never echoed in error responses.
2. **No transcript / chat / suggestion data is persisted across reloads.** Only the `settings` store touches `localStorage`.
3. **Each suggestion batch contains exactly 3 items**, each a valid `Suggestion` (zod-validated). If the model returns 2 or 4, retry once, then surface a typed error in that batch — do not silently coerce.
4. **New batches prepend to the top.** Older batches stay visible, faded to ~60% opacity.
5. **No two consecutive batches contain duplicate previews.** The suggest prompt must receive prior previews and instruct against repetition (semantic duplicates count).
6. **Transcript chunks are timestamped at chunk-start (recorder time)**, not server time. Display in `HH:MM:SS AM/PM` matching the mockup.
7. **The chat is one continuous thread per page session.** Suggestion clicks and typed messages share the same thread, in order.
8. **Suggestion click → user message in chat with the preview text → assistant streams the expanded answer.** Optimistically render the user message before the network call resolves.
9. **The reload button updates suggestions immediately** using the latest transcript window — it does NOT wait for the next auto-refresh tick, and it resets the auto-refresh countdown.
10. **Settings changes take effect on the next request without a reload.** No app-restart prompts.
11. **Type variety + conditional `answer` gating.** No batch may contain 3 suggestions of the same `type`. The `answer` type is **conditionally gated**: it may only appear when the route detects a live `open_question` topic-graph node (uncovered, `lastMentionedAtMs` within the last 90 s) and renders it in an `OPEN_QUESTIONS` prompt block. When the block is absent the closing reminder explicitly forbids `answer`. See §10.1 + §10.4.
12. **Expansions use the FULL transcript when it fits.** When the live transcript length is ≤ `settings.expandContextChars`, the `/api/chat` route in `expand` mode passes the entire transcript to the assembler. Only when the transcript exceeds that ceiling is it tail-sliced. See §7.3.

---

## 5. Coding Standards

- **TypeScript strict**, `noUncheckedIndexedAccess: true`. No `any`, no `as` casts except at IO boundaries with a Zod parse on the same line.
- **Named exports only.** No `export default` except for Next.js page/route/layout files where the framework requires it.
- **Pure where possible.** `lib/prompts/assemble.ts`, `lib/export/session.ts`, `lib/sse/*`, `lib/audio/mime.ts`, `lib/time.ts`, `lib/ids.ts` must contain pure functions only — no IO, no globals.
- **Hooks own behavior, components are dumb.** Components receive props + render. All side effects live in hooks. All cross-component state lives in Zustand.
- **No prop drilling past 1 level.** Use store selectors.
- **Errors are typed.** Define a `TwinMindError` discriminated union: `{ kind: 'no_api_key' | 'groq_unauthorized' | 'groq_rate_limit' | 'groq_server' | 'invalid_json' | 'mic_denied' | 'mic_unavailable' | 'network' | 'unknown'; message: string; cause?: unknown }`. API routes return `{ error: TwinMindError }` with appropriate status codes. UI maps `kind` → friendly copy.
- **Imports:** absolute via `@/...`. Order: stdlib → external → `@/lib` → `@/components` → `@/hooks` → relative.
- **No comments that restate code.** Comments explain *why*, not *what*. JSDoc public lib functions.
- **No dead code.** No commented-out blocks. No `console.log` in committed code (use a tiny `debug(ns, ...args)` helper that no-ops in prod).
- **File length:** keep components ≤ 150 lines, hooks ≤ 200, lib modules ≤ 250. Refactor before exceeding.
- **Naming:** components PascalCase, hooks `useXxx`, stores `useXxxStore`, types PascalCase, zod schemas `XxxSchema`, pure functions camelCase verbs.

---

## 6. Design Patterns We Use

- **Adapter at the IO edge:** `lib/groq/*` is the only place that talks to Groq. Higher layers depend on the function signatures, never the SDK.
- **Pure assemblers + impure callers:** prompt assembly is pure (`buildSuggestPrompt(transcript, prevBatches, settings) → Messages[]`). The API route is the only impure caller. Assemblers trust whatever string the caller passes — windowing decisions live in the route.
- **Result-style returns at boundaries:** API routes and hooks return discriminated unions, never throw across module boundaries. Throw inside a function → catch at the boundary → convert to `TwinMindError`.
- **Stores expose actions, not setters:** components call `appendChunk(text, ts)`, never `set({ chunks: ... })`.
- **Selectors with shallow equality:** `useSessionStore(s => s.batches, shallow)` to prevent over-rendering.
- **Single SSE stream contract:** server emits `event: token` / `event: done` / `event: error`. Client iterator yields typed events.
- **Optimistic UI for chat:** user message is appended synchronously; assistant message is appended empty and grown token-by-token.
- **Backpressure on transcription:** if a transcribe request is in flight when the next chunk arrives, queue it. Never fire two in parallel for the same recorder — they'll race and order will scramble.
- **Idempotent suggestion refresh:** if a refresh starts while one is in flight, cancel the in-flight via `AbortController` and start the new one. Always reset countdown on completion.

---

## 7. API Contracts

All requests carry the user's key in `x-groq-key`. Routes 401 if missing. Routes never read or write any other secret.

### 7.1 `POST /api/transcribe` — runtime: `nodejs`

- Body: `multipart/form-data` with `audio` (Blob, webm/opus or mp4) and `mime` (string).
- Behavior: forwards to Groq `whisper-large-v3` with `response_format: 'verbose_json'`, `temperature: 0`, language autodetect.
- Response 200: `{ text: string, durationMs: number, language: string }`.
- Response 4xx/5xx: `{ error: TwinMindError }`. Map Groq 401 → `groq_unauthorized`, 429 → `groq_rate_limit`.

### 7.2 `POST /api/suggest` — runtime: `edge`

- Body (Zod-validated):
  ```ts
  {
    transcriptWindow: string,   // last N chars of transcript, prepared client-side
    previousPreviews: string[], // last 6 previews, to avoid repetition
    suggestPrompt: string,      // from settings
    contextChars: number        // for telemetry only; window is already sliced
  }
  ```
- Behavior: calls `gpt-oss-120b` with `response_format: { type: 'json_object' }`, `temperature: 0.4`, `max_tokens: 600`. Parses `{ suggestions: Suggestion[] }` with Zod. Retries once on parse failure with a stricter system reminder. Hard fail after second attempt.
- Response 200: `{ suggestions: [Suggestion, Suggestion, Suggestion], generatedAt: number, latencyMs: number }`.
- `Suggestion = { id: string; type: 'summary' | 'follow_up_question' | 'tangential_discussion' | 'answer'; preview: string }`. The `answer` variant is **conditionally gated** — see §10.4.

### 7.3 `POST /api/chat` — runtime: `edge`, response: `text/event-stream`

- Body (Zod-validated):
  ```ts
  {
    mode: 'expand' | 'chat',
    suggestion?: Suggestion,    // required when mode === 'expand'
    transcript: string,         // FULL current transcript text; route decides whether to slice
    history: ChatMessage[],     // full session chat
    userText?: string,          // required when mode === 'chat'
    expandPrompt: string,       // from settings
    chatPrompt: string,         // from settings
    expandContextChars: number, // ceiling above which to tail-slice for `expand`
    chatContextChars: number    // ceiling above which to tail-slice for `chat`
  }
  ```
- **Windowing rule (mandatory):**
  - When `mode === 'expand'`: if `transcript.length <= expandContextChars`, pass the FULL transcript string to `buildExpandMessages`. Only when `transcript.length > expandContextChars` should the route call `sliceTail(transcript, expandContextChars)` first. Rationale: expansion answers benefit from earlier context (decisions, named entities, prior arguments) that a tail-only window would lose.
  - When `mode === 'chat'`: same rule using `chatContextChars`.
- Behavior: assembles the right system+user messages (see §10), streams Groq response, emits SSE:
  - `event: token\ndata: {"t":"..."}\n\n`
  - `event: done\ndata: {"latencyMs":1234,"firstTokenMs":450}\n\n`
  - On error: `event: error\ndata: {"error":{...TwinMindError}}\n\n` then close.

---

## 8. State Model

### 8.1 `useSessionStore` (volatile, never persisted)

```ts
type RecordingState = 'idle' | 'recording' | 'starting' | 'stopping' | 'error';

interface SessionState {
  recording: RecordingState;
  micError?: TwinMindError;

  chunks: TranscriptChunk[];          // { id, text, startedAtMs, durationMs }
  pendingChunkIds: Set<string>;       // chunks queued or in-flight to /transcribe

  batches: SuggestionBatch[];         // newest first; { id, suggestions, generatedAt }
  suggestionsLoading: boolean;
  suggestionsError?: TwinMindError;
  nextRefreshAtMs: number;            // for the countdown

  chat: ChatMessage[];                // { id, role: 'user'|'assistant', text, createdAt, streaming?: boolean, sourceSuggestionId?: string }
  chatStreaming: boolean;

  // actions
  startRecording(): Promise<void>;
  stopRecording(): void;
  appendChunk(c: TranscriptChunk): void;
  prependBatch(b: SuggestionBatch): void;
  setSuggestionsLoading(b: boolean): void;
  pushUserMessage(text: string, sourceSuggestionId?: string): string; // returns id
  startAssistantMessage(): string;     // returns id
  appendAssistantToken(id: string, t: string): void;
  finalizeAssistantMessage(id: string): void;
  resetAll(): void;                    // wipes everything except settings
}
```

### 8.2 `useSettingsStore` (persisted to `localStorage` under key `twinmind.settings.v1`)

```ts
interface SettingsState {
  apiKey: string;                    // user-pasted; required for any network call
  suggestPrompt: string;             // editable; defaults from prompts/defaults.ts
  expandPrompt: string;
  chatPrompt: string;
  suggestContextChars: number;       // default 4000
  expandContextChars: number;        // default 12000 (full window when small)
  chatContextChars: number;          // default 8000
  chunkSeconds: number;              // default 30
  refreshSeconds: number;            // default 30
  // actions: setApiKey, setPrompt(kind, str), setNumber(kind, n), resetDefaults
}
```

The settings modal must show: API key field (password input, with show/hide toggle), three prompt textareas (rows=10, monospace), three number inputs for context windows, two number inputs for chunk/refresh seconds, a "Reset to defaults" button, and a "Done" button. **The modal is reachable from a gear icon in the header.** A red dot appears on the gear icon when `apiKey === ''`.

---

## 9. Audio Pipeline Spec

Use a `RollingRecorder` class in `lib/audio/recorder.ts`:

- Picks mime via `pickMime()`: prefers `audio/webm;codecs=opus`, falls back to `audio/mp4` (Safari), then `audio/webm`. If none supported, throw `mic_unavailable`.
- On `start()`: `getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } })`, create `MediaRecorder`, `start()` (no timeslice — we drive chunking ourselves).
- Internal `setInterval` of `chunkSeconds * 1000`. On each tick:
  1. Capture `startedAtMs` of the chunk that is about to close.
  2. Call `mediaRecorder.stop()` — `ondataavailable` fires with the full blob, then `onstop`.
  3. In `onstop`, immediately create a new `MediaRecorder` from the same stream and `start()` it. This produces self-contained, decodable chunks with sub-50ms gaps.
  4. Emit a `chunk` event `{ blob, mime, startedAtMs, durationMs }` to the consumer (`useRecorder`).
- On `stop()`: stop interval, stop current recorder, stop all stream tracks, emit final chunk.
- Errors: dispatch a `mic_denied` if `getUserMedia` rejects with `NotAllowedError`, else `mic_unavailable`.

`useTranscriptionLoop` consumes chunks via a queue (`Array<Chunk>` + a single `inFlight` flag). For each chunk: POST to `/api/transcribe`, append result to session store on success, mark a typed error on the chunk's slot on failure. Never drop chunks silently — show a tiny inline retry on the failed line.

---

## 10. Prompt Engineering — defaults you must ship

These defaults live in `src/lib/prompts/defaults.ts` and are the *bar* for quality. Editable from settings; `Reset to defaults` restores these strings verbatim.

### 10.1 `DEFAULT_SUGGEST_PROMPT`

```
You are a real-time meeting copilot riding inside the user's mic. Every ~20–30 seconds you receive the most recent transcript window, a small KNOWLEDGE_GRAPH of topics raised so far, and (when present) an OPEN_QUESTIONS block listing live unanswered questions in the room. Your job is to surface EXACTLY 3 fresh suggestions that feel like the user's own next thought.

Each suggestion has a TYPE and a PREVIEW. The PREVIEW must deliver value standalone — a user who reads only the preview should already learn it or know what to say.

ALLOWED TYPES (a labeling vocabulary, NOT a recipe — pick the label that most honestly describes what each item is):
• summary               — a tight 1–2 line recap of what just happened, including any verdict on a verifiable claim. Use when the conversation has produced a checkpoint worth re-grounding on.
• follow_up_question    — the single sharpest next question that builds on what was just said. No generic "could you elaborate".
• tangential_discussion — an adjacent thread that hasn't been pulled on yet but is about to feel natural — name what to bring up and why.
• answer                — a direct answer to a fresh, unanswered question. Lead with the answer itself. ONLY use when OPEN_QUESTIONS contains a live question — otherwise this type is forbidden.

HOW TO THINK (the only "rule" that matters):
Read RECENT_TRANSCRIPT, KNOWLEDGE_GRAPH, and OPEN_QUESTIONS. Ask: if I were the user wearing this mic right now, what would I most want surfaced in the next 15 seconds?

If OPEN_QUESTIONS has a fresh question and you know a useful answer, that's almost always one of the 3 cards.

VARIETY:
- Aim for a varied mix of types in each batch. Never produce 3 of the same type.

ANTI-REPETITION:
- Never repeat or near-duplicate any preview from PREVIOUS_PREVIEWS. Semantic duplicates count: "ask about latency" and "what's the p99?" are duplicates.

PREVIEW RULES:
- ≤ 140 characters.
- Written as a tappable card label, not a paragraph. No "You could…", "Maybe…", "Consider…" preamble — lead with the substance.
- For summary: lead with the most recent decision/claim/action. Verdict on a fact-check must be in the same line.
- For follow_up_question: just the question, no preamble.
- For tangential_discussion: format "Next: <thread to raise> — because <speaker just said X>".
- For answer: lead with the answer. Format "<answer in one sentence> — re: <question>".

OUTPUT — strict JSON, no prose, no markdown fences:
{ "suggestions": [ { "type": "...", "preview": "..." }, { ... }, { ... } ] }

Exactly 3 items.
```

### 10.2 `DEFAULT_EXPAND_PROMPT` (per-type-aware)

```
You are answering a request from a real-time meeting copilot. The user clicked a suggestion card during a live conversation; below is the full recent transcript and the suggestion they tapped. Produce a focused, useful, conversational answer they can read or paraphrase in 15 seconds.

LENGTH: 90–180 words. No headers. No bullet lists unless 3+ parallel items genuinely exist.
TONE: direct, expert, no hedging filler. Write like a sharp colleague whispering in their ear.

CONTENT BY SUGGESTION TYPE:
- summary               → a 5–8 bullet recap structured as: decisions taken, open threads, action items / owners, named entities. If the preview included a fact-check verdict, expand the verdict in 1–2 lines under "verified facts".
- follow_up_question    → why this question matters now, the 1–2 most likely answers and what each implies, the natural follow-up.
- tangential_discussion → why this is the natural next thread (parse the "because …" clause from the preview if present), the 1–2 most useful things to bring up first, one sentence on what to be ready to hear in response.
- answer                → the answer, then the 1-line reasoning, then a caveat if any.

If the transcript is thin, lean on general expertise but stay specific. Never invent statistics with false precision; if uncertain, say "around" or give a range.
```

### 10.3 `DEFAULT_CHAT_PROMPT`

```
You are the user's private meeting copilot. They are in a live conversation; the recent transcript is provided as context. Answer their question directly using the transcript when relevant, and your general expertise otherwise.

STYLE: 60–200 words depending on question depth. No headers, no fluff, no "Great question!". Lead with the answer. Add reasoning only if it sharpens the answer. Use a list only when listing parallel items.

If the question references "they / the speaker / what was just said", resolve it from the transcript. If the transcript does not contain the referent, say so in one line and answer generally.

Never claim certainty about facts that depend on data you do not have. Prefer ranges and named caveats to false precision.
```

### 10.4 Prompt assembly rules (in `lib/prompts/assemble.ts`, pure)

- `buildSuggestMessages({ transcriptWindow, previousPreviews, settings, topicGraph?, annotatedTranscript?, unansweredQuestions? })` returns:
  - `system`: `settings.suggestPrompt`
  - `user`: a structured block (sections joined by blank lines):
    ```
    PREVIOUS_PREVIEWS (avoid repeating, including semantic duplicates):
    - …

    KNOWLEDGE_GRAPH (topics raised so far in the call; "covered" means already explored or already suggested):
    - [entity] Whisper (covered: false)
    - [claim] p99 latency target is 200 ms (covered: true)

    OPEN_QUESTIONS (live unanswered questions in the room — an `answer` card here would be high-value):    ← only present when unansweredQuestions is non-empty
    - What's the lead time?

    RECENT_TRANSCRIPT (last ~{N} chars):
    """
    {transcriptWindow}
    """

    Now produce exactly 3 suggestions. Pick the 3 things that would feel most like the user's own next thought. Vary the types. Don't repeat anything in PREVIOUS_PREVIEWS. {ALLOW_ANSWER ? "If a question in OPEN_QUESTIONS is fresh and you have a useful answer, lead one card with that answer." : "No card may use the `answer` type — OPEN_QUESTIONS is empty."}
    ```
  - **Conditional `answer` gating (the deterministic signal that powers the 4th type):** the route — not the assembler — computes `unansweredQuestions` from the request's `topicGraph` by selecting nodes where `kind === 'open_question'`, `covered === false`, and `Date.now() - lastMentionedAtMs <= 90_000` (90 s recency window), then `.slice(-3)` and `.map(n => n.display)`. The route passes the array (or omits it when empty) to `buildSuggestMessages`. Empty/absent → no OPEN_QUESTIONS block + closing reminder forbids `answer`. Non-empty → block rendered + closing reminder unlocks `answer` and nudges the model to lead a card with it. **No extra LLM call** — the signal already lives in `topicGraph` from the per-chunk `/api/extract` pass.
- `buildExpandMessages({ suggestion, transcript, settings })`:
  - **Caller (the API route) is responsible for passing either the FULL transcript (when its length ≤ `settings.expandContextChars`) or the tail-sliced window (when it exceeds). Assembler trusts the input — it does not slice.**
  - `system`: `settings.expandPrompt`
  - `user`: `SUGGESTION_TYPE: {type}\nSUGGESTION_PREVIEW: {preview}\n\nTRANSCRIPT:\n"""\n{transcript}\n"""`
- `buildChatMessages({ history, userText, transcript, settings })`:
  - **Caller is responsible for sizing the transcript per `settings.chatContextChars` using the same full-when-small / tail-when-large rule.**
  - `system`: `settings.chatPrompt + "\n\nLIVE_TRANSCRIPT (most recent):\n\"\"\"\n" + transcript + "\n\"\"\""`
  - then the full prior `history` as alternating user/assistant
  - then the new user message

Window-sizing helpers (`sliceTail(text, chars)`, boundary-aware) live alongside the assemblers but the route — not the assembler — is the only impure caller that decides whether to slice.

---

## 11. Performance Targets

| Metric | Target | Hard ceiling |
|---|---|---|
| Reload click → 3 suggestions rendered | < 1.8 s p50 | 3.5 s p95 |
| Chat send → first token visible | < 700 ms p50 | 1.5 s p95 |
| Mic click → recording active | < 300 ms | 600 ms |
| Chunk recorded → transcript line visible | < 2 s after Groq returns | n/a |
| Bundle JS (main) | < 180 KB gzip | 240 KB |

Tactics: edge runtime for `/suggest` and `/chat`, no client-side LLM SDK, JSON-mode for suggest (saves a parse retry), `temperature: 0` for transcribe (deterministic) and `0.4` for suggest (some variety, low repetition), abort in-flight on user action, prefetch DNS for `api.groq.com` via `<link rel="preconnect">`.

---

## 12. Security & Privacy Posture

- API key only travels client → our route via `x-groq-key`. We pass it to the Groq SDK and discard. Never log request bodies.
- No analytics, no third-party scripts.
- CORS: same-origin only on the API routes. No public exposure.
- `next.config.ts` sets `Strict-Transport-Security`, `Referrer-Policy: no-referrer`, `Permissions-Policy: microphone=(self)`, `X-Content-Type-Options: nosniff`.
- The settings modal warns: "Your key is stored in this browser only. Clear settings to remove it."

---

## 13. Export

A header button "Export". Clicking opens a small popover with two buttons: "Download JSON" and "Download text". Both filenames: `twinmind-session-{YYYYMMDD-HHMMSS}.{json|txt}`.

JSON shape (single source of truth in `lib/export/session.ts`):

```ts
{
  exportedAt: string,            // ISO
  sessionStartedAt: string,      // ISO of first chunk or first chat msg
  transcript: { startedAt: string, durationMs: number, text: string }[],
  suggestionBatches: { generatedAt: string, suggestions: { type: string, preview: string }[] }[],
  chat: { role: 'user'|'assistant', createdAt: string, text: string, sourceSuggestionPreview?: string }[]
}
```

Text format: chronologically interleaved, every block prefixed with `[HH:MM:SS]` and a label (`TRANSCRIPT`, `SUGGESTIONS BATCH`, `USER`, `ASSISTANT`).

---

## 14. Definition of Done (per feature)

A feature is done only when:
1. All invariants in §4 hold for it.
2. Types compile under `strict` with no `any` and no `@ts-expect-error`.
3. Errors are typed and surfaced to the UI (no silent failures, no raw error strings).
4. The relevant default prompt / setting is documented in `defaults.ts` and exposed in the settings modal.
5. There is at least one happy-path manual test you can run locally and one error path (no key, bad key, mic denied).
6. README has a one-paragraph entry for the feature if it changes user-visible behavior.

---

## 15. Deployment

Target: **Vercel**. Project root is the repo root.
- No environment variables required at deploy time. `.env.example` ships empty with comments.
- `vercel.json` is unnecessary; Next.js conventions are sufficient.
- Build: `pnpm build`. Install: `pnpm install --frozen-lockfile`. Output: standalone Next.
- After deploy, the README must include the live URL and a 60-second test script.

---

## 16. README requirements

Sections, in order:
1. **What it is** (3 sentences + the live URL).
2. **Quickstart** — clone → pnpm i → pnpm dev → paste Groq key in settings → click mic.
3. **How it works** — one diagram (ascii) of the audio + suggestions + chat pipeline.
4. **Prompts** — show defaults verbatim and explain the rationale per type.
5. **Architecture decisions** — 5–8 bullets covering why Next 14, why Edge for suggest/chat, why MediaRecorder rolling, why Zustand, why JSON-mode, why no DB.
6. **What I would do next with more time** — honest list of 5–8 items.
7. **Trade-offs** — be specific. **MUST include a sub-section titled "Comparison vs. TwinMind's live suggestions"** with these bullets, written in the author's voice with a one-sentence justification each:
   - We surface exactly 3 typed suggestions per batch (summary / follow_up_question / tangential_discussion / answer — the last gated on live unanswered questions); TwinMind's live feature ships 1–2 generic question-asker cards.
   - We stack batches chronologically with timestamps and fade older ones; TwinMind replaces.
   - We deterministically gate the `answer` type on a 90 s-recency `topicGraph` signal (uncovered `kind === 'open_question'` nodes); when the signal is empty, the closing reminder forbids `answer`. TwinMind has no equivalent.
   - Our card UI exposes the suggestion TYPE via a colored pill so the user knows what they're tapping; TwinMind uses decorative icons without semantic meaning.
   - Our expand answers are 90–180 words, lead with the answer, no headers; TwinMind's are 15+ line strategic briefings.
   - We pass the previous 6 previews into the suggest prompt with explicit anti-duplication instruction (semantic duplicates included); TwinMind appears to repeat itself across refreshes.
   - For expansions, we pass the full transcript when ≤ expandContextChars and tail-slice only when it exceeds; this preserves early decisions and named entities that a small tail window would lose.
8. **License** (Apache-2.0 from existing LICENSE).