# EllaBrief

**Understand Before You Agree.**

A Nigerian legal document intelligence product that helps people understand documents before making important decisions. It explains documents and surfaces questions; it does not replace a qualified legal practitioner.

## Stack
React + Vite + Tailwind CSS v4 (JavaScript), Vercel serverless functions.

## Stage 2 — Document intake
Upload up to 5 PDF/DOCX files together (10 MB each; 25 MB total). PDF.js extracts selectable PDF text with page markers; Mammoth extracts DOCX text. Scanned/image-only PDFs are flagged for OCR. Uploads are temporarily processed and are not stored in the legal knowledge base.

## Stage 7 — Resilient AI and streaming
AI analysis, legal-source review and follow-up use a shared SSE response protocol with safe provider errors and configurable Gemini Flash model fallback. Configure `GEMINI_API_KEY` and optionally `GEMINI_MODELS` in the server environment. See `docs/STAGE-7.md` for the event contract and limitations.

## Development
```bash
npm install
npm run dev
npm run lint
npm run test:run
npm run build
```
The API route `POST /api/documents/extract` requires a Vercel-compatible serverless runtime; Vite alone does not execute files in `api/`.