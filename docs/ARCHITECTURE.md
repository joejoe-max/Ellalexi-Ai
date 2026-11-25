# EllaLexi AI — MVP Architecture

## Stage 1 — Foundation
React + Vite + Tailwind CSS v4 (JavaScript), React Router, Vercel static frontend and Node serverless functions.

## Stage 2 — Upload & document processing
Browser sends multiple PDF/DOCX files as multipart form data to `POST /api/documents/extract`. Server validates method, multipart type, count, per-file/aggregate size and file signatures. PDF.js extracts selectable PDF text with page markers; Mammoth extracts DOCX text. Image-only PDFs are flagged as requiring OCR. Temporary files are deleted in a `finally` cleanup path. User documents are never added to the persistent legal retrieval index.

## Planned request path
1. Upload and temporarily extract document text.
2. Gemini 2.5 Flash produces structured, evidence-grounded analysis.
3. Approved Nigerian legal materials are retrieved separately through Gemini File Search.
4. Browser renders analysis, contextual questions and report.
5. Temporary user-document data is discarded.

## Data separation
- User documents: request-scoped inputs; not persisted or added to the legal knowledge base.
- Nigerian Legal Knowledge Base: separately curated legal materials with provenance, jurisdiction, legal status and version metadata.
- Gemini File Search: managed retrieval/indexing service, not the legal corpus.

## Security
Never expose API keys through VITE variables. Do not log document text or personal data. Validate uploads server-side. Enforce limits. Do not persist user documents by default. Distinguish document text, verified law, inference and uncertainty.

Stage 2 extracts text only; it does not interpret legal meaning.
## Stage 3 — AI analysis
The browser posts uploaded files directly to `POST /api/documents/analyze`. The Node function extracts text, passes extracted content and scanned PDF bytes to Gemini 2.5 Flash, validates the structured response, checks quoted passages against extracted text, and returns the analysis. API keys remain server-side. User documents are not stored or added to File Search. This stage explains document contents only; current Nigerian law verification is reserved for Stage 4.
