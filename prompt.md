# prompt.md — Build TwinMind Live Suggestions, end-to-end, with subagents

> Paste this into a fresh Claude Code session at the repo root **after** placing `CLAUDE.md` next to it.
>
> **If the build is already complete and you are applying amendments to an existing repo, skip to §8 — Amendment runbook.** That section captures the three structural edits (hardened suggest prompt, full-transcript expansions, README comparison) that this file reflects.

---

## 0. Preflight (do this before spawning any subagent)

1. **Read `CLAUDE.md` in full.** It is the contract. If anything below contradicts it, `CLAUDE.md` wins — surface the contradiction in chat and stop.
2. Confirm the working directory contains `CLAUDE.md`, `LICENSE` (Apache-2.0), and `README.md`. If not, abort and tell me.
3. Check the toolchain: Node ≥ 20, `pnpm` available. If `pnpm` is missing, `corepack enable && corepack prepare pnpm@latest --activate`.
4. Reply with a one-paragraph plan that names the subagents you will spawn and the order, then proceed.

Do not ask me for clarifications about features that are specified in `CLAUDE.md`. Only ask if a requirement is genuinely missing or contradictory.

---

## 1. Mission summary (don't re-derive — this is the brief)

Build a Next.js 14 + TypeScript web app that:

- Listens to mic, chunks audio every 30s, transcribes via **Groq Whisper Large V3**, and appends timestamped lines to a left-column transcript that auto-scrolls.
- Every 30s (and on a manual "Reload suggestions" button) generates **exactly 3 fresh, mixed-type suggestions** via **Groq GPT-OSS 120B** in the middle column. New batches prepend; older batches stay visible faded. **Type variety is mandatory** — see CLAUDE.md §10.1 rules A–E.
- Each suggestion is a tappable card. Tapping it appends the preview as a user message to the right-column chat and streams a detailed answer back via SSE (using a separate, longer expand prompt, with **the FULL transcript when it fits within `expandContextChars`** — see CLAUDE.md §7.3). Users can also type questions directly. **One continuous chat per page session.**
- Has a settings modal where the user pastes their Groq API key (no key is hardcoded, ever) and can edit every prompt and context-window size. Defaults are hardcoded to the optimal values defined in `CLAUDE.md` §10.
- Has an export button that downloads the full session (transcript + every batch + chat history with timestamps) as JSON or plain text.
- Deploys cleanly to Vercel with no required environment variables.

UI is **fixed** by the reference mockup (3 columns, dark theme, the typography and density shown in the screenshot). Do not re-design.

The eval rubric, in priority order, is: **(1) suggestion quality, (2) detailed answer quality, (3) prompt engineering depth, (4) full-stack quality, (5) code quality, (6) latency, (7) overall feel.** Optimize accordingly when you make trade-offs.

---

## 2. Subagent decomposition

Spawn the following subagents using the Task tool. Each runs in its own context window and reports back with a file manifest + a short writeup. **You (the orchestrator) own the gates between phases — verify before proceeding.**

| # | Agent | Owns | Reads from CLAUDE.md |
|---|---|---|---|
| A1 | **scaffold-agent** | repo skeleton, configs, deps, `.env.example`, `next.config.ts`, Tailwind tokens, design tokens CSS, blank shells of `app/page.tsx` and the three column components | §2, §3, §12, §15 |
| A2 | **types-and-store-agent** | `src/lib/types.ts`, both Zustand stores, error type, ids/time helpers, default settings hydration | §4, §5, §8 |
| A3 | **prompts-agent** | `src/lib/prompts/defaults.ts`, `assemble.ts` (pure), `schemas.ts` (Zod), unit tests for assemblers | §10 (including the hard rules A–E in §10.1) |
| A4 | **api-agent** | three API routes, Groq adapter (`lib/groq/*`), SSE server helper, runtime config per route, error mapping, **the full-when-small / tail-when-large transcript rule for `/api/chat` per §7.3** | §7, §11, §12 |
| A5 | **audio-agent** | `lib/audio/recorder.ts` (RollingRecorder), `mime.ts`, `useRecorder`, `useTranscriptionLoop` hook, mic permissions UX | §9, §11 |
| A6 | **ui-agent** | every component under `src/components/**`, the 3-column page composition, settings modal, export popover, suggestion cards with type-colored pills, auto-refresh countdown, faded older batches, optimistic chat | §3 (component tree), §4, §13, mockup |
| A7 | **integration-and-deploy-agent** | wires `useSuggestionLoop` + `useChat`, sanity-tests the full loop, writes README per §16 (**including the "Comparison vs. TwinMind's live suggestions" sub-section**), prepares Vercel deploy, runs lint/typecheck/build | §11, §14, §15, §16 |

**Sequencing:**

- **Phase 1 (serial):** A1 only.
- **Phase 2 (parallel):** A2, A3 — neither touches the same files.
- **Phase 3 (parallel):** A4, A5, A6 — each owns disjoint paths. They depend on A2 + A3.
- **Phase 4 (serial):** A7 — depends on everything.

After each phase, run the gate in §4 before launching the next. If a gate fails, dispatch a focused fix-agent rather than re-running the whole phase.

---

## 3. Per-agent specs

For every agent, the prompt you give it must end with: *"Read `CLAUDE.md` in full first; it is binding. Do not deviate without surfacing the conflict. Output the final file manifest at the end."*

### A1 — scaffold-agent

Goal: a buildable, type-clean skeleton with exactly the layout in CLAUDE.md §3.

Deliverables:
- `package.json` with deps: `next@14`, `react@18`, `react-dom@18`, `typescript`, `zod`, `zustand`, `groq-sdk`, `clsx`, `tailwindcss`, `postcss`, `autoprefixer`. Dev: `vitest`, `@types/*`, `eslint`, `eslint-config-next`, `@vitest/ui`. Scripts: `dev`, `build`, `start`, `lint`, `typecheck` (`tsc --noEmit`), `test`.
- `tsconfig.json` with `strict`, `noUncheckedIndexedAccess`, `paths` for `@/*`.
- `tailwind.config.ts` reading CSS variables; dark mode `class` (always-on dark via root class).
- `src/styles/tokens.css` with the dark palette inferred from the mockup: deep navy bg `#0b1020`, panel border `#1f2a44`, panel inner border `#1c2740`, body text `#e6e8ef`, muted `#8a93a8`, accent blue `#7aa7ff` (question), violet `#b794ff` (talking), green `#7be0a4` (answer), amber `#ffcd6a` (fact-check), cyan `#7ad8e6` (clarify), focus ring `#5b8def`. Type-pill colors must match these.
- `src/app/globals.css` imports tokens + tailwind base/components/utilities. Sets `body { background: var(--bg); color: var(--fg); font-family: ui-sans-serif, system-ui, ...; }`.
- `src/app/layout.tsx` minimal HTML shell, dark class on `<html>`.
- `src/app/page.tsx`: a 3-column grid (`grid-cols-[1fr_1fr_1fr] gap-4 p-4 h-screen`). Each column wrapped in a `Card`. Inside each, a section header (uppercase tracking) + status pill on the right. Top header bar with title "TwinMind — Live Suggestions" on the left, gear and export buttons on the right. Match mockup spacing.
- Empty placeholder files for every component listed in CLAUDE.md §3 with `export const X = () => null;` so imports resolve.
- `.gitignore` (Node + Next defaults). `.env.example` empty with a comment "No env vars are required. Paste your Groq key in the in-app Settings."

Gate: `pnpm install`, `pnpm typecheck`, `pnpm build` all pass.

### A2 — types-and-store-agent

Deliverables:
- `src/lib/types.ts` — `TranscriptChunk`, `Suggestion`, `SuggestionType` (string union), `SuggestionBatch`, `ChatMessage`, `TwinMindError` (discriminated union per CLAUDE.md §5), `RecordingState`.
- `src/lib/ids.ts` — `newId(prefix?)` returning a 12-char base36 random + monotonic counter. Pure.
- `src/lib/time.ts` — `nowMs()`, `formatClock(ms)` matching `08:43:33 PM`.
- `src/lib/store/session.ts` — Zustand store with the shape and actions in CLAUDE.md §8.1. **Never persisted.** Use `subscribeWithSelector`. Implement `pendingChunkIds` as a `Set` wrapped immutably (`new Set([...prev, id])`).
- `src/lib/store/settings.ts` — Zustand `persist` middleware, key `twinmind.settings.v1`, version `1`, with the defaults imported from `lib/prompts/defaults.ts`. (If A3 has not yet exported defaults, stub the imports — A3 will fill in. Coordinate via the agreed export names.)
- Vitest tests in `src/lib/store/session.test.ts`: mounting `appendChunk` keeps order; `prependBatch` newest-first; `pushUserMessage`/`startAssistantMessage`/`appendAssistantToken`/`finalizeAssistantMessage` produce the expected sequence; `resetAll` wipes correctly.

Gate: `pnpm test --run` passes.

### A3 — prompts-agent

Deliverables:
- `src/lib/prompts/defaults.ts` — exports `DEFAULT_SUGGEST_PROMPT`, `DEFAULT_EXPAND_PROMPT`, `DEFAULT_CHAT_PROMPT` *verbatim* from CLAUDE.md §10.1–10.3, plus `DEFAULT_SETTINGS` (numbers per §8.2). **The suggest prompt must contain the HARD STRUCTURAL RULES (A–E), DECISION HEURISTICS, and ANTI-PATTERNS sections exactly as written in §10.1 — these are the highest-leverage strings in the build and the eval rubric weights them most heavily.**
- `src/lib/prompts/schemas.ts` — Zod schemas: `SuggestionTypeSchema`, `SuggestionSchema`, `SuggestionsResponseSchema` (object with `suggestions: [Suggestion, Suggestion, Suggestion]` — exactly 3, enforced via `.length(3)` refinement).
- `src/lib/prompts/assemble.ts` — pure functions per CLAUDE.md §10.4. Each returns `Array<{ role: 'system'|'user'|'assistant'; content: string }>`. Window slicing helpers `sliceTail(text, chars)` (boundary-aware: backs up to the nearest newline or sentence end so we don't cut mid-word). **Assemblers do NOT decide whether to slice — they trust the input string. The route is the only impure caller that decides.** The `buildSuggestMessages` user message must include the rule reminder per §10.4 (max 2 questions, answer-if-unanswered, fact-check-if-claim) so the rules survive JSON-mode formatting.
- Vitest tests in `src/lib/prompts/assemble.test.ts`: golden tests for each assembler — feed a small fixture, snapshot the message array. Include a test that the suggest user message contains the rule reminder text.

Gate: `pnpm test --run` passes.

### A4 — api-agent

Deliverables:
- `src/lib/groq/client.ts` — `makeGroq(apiKey: string): Groq` factory; throws typed `no_api_key` if blank.
- `src/lib/groq/transcribe.ts` — `transcribeChunk(client, file, mime)` → calls `audio.transcriptions.create({ model: 'whisper-large-v3', file, response_format: 'verbose_json', temperature: 0 })`. Returns `{ text, durationMs, language }`. Maps Groq errors via `mapGroqError`.
- `src/lib/groq/suggest.ts` — `generateSuggestions(client, messages)` → `chat.completions.create({ model: 'openai/gpt-oss-120b', messages, response_format: { type: 'json_object' }, temperature: 0.4, max_tokens: 600 })`. Parses with `SuggestionsResponseSchema`. Retries once on parse failure with a stricter system note appended.
- `src/lib/groq/chat.ts` — `streamChat(client, messages)` returns an async iterator of token strings. Use Groq's streaming.
- `src/lib/sse/server.ts` — `sseStream(start: (send) => Promise<void>)` returns a `Response` with the right headers (`text/event-stream`, `cache-control: no-cache, no-transform`, `connection: keep-alive`). `send('token', { t: '...' })` etc.
- `src/lib/sse/client.ts` — `readSSE<T>(res: Response)` async generator yielding `{ event, data }`.
- `src/app/api/transcribe/route.ts` — `runtime = 'nodejs'`. Reads `formData()`, passes the `Blob` directly to Groq SDK, catches and maps errors.
- `src/app/api/suggest/route.ts` — `runtime = 'edge'`. Validates body with Zod. Calls `buildSuggestMessages` → `generateSuggestions` → returns `{ suggestions, generatedAt, latencyMs }`. Includes `id` per suggestion via `newId('s')`.
- `src/app/api/chat/route.ts` — `runtime = 'edge'`. Validates body with Zod. Discriminated on `mode`. **Implements the full-when-small / tail-when-large rule from CLAUDE.md §7.3:**
  - For `mode === 'expand'`: if `transcript.length <= body.expandContextChars`, pass the full transcript; else `sliceTail(transcript, body.expandContextChars)` first.
  - For `mode === 'chat'`: same with `body.chatContextChars`.
  - Then call `buildExpandMessages` or `buildChatMessages` with the resulting string.
  - Stream via `sseStream`, emit `token` events and a final `done` with `{ latencyMs, firstTokenMs }`. On Groq error, emit `error` event then close.
- Error mapping `lib/groq/errors.ts`: 401 → `groq_unauthorized`, 429 → `groq_rate_limit`, 5xx → `groq_server`, other → `unknown`. Strip any echo of the API key from messages.

Gate: hit each route locally with `curl` (no key → 401 typed error; bad JSON → 400 with zod issues; valid request without real key → predictable `groq_unauthorized`). Add a unit test that confirms the chat route's windowing rule: a 5,000-char transcript with `expandContextChars: 12000` results in a 5,000-char string passed into the assembler.

### A5 — audio-agent

Deliverables:
- `src/lib/audio/mime.ts` — `pickMime()` returning the first supported of `['audio/webm;codecs=opus','audio/webm','audio/mp4']`. Throws `mic_unavailable` if none.
- `src/lib/audio/recorder.ts` — `RollingRecorder` class per CLAUDE.md §9. Event-emitter style: `on('chunk', cb)`, `on('error', cb)`. Internal queue ensures stop→start handover with no overlapping `MediaRecorder` instances on the same stream.
- `src/hooks/useRecorder.ts` — wraps `RollingRecorder`, exposes `start()`, `stop()`, and current state. Updates `useSessionStore.recording` and `micError`.
- `src/hooks/useTranscriptionLoop.ts` — singleton queue + `inFlight` flag. For each chunk: build `FormData`, POST to `/api/transcribe` with `x-groq-key` header from settings store, on success append a `TranscriptChunk` with `startedAtMs` from the chunk event and the returned `text`. On error: append a typed-error chunk (`text: ''`, `error: TwinMindError`) so the UI can show inline retry.
- A small `MicButton` interaction test (Vitest + jsdom mocks `MediaRecorder`) to assert: clicking when idle calls `start()`, clicking when recording calls `stop()`, mic-denied surfaces `mic_denied`.

Gate: in `pnpm dev`, clicking the mic asks for permission, denying surfaces a friendly inline error, granting starts a chunked recording (verify in DevTools that `/api/transcribe` is hit every ~30s).

### A6 — ui-agent

Deliverables — match the mockup precisely:

- **Header**: title left; on the right: an Export button (`↧ Export`) and a Settings gear. A small red dot on the gear if no API key.
- **Card** primitive: rounded `1.25rem`, 1px panel border, inner subtle ring, `bg-[var(--panel)]`, padding `1.25rem`, header row with uppercase label + right-side status pill (`IDLE` / `RECORDING` / `1 BATCH` / `SESSION-ONLY`).
- **TranscriptColumn**: top status row (mic dot — pulsing when recording), helper hint card with the explainer copy, then the live transcript list. Each line: muted timestamp, then text. Auto-scroll to bottom on new chunk *only if* user is already at the bottom (preserve scroll on manual review). Faded retry button on errored chunks.
- **MicButton**: a circle (~48px), accent fill when idle, pulsing red ring + dot when recording. Aria-label updates with state.
- **SuggestionsColumn**: row with `Reload suggestions` button (left) and `auto-refresh in {n}s` countdown (right). Below: helper hint card (the explainer with type pills colorized inline). Below: stacked `SuggestionBatch` components, newest at top (full opacity), older fade to 60%. Each batch ends with a centered `— BATCH N · 08:43:39 PM —` separator.
- **SuggestionCard**: 1px colored border per type, type pill upper-left in the matching color tone, then the preview as the main label below. Hover lifts. Click → `useChat.expandSuggestion(s)`.
- **AutoRefreshTimer**: derives `secondsLeft` from `useSessionStore.nextRefreshAtMs` via a 1Hz interval; on reach 0 with recording active, triggers `refreshSuggestions()`. Pauses when not recording.
- **ChatColumn**: scrollable message list, then an input row with a textarea (auto-grow, Enter sends, Shift+Enter newline) and a Send button. Helper hint card visible only when chat is empty. User messages right-aligned subtle bubble; assistant messages left-aligned, prose-styled, streaming caret while `streaming === true`.
- **SettingsModal**: opens centered, `max-w-2xl`. Sections: API Key (password, show/hide), Prompts (3 textareas with monospace + line numbers optional), Context windows (3 number inputs), Timing (chunk seconds + refresh seconds), Reset to defaults, Done. `Esc` closes. Trap focus.
- **ExportPopover**: anchored under the header button. Two buttons: "Download JSON", "Download text". Clicking calls `serializeSession()` and triggers download via a Blob URL.

Accessibility: every interactive control has a real `<button>`, focus-visible ring, aria-labels for icon-only buttons. No divs masquerading as buttons.

Gate: visual diff against the mockup at 1440px wide is a near-match (column widths, colors, type pills, spacing, status pills).

### A7 — integration-and-deploy-agent

Deliverables:
- `src/hooks/useSuggestionLoop.ts` — owns the 30s timer and the manual reload. Builds `transcriptWindow` from `useSessionStore.chunks` (sliced via `sliceTail`), passes `previousPreviews` (last 6), POSTs to `/api/suggest` with `x-groq-key`, prepends batch on success, sets `nextRefreshAtMs = now + refreshSeconds*1000`, sets `suggestionsLoading` correctly. Uses `AbortController` to cancel in-flight on a new request. Auto-fires only while `recording === 'recording'`. Manual reload works regardless of recording state if there is any transcript.
- `src/hooks/useChat.ts` — exposes `expandSuggestion(s)`, `sendMessage(text)`. Each path: optimistically push the user message, start an empty assistant message, open SSE, append tokens, finalize on `done`, mark error on `error`. On error mid-stream, append a small inline retry control to that assistant message. **Both paths send the FULL current transcript text in the request body — the API route handles the windowing decision.**
- `src/lib/export/session.ts` — `serializeSession(state)` returning `{ json: string, text: string, fileBase: string }`. `fileBase = twinmind-session-YYYYMMDD-HHMMSS`.
- README per CLAUDE.md §16, including a clean ASCII pipeline diagram and verbatim default prompts. **The "Trade-offs" section MUST contain the "Comparison vs. TwinMind's live suggestions" sub-section per CLAUDE.md §16 item 7 — those bullets are required, not optional.**
- Final pass: remove all unused files/exports, run `pnpm lint --max-warnings=0`, `pnpm typecheck`, `pnpm test --run`, `pnpm build`. All must pass.
- Deploy to Vercel: pause and tell the user to run `pnpm dlx vercel --prod` from their own terminal. Once they share the URL, write it into the README.

Gate: end-to-end smoke — paste my Groq key in settings, click mic, speak for 90 seconds about a topic with named entities and at least one factual claim (e.g., "we had 50M users last quarter, our biggest competitor is Snowflake, latency target is 200ms"). Observe:
(a) at least 2 transcript chunks appear,
(b) at least 2 suggestion batches appear with a **mix of types** (no batch is 3 questions),
(c) at least one `fact_check` appears across the session given the factual claim,
(d) clicking a suggestion streams a useful expansion in chat,
(e) typing a follow-up question gets a streaming answer that uses the transcript,
(f) Export downloads a JSON that contains every batch, every chunk, and the chat in order with timestamps,
(g) no preview starts with "You could…", "Maybe…", or "Consider…".

---

## 4. Phase gates (run between phases, you the orchestrator)

After each phase, you must explicitly run and report:

```
pnpm install
pnpm typecheck
pnpm lint
pnpm test --run
pnpm build
```

If any fails, dispatch a fix-agent scoped to the failure (single file or single concern). Do not let typecheck failures accumulate across phases.

For Phase 3 specifically, also run a quick local smoke: `pnpm dev`, hit the three API routes with `curl` using a placeholder key, and confirm the typed errors come back. (You can simulate this without a real key — the goal is to confirm wiring + zod validation, not to call Groq.)

---

## 5. Self-review checklist (run before declaring done)

Walk this list and quote-check each item against the code:

- [ ] No `any`. No `@ts-expect-error`. `tsc --strict --noUncheckedIndexedAccess` clean.
- [ ] No hardcoded API key anywhere — `grep -ri "gsk_"` returns nothing in source. Key only flows via `x-groq-key` header.
- [ ] Suggestions API enforces exactly 3 via Zod and retries once on parse failure.
- [ ] Previous-batch previews are passed to the suggest prompt and the prompt forbids near-duplicates (semantic too).
- [ ] **Hard rules A–E from CLAUDE.md §10.1 are present verbatim in `defaults.ts` and the rule reminder is also in the user message of `buildSuggestMessages`.**
- [ ] **Mixed suggestion types are achievable** — verified by a 5-minute live test that produced at least one non-question batch and at least one fact_check.
- [ ] Reload button cancels any in-flight suggest, immediately fires a new one, resets countdown.
- [ ] Older batches fade; newest at top; clear separator between them.
- [ ] Suggestion click → optimistic user message → streamed assistant message that uses the *expand* prompt, not the chat prompt.
- [ ] Typed chat messages use the *chat* prompt with current transcript context.
- [ ] **The chat route applies the full-when-small / tail-when-large rule for both `expand` and `chat` modes — verified by a unit test on `/api/chat`.**
- [ ] Export contains transcript + every batch + chat with ISO timestamps; opens cleanly in `jq`.
- [ ] Settings modal exposes every default; `Reset to defaults` restores the strings verbatim.
- [ ] Mic permission denial yields a clear, recoverable UI state.
- [ ] No persistence of transcript / batches / chat across reloads. Settings DO persist.
- [ ] First-token latency on chat feels < 1 s on a warm Vercel deploy with a healthy Groq region.
- [ ] **README contains the "Comparison vs. TwinMind's live suggestions" sub-section** with all 7 bullets.
- [ ] README is otherwise complete with the live URL, prompts, architecture decisions, and trade-offs.

When every box is checked, post the final summary: live URL, repo state, latency observations, and anything I should know before testing.

---

## 6. What NOT to do

- Do not invent new UI sections. Stick to the mockup.
- **Do not add a Notes scratchpad, Summary tab, action items, post-recording recap, auto-titles, or any other feature observed in TwinMind's recap product.** Those are out of scope; the brief is explicit about no persistence and no post-recording features.
- Do not introduce a database, auth, or user accounts.
- Do not store the API key server-side. Do not log request bodies.
- Do not use a UI library (no shadcn, no MUI, no Chakra). Tailwind + tokens only.
- Do not pre-render or cache LLM responses. Every request is fresh.
- Do not couple components to Zustand internals — use selectors, not the raw store.
- Do not silently catch errors. Map them to `TwinMindError` and surface them.
- Do not skip the gates between phases.

---

## 7. When you finish

Reply with:
1. The live Vercel URL.
2. A short writeup (≤ 300 words) covering: what you built, the prompt-engineering choices you made (especially around mixing suggestion types, anti-duplication, and the full-transcript-when-small expansion rule), measured p50/p95 latencies for reload→render and chat→first-token, and one trade-off you would revisit.
3. The full file tree (`tree -I node_modules -L 4`).
4. A checklist confirming each item in §5 is true.

Begin with Phase 1.

---

## 8. Amendment runbook (use this section ONLY if the build is already complete)

If the orchestrator from §0–§7 has already finished and the codebase exists with a working deploy, the three structural changes captured in this version of `CLAUDE.md` and `prompt.md` may need to be applied as targeted edits rather than a fresh build. Run them in order:

### Edit 1 — Hardened suggest prompt (CLAUDE.md §10.1)
In `src/lib/prompts/defaults.ts`, locate `DEFAULT_SUGGEST_PROMPT`. Replace its `DECISION HEURISTICS` block (and any prior soft anti-repetition / anti-monoculture rules) with the canonical text from CLAUDE.md §10.1, which now contains four labeled sections in this order: ALLOWED TYPES, **HARD STRUCTURAL RULES (A–E)**, DECISION HEURISTICS (1–4), ANTI-PATTERNS, PREVIEW RULES, OUTPUT.

Then update `buildSuggestMessages` in `src/lib/prompts/assemble.ts` so its user message includes the rule-reminder line per CLAUDE.md §10.4: *"Now produce exactly 3 suggestions per the rules. Remember: max 2 of type `question_to_ask`; if a question is unanswered in the window, include at least 1 `answer`; if a verifiable claim was made, include at least 1 `fact_check`."*

Update the golden test in `assemble.test.ts` to match. Do not weaken the assertions — regenerate the snapshot deliberately.

### Edit 2 — Full-when-small expansion windowing (CLAUDE.md §7.3 + §10.4)
In `src/app/api/chat/route.ts`, add the windowing decision before calling either assembler:

```ts
const sized =
  body.transcript.length <= ceiling
    ? body.transcript
    : sliceTail(body.transcript, ceiling);
```

— where `ceiling` is `body.expandContextChars` for `mode === 'expand'` and `body.chatContextChars` for `mode === 'chat'`. Pass `sized` into `buildExpandMessages` / `buildChatMessages`. Update the route's Zod body schema to require these two `ContextChars` numbers from the client.

In `src/hooks/useChat.ts`, send the FULL current transcript text in the request body (not a pre-sliced window) and include `expandContextChars` and `chatContextChars` from the settings store.

Add a unit test for the route confirming that a 5,000-char transcript with `expandContextChars: 12000` produces a 5,000-char `sized` (no truncation), and a 30,000-char transcript with the same ceiling produces a 12,000-char `sized`.

### Edit 3 — README "Comparison vs. TwinMind's live suggestions" (CLAUDE.md §16 item 7)
In `README.md`, under the Trade-offs section, add a sub-section titled **Comparison vs. TwinMind's live suggestions** containing the seven bullets listed in CLAUDE.md §16 item 7 verbatim, each followed by a one-sentence justification in the author's voice.

### Post-amendment gates
Run in order, fix any failures before proceeding:
1. `pnpm typecheck`
2. `pnpm lint --max-warnings=0`
3. `pnpm test --run` (regenerate the suggest-prompt golden snapshot deliberately)
4. `pnpm build`
5. Local smoke: `pnpm dev` → paste Groq key → speak for 90s on a topic with named entities and at least one factual claim → confirm at least one batch contains a non-question type, at least one `fact_check` appears, and no preview starts with "You could…", "Maybe…", or "Consider…".
6. Redeploy: pause and tell me to run `pnpm dlx vercel --prod` from my own terminal.

Do NOT touch any other files. Do NOT add Notes scratchpads, Summary tabs, action items, or any post-recording recap features. If anything in the existing code conflicts with these edits (e.g., a renamed file or restructured prompt module), surface the conflict and stop before patching.