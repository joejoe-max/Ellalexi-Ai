# EllaLexi AI — MVP Architecture

## Stage 1 — Foundation
React + Vite + Tailwind CSS v4 (JavaScript), React Router, Vercel static frontend and Node serverless functions.

## Stage 2 — Upload & document processing
POST /api/documents/extract validates PDF/DOCX uploads. PDF.js extracts text with page markers; Mammoth extracts DOCX text. Temporary files are deleted. User documents are never added to the persistent legal retrieval index.

## Request path
1. Upload and temporarily extract document text.
2. Gemini 2.5 Flash produces structured, evidence-grounded analysis.
3. Approved Nigerian legal materials are retrieved separately through Gemini File Search.
4. Browser renders document analysis and legal-source review as distinct sections.
5. Temporary user-document data is discarded.

## Data separation
- User documents: request-scoped inputs; not persisted or added to File Search.
- Nigerian Legal Knowledge Base: separately curated materials with provenance, jurisdiction, legal status, reuse basis and version metadata.
- Gemini File Search: managed retrieval/indexing service, not the legal corpus.

## Security
Never expose API keys through VITE variables. Do not log document text or personal data. Validate uploads server-side. Enforce limits. Do not persist user documents by default. Distinguish document text, verified law, inference and uncertainty.

## Stage 3 — AI analysis
POST /api/documents/analyze extracts user documents and passes content to Gemini 2.5 Flash. Structured output is validated and quotations are checked against extracted text. User documents are not stored or added to File Search.

## Stage 4 — Nigerian legal knowledge base
Approved legal sources are indexed into a dedicated Gemini File Search store using npm run legal:ingest. Every source requires provenance, jurisdiction, dates, legal status, verification date and reuse/permission metadata. POST /api/legal/verify queries only this store and returns a separate legal review with retrieved source passages. The user's agreement is never added to this persistent store.
