# EllaLexi AI — MVP Architecture

## Stage 1 — Foundation
React + Vite + Tailwind CSS v4 (JavaScript), React Router and Node serverless functions.

## Stage 2 — Upload & document processing
POST /api/documents/analyze validates PDF/DOCX uploads. PDF.js extracts text with page markers; Mammoth extracts DOCX text; scanned PDFs are passed to Gemini's native PDF understanding. Temporary files are deleted. User documents are never added to the legal-source collection.

## Request path
1. Upload and temporarily extract user documents.
2. Gemini 2.5 Flash produces structured, document-grounded analysis.
3. A replaceable legal-source retrieval module searches the configured Nigerian legal source index and retrieves relevant passages.
4. Gemini compares the document analysis with retrieved passages, returning source-linked findings or abstaining.
5. The browser renders document analysis and legal-source review as distinct sections.
6. Temporary user-document data is discarded.

## Data separation
- User agreements: request-scoped inputs; not persisted.
- Legal reference sources: a small source catalogue and externally retrieved legal text; not a persistent vector database.
- Gemini File Search: deferred upgrade, not an MVP dependency.

## Security and grounding
Never expose API keys through VITE variables. Do not log document text or personal data. Validate uploads server-side and enforce limits. Do not persist user documents by default. Distinguish document text, retrieved source text, inference and uncertainty. A source URL or portal listing is not itself proof of current law.

## Stage 3 — AI analysis
POST /api/documents/analyze extracts user documents and passes content to Gemini 2.5 Flash. Structured output is validated and quotations are checked against extracted text. User documents are not persisted.

## Stage 4 — MVP Nigerian legal-source retrieval
The backend searches a limited federal-law Markdown index and retrieves relevant passages. It does not claim completeness, currentness or state coverage. Gemini File Search and bulk ingestion are deferred.
