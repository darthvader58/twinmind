# TwinMind — Live Suggestions Feature

## What it is

TwinMind-Live is a single-page web app that listens to your microphone, streams a rolling transcript, and surfaces three fresh, context-aware suggestions every ~30 seconds while you talk. Tap any suggestion to open a detailed, streamed answer in a continuous chat thread that shares the same session context. Everything runs on **Groq** (Whisper Large V3 for speech, GPT-OSS 120B for suggestions and chat); no server-side keys, no database, no auth — paste your own key in Settings and go.

Live demo: https://twinmind-phi.vercel.app

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

Every prompt is editable from the in-app Settings modal.

### Suggestions prompt (default)

```
You are a real-time meeting copilot riding inside the user's mic. Every ~20–30 seconds you receive the most recent transcript window, a small KNOWLEDGE_GRAPH of topics raised so far, and (when present) an OPEN_QUESTIONS block listing live unanswered questions in the room. Your job is to surface EXACTLY 3 fresh suggestions that feel like the user's own next thought.

Each suggestion has a TYPE and a PREVIEW. The PREVIEW must deliver value standalone — a user who reads only the preview should already learn it or know what to say.

ALLOWED TYPES (a labeling vocabulary, NOT a recipe — pick the label that most honestly describes what each item is):
• summary               — a tight 1–2 line recap of what just happened, including any verdict on a verifiable claim. Use when the conversation has produced a checkpoint worth re-grounding on.
• follow_up_question    — the single sharpest next question that builds on what was just said. No generic "could you elaborate".
• tangential_discussion — an adjacent thread that hasn't been pulled on yet but is about to feel natural — name what to bring up and why.
• answer                — a direct answer to a fresh, unanswered question. Lead with the answer itself. ONLY use when OPEN_QUESTIONS contains a live question — otherwise this type is forbidden.

HOW TO THINK (the only "rule" that matters):
Read RECENT_TRANSCRIPT, KNOWLEDGE_GRAPH, and OPEN_QUESTIONS. Ask: if I were the user wearing this mic right now, what would I most want surfaced in the next 15 seconds? It might be:
  - a tight recap of what just happened so I can re-ground after zoning out,
  - the sharpest next question that builds on what was just said,
  - the adjacent thread I haven't pulled on yet but am about to bring up,
  - the answer to a live unanswered question that's still hanging in the air.

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
```

**Why this shape.** Talking points and clarifications were the v1 weak spots — in a sales call or office meeting they read as filler, not signal. The v2 taxonomy (summary / follow_up_question / tangential_discussion / answer) maps directly to the four things the wearer of the mic actually wants surfaced: *re-ground me*, *sharpen the next question*, *give me the next thread*, *answer the question still hanging in the air*. Fact-checking was folded into `summary` so a verdict on a verifiable claim ships in the same beat instead of fragmenting into a separate card. The `answer` type is **conditionally unlocked**: the route inspects the in-memory `topicGraph` for `kind === 'open_question'` nodes that are uncovered and within a 90 s recency window, renders them as an `OPEN_QUESTIONS` block, and swaps the closing reminder so the model knows whether `answer` is allowed. No extra LLM call; the signal already lives in memory from the per-chunk extract pass. `previousPreviews` go in via the user message with an explicit "semantic duplicates count" clause so near-paraphrases don't ship across refreshes.

### Expand prompt (default — used when a suggestion is tapped)

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

1. **Retry queue for failed transcribe chunks** — today a failed chunk shows an inline error; a background retry with exponential backoff would survive transient Groq blips invisibly.
2. **Lightweight telemetry sampling** — opt-in client-side timings for first-token, suggestion latency, and parse-failure rate, surfaced in a `/diagnostics` panel.
3. **Playwright e2e** — drive the full pipeline with a fake `MediaRecorder` and a recorded Groq response set to lock in regressions across the audio→suggest→chat path.
4. **Multi-user rooms** — co-listening with shared transcript and per-user suggestions, behind a real auth layer.
5. **Persistent sessions behind auth** — for users who want to revisit yesterday's call, not just the current page session.

## Trade-offs

- **Single in-flight transcribe request.** Preserves chunk order trivially but means a slow Whisper response stalls the queue. With 30 s chunks this is fine; if we shrink chunks to 5–10 s we'd need a chunk-id-keyed parallel pipeline with reorder buffer.
- **`previousPreviews` is the only de-dupe signal.** We don't embed and compare; a fresh model with high enough temperature could still produce semantic near-duplicates. Worth adding a cheap cosine check if it ever bites in practice.
- **One continuous chat thread per page session.** Simple and matches the brief, but means a reload wipes everything (no "resume"). Intentional for the MVP; would change with persistence.
- **Edge runtime can't use the full Groq SDK ergonomics in some cases.** We use `fetch` semantics that work in both and avoid Node-only APIs. Net: portable, but slightly more verbose than a Node-only implementation would be.
- **Settings live in `localStorage` (including the API key).** Pasting a key in a public browser is a footgun; we warn but can't prevent. A short-lived in-memory mode (key not persisted across reloads) is a nice optional hardening for shared machines.
- **Auto-refresh fires only while `recording === 'recording'`.** Manual reload works any time the user wants new suggestions on the existing transcript; the auto-loop is intentionally tied to live capture so you don't burn quota when paused.

### Comparison vs. TwinMind's live suggestions

- We surface exactly 3 typed suggestions per batch (summary / follow_up_question / tangential_discussion / answer — the last gated on live unanswered questions); TwinMind's live feature ships 1–2 generic question-asker cards. The four labels map to the four things a sales-call or office-meeting wearer actually wants surfaced: re-ground after zoning out, sharpen the next question, get the next thread, answer the question still hanging in the air.
- We stack batches chronologically with timestamps and fade older ones; TwinMind replaces. Stacking lets you scroll back to a suggestion you saw 90 seconds ago without losing the new ones — replacement throws away signal you might have wanted.
- We deterministically gate the `answer` type on a 90 s-recency `topicGraph` signal: an `answer` card only ships when there's a live `kind === 'open_question'` node that is uncovered. The route renders matching questions in an OPEN_QUESTIONS prompt block; when empty, the closing reminder forbids `answer` entirely. TwinMind has no equivalent — it surfaces "answer-shaped" cards regardless of whether there's anything to answer, which produces hallucinated answers to questions nobody asked.
- Our card UI exposes the suggestion TYPE via a colored pill so the user knows what they're tapping; TwinMind uses decorative icons without semantic meaning. The pill is the contract — a green `answer` card tells you exactly what to expect when you tap, so you can pick the right one mid-conversation in under a second.
- Our expand answers are 90–180 words, lead with the answer, no headers; TwinMind's are 15+ line strategic briefings. A meeting copilot is competing with the speaker for your attention — anything you can't whisper-read in 15 seconds is the wrong shape.
- We pass the previous 6 previews into the suggest prompt with explicit anti-duplication instruction (semantic duplicates included); TwinMind appears to repeat itself across refreshes. Negative exemplars beat abstract "don't repeat" instructions at temperature 0.4, and the semantic-duplicate clause stops `"ask about latency"` and `"what's the p99?"` from both shipping in the same session.
- For expansions, we pass the full transcript when ≤ expandContextChars and tail-slice only when it exceeds; this preserves early decisions and named entities that a small tail window would lose. Most live conversations stay under 12k chars for a long time, so the cheapest possible win is to just send the whole thing and let the model see who said what at the start.

## License

Apache-2.0 — see [LICENSE](./LICENSE).

Made with <3 by <a href="https://github.com/darthvader58" target="_blank">Shashwat Raj</a>. 
