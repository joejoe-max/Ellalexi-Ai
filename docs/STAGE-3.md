# Stage 3 — AI Analysis Engine

## Implementation
- Server-side Gemini 2.5 Flash integration using the official Gemini REST `generateContent` endpoint.
- Structured JSON output schema for document overview, parties, clauses, rights/obligations, risks, money terms, possible missing protections, questions, cross-document findings and limitations.
- Multiple uploaded PDFs/DOCX are processed in the same request. Extracted text is supplied with page markers. Image-only PDFs are supplied as inline PDF data for Gemini's native document vision.
- User documents are processed in request memory and temporary files are removed in a `finally` block. No File Search or persistent user-document storage is used.
- Exact quote matching is checked in code against extracted text. Unmatched quotations are explicitly marked unverified; scanned-PDF quotations cannot be independently checked by text matching.
- Model instructions prohibit legal enforceability conclusions and claims about current Nigerian law. Stage 4 legal-source retrieval is required for legal verification.
- API key is server-only in `GEMINI_API_KEY`.

## API
`POST /api/documents/analyze`, multipart field `documents`. Returns structured analysis and document metadata, not raw extracted text.

## Limitations
- Gemini API key and outbound API access are required.
- Real Gemini responses cannot be tested in CI without a valid key.
- The model may still make mistakes. Quote matching checks evidence presence, not correctness of interpretation.
- This stage does not verify statutes, amendments, repeals, case law or state-specific legal rules.
- In-memory rate limits and deployment-level abuse controls still need production hardening in Stage 7.
