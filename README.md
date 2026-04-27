# TwinMind — Live Suggestions

## What it is

TwinMind is a single-page web app that listens to your microphone, streams a rolling transcript, and surfaces three fresh, context-aware suggestions every ~30 seconds while you talk. Tap any suggestion to open a detailed, streamed answer in a continuous chat thread that shares the same session context. Everything runs on **Groq** (Whisper Large V3 for speech, GPT-OSS 120B for suggestions and chat); no server-side keys, no database, no auth — paste your own key in Settings and go.

Live demo: <to be filled in after `vercel --prod`>

## Quickstart

```bash
git clone <this-repo> twinmind
cd twinmind
pnpm install
pnpm dev
# open http://localhost:3000
# click the gear, paste your Groq API key
# click the mic and start talking
```

No environment variables are needed. Your key is stored only in your browser's `localStorage` under `twinmind.settings.v1`. To wipe it, open Settings and click "Reset to defaults" (or clear site data).

## How it works

```
                        ┌─────────────────────────────────────────┐
                        │              Browser tab                │
                        │                                         │
   ┌─────────┐  start   │  ┌──────────────────┐                   │
   │   Mic   │──────────┼─▶│ RollingRecorder  │                   │
   └─────────┘          │  │ (30s chunks via  │                   │
                        │  │  stop→start mr)  │                   │
                        │  └────────┬─────────┘                   │
                        │           │ Blob (webm/mp4)             │
                        │           ▼                             │
                        │  ┌──────────────────┐  POST multipart   │
                        │  │ useTranscription │──────────────────────────┐
                        │  │ Loop (1 in-flight│                   │      │
                        │  │  at a time)      │                   │      ▼
                        │  └────────┬─────────┘                   │   /api/transcribe
                        │           │ TranscriptChunk             │   (nodejs)  → Groq
                        │           ▼                             │   Whisper Large V3
                        │  ┌──────────────────┐                   │      │
                        │  │  Session store   │◀─────── text ─────┼──────┘
                        │  │   (Zustand)      │                   │
                        │  └────┬────────┬────┘                   │
                        │       │        │                        │
                        │  every 30s   on click /                 │
                        │       │       on send                   │
                        │       ▼        ▼                        │
                        │  ┌─────────┐ ┌──────────┐               │
                        │  │/api/    │ │/api/chat │               │
                        │  │suggest  │ │ (SSE)    │               │
                        │  │(edge)   │ │ (edge)   │               │
                        │  └────┬────┘ └────┬─────┘               │
                        │       │           │                     │
                        │       ▼           ▼                     │
                        │  3 Suggestions  Streamed answer         │
                        │  prepended      token-by-token          │
                        │                                         │
                        └─────────────────────────────────────────┘
                                        Groq GPT-OSS 120B
                                  (JSON mode for /suggest, stream for /chat)
```

The transcript window passed to `/suggest` is the last `suggestContextChars` (default 4000) of joined chunk text. The previous **two** batches' previews are sent as `previousPreviews` so the model knows what it just said and can avoid duplicates.

## Prompts

These are the defaults you ship. Every prompt is editable from the in-app Settings modal; "Reset to defaults" restores these strings verbatim.

### Suggestions prompt (default)

```
You are a real-time meeting copilot embedded in the user's mic. Every ~30 seconds you receive the most recent transcript window and your job is to surface EXACTLY 3 high-leverage suggestions that help the user contribute, fact-check, or move the conversation forward in the next 30 seconds.

Each suggestion has a TYPE and a PREVIEW. The PREVIEW must deliver value standalone — a user who reads only the preview should already learn or know what to say.

ALLOWED TYPES (pick the right MIX based on what is happening RIGHT NOW):
• question_to_ask  — a sharp, specific question the user should ask next. Avoid generic ("could you elaborate?"). Reference concrete details from the transcript.
• talking_point    — a specific point the user should make, ideally with a number, name, or example baked in.
• answer           — a direct, concrete answer to a question that was just asked in the transcript and is unanswered.
• fact_check       — a verifiable claim was just made; either confirm with a precise correction OR flag uncertainty with the actual figure if known. State the claim AND the verdict in one line.
• clarifying_info  — a term, person, framework, or number was used that needs unpacking; explain it tightly.

DECISION HEURISTICS (apply in order):
1. If a question was asked and is still unanswered in the window → at least one `answer`.
2. If a verifiable factual claim was made (numbers, dates, named events) → strongly consider `fact_check`.
3. If a non-obvious term/concept was used → consider `clarifying_info`.
4. If the conversation is exploratory or planning → bias toward `question_to_ask` + `talking_point`.
5. NEVER repeat or near-duplicate a preview from PREVIOUS_PREVIEWS.
6. NEVER pad with three of the same type unless the context truly demands it.

PREVIEW RULES:
- ≤ 140 characters.
- Specific. Use concrete nouns, numbers, named entities.
- Written as a tappable card label, not a paragraph. No "You could…" preamble.
- For fact_check: "Fact-check: <claim> — <verdict with the right number/fact>".
- For answer: lead with the answer itself.
- English unless the transcript is clearly in another language; then match.

OUTPUT — strict JSON, no prose, no markdown fences:
{ "suggestions": [ { "type": "...", "preview": "..." }, { ... }, { ... } ] }

Exactly 3 items. If the transcript is too short or empty, return 3 generic but still useful kickoff suggestions tailored to whatever the user has said so far.
```

**Why this shape.** The preview is the contract — it has to deliver value on its own because users will skim it during a live call. Five typed suggestions force the model to think about *why* each card exists rather than producing three generic "ask a clarifying question" cards. The decision heuristics are ordered by stakes (an unanswered question right now beats a clarification opportunity later). `previousPreviews` go in via the user message so the model has fresh evidence of what it already said and can avoid near-duplicates — a single bullet of "DO NOT repeat" without exemplars rarely works at temperature 0.4.

### Expand prompt (default — used when a suggestion is tapped)

```
You are answering a request from a real-time meeting copilot. The user clicked a suggestion card during a live conversation; below is the full recent transcript and the suggestion they tapped. Produce a focused, useful, conversational answer they can read or paraphrase in 15 seconds.

LENGTH: 90–180 words. No headers. No bullet lists unless 3+ parallel items genuinely exist.
TONE: direct, expert, no hedging filler. Write like a sharp colleague whispering in their ear.

CONTENT BY SUGGESTION TYPE:
- question_to_ask     → why this question matters now, the 1–2 most likely answers and what each implies, the natural follow-up.
- talking_point       → the point fleshed out with the strongest specific evidence (numbers, examples, names). One sentence on the counter-argument.
- answer              → the answer, then the 1-line reasoning, then a caveat if any.
- fact_check          → verdict (true / false / partly true), the correct figure with a brief source-class (e.g., "per the company's 2024 10-K"), and what changes if the original claim is wrong.
- clarifying_info     → tight definition, one concrete example, why it matters in this conversation.

If the transcript is thin, lean on general expertise but stay specific. Never invent statistics with false precision; if uncertain, say "around" or give a range.
```

**Why this shape.** A 15-second read is the actual UX target — long enough to be substantive, short enough to glance at during a meeting. Per-type structure means each expansion has a recognizable shape so the user can find what they need fast. The "no headers / no bullets unless 3+" rule prevents the model from shaping every answer into a wall of markdown, which destroys the whisper-in-your-ear feel.

### Chat prompt (default — used for typed follow-ups)

```
You are the user's private meeting copilot. They are in a live conversation; the recent transcript is provided as context. Answer their question directly using the transcript when relevant, and your general expertise otherwise.

STYLE: 60–200 words depending on question depth. No headers, no fluff, no "Great question!". Lead with the answer. Add reasoning only if it sharpens the answer. Use a list only when listing parallel items.

If the question references "they / the speaker / what was just said", resolve it from the transcript. If the transcript does not contain the referent, say so in one line and answer generally.

Never claim certainty about facts that depend on data you do not have. Prefer ranges and named caveats to false precision.
```

**Why this shape.** The chat prompt is deliberately *less* structured than expand because typed questions are open-ended. Resolving "they" / "what was just said" from the transcript is the highest-leverage instruction — that's the whole reason a meeting copilot is more useful than a tab in another window. The "lead with the answer" rule beats every model's default tendency to preamble.

## Architecture decisions

- **Next.js 14 App Router.** One repo, server routes for the Groq calls, edge runtime where it matters, easy Vercel deploy. No separate API server to operate.
- **Edge runtime for `/api/suggest` and `/api/chat`, Node for `/api/transcribe`.** Edge gives us the lowest TTFB for streaming. Transcription needs `multipart/form-data` and a Blob handed straight to the Groq SDK, so it stays on Node.
- **MediaRecorder rolling stop→start.** We chunk by stopping the current recorder and immediately creating a new one from the same `MediaStream`. This produces self-contained, decodable blobs (vs. timeslice, which yields fragments that can confuse Whisper). Sub-50 ms gaps in practice.
- **Zustand, no server-state library.** All state is local and ephemeral; TanStack Query buys nothing. Two stores: `useSessionStore` (volatile — never persisted), `useSettingsStore` (`localStorage`-persisted, key `twinmind.settings.v1`).
- **JSON mode for `/api/suggest`, with a Zod schema enforcing exactly 3 items.** One retry on parse failure with a stricter system note. Without JSON mode the model occasionally wraps output in fences or apologises; with it the failure mode is "bad JSON" which is easy to detect and retry.
- **No database, no auth, no analytics.** The whole point is "paste your key, talk, get value". Persistence is intentionally limited to settings.
- **API key flows only via `x-groq-key` header.** Never logged, never echoed in errors, never written to a server-side store. The settings modal warns the user the key lives in their browser only.
- **SSE over Web Streams (no third-party libs).** The server emits `event: token | done | error` as plain SSE; the client uses a 60-line async iterator (`readSSE`). No socket libraries, no overhead.

## What I would do next with more time

1. **VAD-based dynamic chunking** — chunk on natural speech pauses instead of a flat 30 s timer; gets transcript latency down without losing decode reliability.
2. **Whisper streaming** — Groq's verbose-JSON returns full chunks; if/when a true streaming endpoint ships, swap in for partial-line updates as someone is mid-sentence.
3. **Abort-mid-stream chat cancel UI** — currently chat streams to completion; a cancel button that aborts the SSE connection would be nice for off-topic answers.
4. **Retry queue for failed transcribe chunks** — today a failed chunk shows an inline error; a background retry with exponential backoff would survive transient Groq blips invisibly.
5. **Lightweight telemetry sampling** — opt-in client-side timings for first-token, suggestion latency, and parse-failure rate, surfaced in a `/diagnostics` panel.
6. **Playwright e2e** — drive the full pipeline with a fake `MediaRecorder` and a recorded Groq response set to lock in regressions across the audio→suggest→chat path.
7. **Multi-user rooms** — co-listening with shared transcript and per-user suggestions, behind a real auth layer.
8. **Persistent sessions behind auth** — for users who want to revisit yesterday's call, not just the current page session.

## Trade-offs

- **Single in-flight transcribe request.** Preserves chunk order trivially but means a slow Whisper response stalls the queue. With 30 s chunks this is fine; if we shrink chunks to 5–10 s we'd need a chunk-id-keyed parallel pipeline with reorder buffer.
- **`previousPreviews` is the only de-dupe signal.** We don't embed and compare; a fresh model with high enough temperature could still produce semantic near-duplicates. Worth adding a cheap cosine check if it ever bites in practice.
- **One continuous chat thread per page session.** Simple and matches the brief, but means a reload wipes everything (no "resume"). Intentional for the MVP; would change with persistence.
- **Edge runtime can't use the full Groq SDK ergonomics in some cases.** We use `fetch` semantics that work in both and avoid Node-only APIs. Net: portable, but slightly more verbose than a Node-only implementation would be.
- **Settings live in `localStorage` (including the API key).** Pasting a key in a public browser is a footgun; we warn but can't prevent. A short-lived in-memory mode (key not persisted across reloads) is a nice optional hardening for shared machines.
- **Auto-refresh fires only while `recording === 'recording'`.** Manual reload works any time the user wants new suggestions on the existing transcript; the auto-loop is intentionally tied to live capture so you don't burn quota when paused.

## License

Apache-2.0 — see [LICENSE](./LICENSE).
