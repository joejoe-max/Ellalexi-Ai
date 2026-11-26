# EllaBrief

**Understand Before You Agree.**

EllaBrief is a Nigerian legal-document intelligence platform that helps people understand important documents before they sign, accept, or commit to something.

## Why EllaBrief exists

The idea for EllaBrief came from a personal experience.

I was considering signing an agreement with a startup. I read through the document, but there were several things I did not understand. I was unsure about what I would be agreeing to, what the terms meant in practice, and what risks I might be taking on.

I sought help from someone in Prague who had a background in legal studies and was still pursuing her legal education. She helped me go through the document and understand what it meant. That process brought some important issues to light: the agreement contained risks I had not recognised on my own. With a clearer understanding of what I was being asked to accept, I decided not to sign it.

That experience left me thinking about people who find themselves in the same position but do not have someone they can turn to for help. Someone might be handed an employment contract, startup agreement, tenancy document, or another important legal document and feel pressured to sign without fully understanding the terms. They may not know what to look out for, what questions to ask, or where a clause could put them at a disadvantage.

Access to an explanation should not depend entirely on whether someone happens to know a person with a legal background.

That is the problem EllaBrief is being built to address: **helping people understand what a document says, what it could mean for them, and what they may need to question before making a decision.**

## What EllaBrief does

EllaBrief helps users:

- Upload and review PDF and DOCX documents.
- Understand clauses, rights, obligations, and practical consequences in clearer language.
- Identify potentially risky, unclear, or one-sided terms.
- Surface questions and points a user may want to clarify or negotiate.
- Review relevant Nigerian legal context and sources.
- Compare information across multiple documents and ask follow-up questions about an analysis.

EllaBrief is designed to improve understanding and help people prepare for more informed conversations and decisions. It is not a law firm, does not provide a substitute for professional legal advice, and should not be treated as a final legal opinion. Users should consult a qualified legal practitioner when they need advice about their specific circumstances.

## Document intake

Upload up to 5 PDF or DOCX files together (10 MB per file; 25 MB total).

- PDF.js extracts selectable text from PDFs and preserves page markers.
- Mammoth extracts text from DOCX files.
- Scanned or image-only PDFs are flagged because they require OCR.
- Uploaded documents are temporarily processed and are not stored in the legal knowledge base.

## Technology

- React 19, Vite, JavaScript
- Tailwind CSS v4
- Vercel serverless functions
- Gemini API for AI-powered document analysis and follow-up
- PDF.js for PDF text extraction
- Mammoth for DOCX text extraction
- Vitest for testing

## AI streaming and configuration

AI analysis, legal-source review, and follow-up use a shared Server-Sent Events (SSE) response protocol with safe provider errors and configurable Gemini Flash model fallback.

Configure `GEMINI_API_KEY` in the server environment. `GEMINI_MODELS` can optionally be used to configure model fallback. See [docs/STAGE-7.md](docs/STAGE-7.md) for the event contract and documented limitations.

## Development

```bash
npm install
npm run dev
npm run lint
npm run test:run
npm run build
```

The API route `POST /api/documents/extract` requires a Vercel-compatible serverless runtime; Vite alone does not execute files in `api/`.

---

EllaBrief exists because understanding an agreement before signing it can change a decision. Everyone deserves the chance to understand what they are agreeing to.
