# Stage 6 — Follow-up, checklist and report

## Delivered
- “Before You Sign” discussion checklist assembled from actual risks, missing protections, generated questions and legal-review caveats. Duplicate titles are removed. Items are prompts, not legal clearance or sign/don't-sign advice.
- Follow-up questions sent to a server-side Gemini endpoint using the active structured analysis and legal review. The endpoint explicitly says original uploaded file text is unavailable and prohibits invented quotations, clauses, laws and page references. Answers disclose this limitation.
- Client-generated PDF report includes document inventory, overview, populated analysis categories, checklist, legal-review findings/citations and limitations.
- Tools are embedded in the active analysis workspace, not separate global destinations.

## Data and safety
- Follow-up endpoint receives structured analysis, not original file bytes or full extracted text.
- Endpoint is POST-only, bounds question length and payload size, uses the server-side Gemini key and disables caching.
- PDF is generated from current in-memory results. No report or uploaded document is stored.
- Checklist is not legal sign-off. Users must verify against original documents; follow-up answers may not see wording omitted from structured analysis.

## Automated validation
Unit tests cover checklist generation, deduplication, empty analysis and legal citation metadata. CI lint, tests and production build validate the application. Real Gemini follow-up, PDF visual review and device testing require a configured API key/browser and belong to release validation.
