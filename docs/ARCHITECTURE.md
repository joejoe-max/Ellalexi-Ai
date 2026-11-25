# EllaLexi AI — MVP Architecture

## Stage 1 foundation

- React + Vite frontend, written in JavaScript.
- Tailwind CSS v4 through the Vite plugin.
- Vercel serves the static frontend and Node.js serverless functions from the same repository.
- React Router owns client-side navigation.
- `/api/health` is a non-sensitive service health endpoint.

## Planned request path

1. The browser submits one or more supported documents to a Vercel API route.
2. The server validates type, size and request limits before processing.
3. Document contents are handled temporarily for the current analysis.
4. Gemini 2.5 Flash produces a structured, evidence-grounded analysis.
5. Approved Nigerian legal materials are retrieved separately through Gemini File Search.
6. The browser renders the analysis workspace, contextual questions and report.
7. Temporary user-document data is discarded according to the retention policy.

## Separation of information

- **User documents:** private, request-scoped inputs; never added to the persistent legal knowledge base.
- **Nigerian Legal Knowledge Base:** separately curated legal materials with provenance, jurisdiction, legal status, version and source metadata.
- **Gemini File Search:** managed indexing and retrieval service for approved knowledge-base materials; it is not itself the legal corpus.

## Security principles

- Never expose provider API keys through `VITE_*` variables or browser bundles.
- Do not log document text, extracted personal data or secrets.
- Validate uploaded files on the server; browser validation is only a convenience.
- Set explicit request and file-size limits before enabling public uploads.
- Do not persist user documents by default.
- Legal findings must distinguish document text, verified law, inference and uncertainty.

## Stage boundary

This stage establishes the frontend shell, design tokens, route handling, Vercel configuration, health endpoint and test tooling. Document upload, AI analysis and legal retrieval are deliberately not implemented until their respective stages.
