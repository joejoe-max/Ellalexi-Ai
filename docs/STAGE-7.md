# Stage 7 — Resilient AI requests and SSE

- Central Gemini model order is configured by server-only `GEMINI_MODELS` (comma-separated). Defaults are `gemini-3.8-flash,gemini-3.5-flash-lite,gemini-3.1-flash-lite`, based on Google's currently listed Gemini API model catalogue.
- Quota/rate-limit, transient server, timeout and unavailable-model failures can fail over. Authentication/permission and invalid-request failures stop immediately.
- Provider error text and credentials are never sent to the browser. User-facing errors are mapped to safe messages.
- `POST /api/documents/analyze`, `POST /api/documents/ask`, and `POST /api/legal/verify` use SSE: `status`, `fallback`, `delta`, `complete`, and `error`. Upload and JSON POST requests use fetch + ReadableStream parsing; native EventSource cannot submit FormData or JSON POST bodies.
- Analysis and legal verification stream progress and send a validated structured result at `complete`. Follow-up uses Gemini `streamGenerateContent` and forwards text chunks as SSE `delta` events, followed by `complete`.
- Follow-up requests use the structured review by default. Original PDFs/DOCX files are re-attached only for questions asking for exact wording, quotations, clauses, sections, or page/location checks. Without originals, the assistant must not claim exact source verification.
- Follow-up fallback is allowed only before the first text chunk. If a stream fails after text has started, the request ends with a safe interruption error rather than mixing partial answers from different models.
- This is request-local fallback, not a persistent circuit breaker. Serverless instances do not share in-memory failure state.
- Required Vercel environment variable: `GEMINI_API_KEY`. Optional: `GEMINI_MODELS`.
- Real provider tests require a configured key and deployed serverless runtime. Never put the key in a `VITE_*` variable.
