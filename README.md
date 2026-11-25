# EllaLexi AI

**Understand Before You Agree.**

EllaLexi AI is an early-stage Nigerian legal document intelligence project. It helps people read and question legal documents before making important decisions by turning dense clauses into clearer explanations, surfacing obligations and potential risks, and connecting document analysis to relevant Nigerian legal materials.

EllaLexi is designed to help people become better informed before they agree to something. It is not a law firm, does not create a lawyer-client relationship, and does not replace advice from a qualified Nigerian legal practitioner.

> **Project status:** MVP under active development. Automated CI currently covers linting, unit tests and the production build. Real Gemini API calls, a live deployment and full end-to-end testing with real documents still require environment configuration and user testing.

## Contents

- [Why EllaLexi exists](#why-ellalexi-exists)
- [What it does](#what-it-does)
- [How it works](#how-it-works)
- [Technology](#technology)
- [Legal research sources](#legal-research-sources)
- [Logo and visual asset attribution](#logo-and-visual-asset-attribution)
- [Privacy and security](#privacy-and-security)
- [Project structure](#project-structure)
- [Run locally](#run-locally)
- [Environment configuration](#environment-configuration)
- [Tests and checks](#tests-and-checks)
- [Known limitations](#known-limitations)
- [Disclaimer](#disclaimer)

## Why EllaLexi exists

Contracts and other legal documents often contain important obligations, restrictions, costs and consequences in language that is difficult for a non-lawyer to interpret. People may sign documents without fully understanding what they are agreeing to, what they must do, what they are entitled to, or what could happen if something goes wrong.

EllaLexi aims to make that information easier to inspect. It focuses on the document in front of the user, explains what the text appears to say, and helps the user identify questions worth raising before signing or accepting the document.

The product is being built with a Nigerian legal context in mind. It aims to distinguish what the uploaded document says from what retrieved legal materials say, and from an AI-generated interpretation or inference.

## What it does

The current MVP supports the following workflow:

1. **Upload related documents.** Add up to five PDF or DOCX files to one analysis.
2. **Extract document content.** Read selectable PDF text with page markers and extract DOCX text. Scanned PDFs are routed through the model's native PDF input path during analysis.
3. **Generate a structured explanation.** Review an overview, document inventory, parties, clauses, rights and obligations, money terms, potential risks, missing protections, questions and cross-document observations.
4. **Review Nigerian legal context.** Request a source-assisted legal review that combines live legal web discovery with a historical local legislation index. Legal findings are shown with source citations when supporting source text is retrieved.
5. **Ask follow-up questions.** Ask questions about the generated analysis. The follow-up endpoint receives the structured analysis context, not the original uploaded file.
6. **Prepare before agreeing.** Generate a dynamic “Before You Sign” checklist from the analysis.
7. **Export a report.** Download a PDF report containing the available analysis, legal review material, citations, checklist and limitations.

### Upload limits

- Maximum of **5 files** per upload.
- **10 MB per file**.
- **25 MB combined** for ordinary document extraction.
- Scanned PDFs sent for native model processing have a separate combined limit enforced by the API.

Supported formats are PDF and DOCX. Unsupported formats are rejected.

## How it works

EllaLexi uses a document-first workflow rather than treating the uploaded file as a prompt for an unrestricted chatbot.

### 1. Document intake

The React application sends the files to Vercel-compatible serverless API routes. The server validates file type and size, then extracts text and page information where possible.

- PDF text extraction: PDF.js.
- DOCX text extraction: Mammoth.
- Scanned/image-only PDF analysis: native PDF input to the Gemini API.

### 2. Structured document analysis

The extracted document content is sent to Gemini for structured analysis. The result is organised into sections such as parties, clauses, obligations, risks, financial terms, missing protections and questions.

Document content is treated as untrusted input. The model is instructed not to follow instructions embedded inside uploaded documents or invent legal conclusions. Evidence and quotation checks are applied to document references before they are presented.

### 3. Legal-source review

Legal review uses two complementary retrieval paths:

- **Live discovery:** Gemini with Google Search grounding discovers candidate Nigerian legal materials. EllaLexi then attempts to retrieve the actual eligible source page. Search snippets alone are not treated as legal evidence.
- **Local fallback:** a historical Nigerian federal-law Markdown index is searched as an additional reference. It is explicitly labelled historical and is not treated as a current consolidated statement of Nigerian law.

Retrieved excerpts and metadata are passed to the model for comparison with the document. Citations are associated with findings and linked to the retrieved source.

### 4. Follow-up and reporting

The follow-up endpoint answers against the structured analysis supplied by the browser. It does not re-open the original upload. The report generator creates a PDF in the browser using the analysis data available in the current session.

### 5. Streaming and model resilience

The analysis, legal review and follow-up endpoints use Server-Sent Events (SSE) over fetch and ReadableStream. This supports POST requests and multipart uploads, which native browser EventSource does not handle.

A shared Gemini request helper classifies provider failures and can try configured fallback models for eligible transient, quota or model-availability failures. Authentication, permission and invalid-request failures stop rather than being blindly retried. Failed partial model attempts are not mixed into the successful response.

Follow-up currently delivers the completed answer as an SSE event; it is not token-by-token streaming from the upstream model.

More implementation detail is available in:

- [Architecture](docs/ARCHITECTURE.md)
- [Stage 2 — Document intake](docs/STAGE-2.md)
- [Stage 3 — AI analysis](docs/STAGE-3.md)
- [Stage 4 — Legal research](docs/STAGE-4.md)
- [Stage 5 — Analysis workspace](docs/STAGE-5.md)
- [Stage 6 — Follow-up and reports](docs/STAGE-6.md)
- [Stage 7 — Resilience and SSE](docs/STAGE-7.md)

## Technology

| Area | Technology | What it is used for |
| --- | --- | --- |
| Frontend | React, JavaScript | Application interface and analysis workspace |
| Build tooling | Vite | Development server and production build |
| Styling | Tailwind CSS v4 | UI styling |
| Routing | React Router | Client-side navigation |
| Serverless API | Vercel Functions | Document processing and AI endpoints |
| AI | Google Gemini API | Structured analysis, legal-source comparison and follow-up |
| Web discovery | Gemini Google Search grounding | Finding candidate legal sources |
| PDF extraction | PDF.js (pdfjs-dist) | Extracting selectable PDF text and page markers |
| DOCX extraction | Mammoth | Extracting DOCX text |
| Upload handling | Formidable, file-type | Multipart parsing and file validation |
| PDF report | jsPDF | Generating downloadable reports in the browser |
| Icons | Lucide React | Interface icons |
| Tests | Vitest, Testing Library, jsdom | Automated unit and component tests |
| Code quality | ESLint, GitHub Actions | Linting and CI checks |

### Upstream projects and documentation

These are the upstream projects used directly by the application or its build/test toolchain:

- [React](https://github.com/facebook/react)
- [Vite](https://github.com/vitejs/vite)
- [Tailwind CSS](https://github.com/tailwindlabs/tailwindcss)
- [React Router](https://github.com/remix-run/react-router)
- [PDF.js](https://github.com/mozilla/pdf.js)
- [Mammoth](https://github.com/mwilliamson/mammoth.js)
- [Formidable](https://github.com/node-formidable/formidable)
- [file-type](https://github.com/sindresorhus/file-type)
- [jsPDF](https://github.com/parallax/jsPDF)
- [Lucide](https://github.com/lucide-icons/lucide)
- [Vitest](https://github.com/vitest-dev/vitest)
- [Testing Library](https://github.com/testing-library/react-testing-library)
- [ESLint](https://github.com/eslint/eslint)

The AI integration uses the [Google Gemini API](https://ai.google.dev/gemini-api/docs), including Google Search grounding. Requests are made through server-side REST calls; this project does not use a browser-side Gemini SDK.

## Legal research sources

EllaLexi's legal research implementation currently references the following sources. They do not all have the same authority or retrieval status, and they should not be treated as interchangeable.

### Local legislation index

| Source | Role | Important qualification |
| --- | --- | --- |
| [mykeels/nigerian-laws](https://github.com/mykeels/nigerian-laws) | Historical Markdown index and fallback retrieval of Nigerian federal legislation | Historical repository mirror. It is not an authoritative or current consolidated statement of Nigerian law. |

The application reads the repository's README index and retrieves selected Markdown files from that repository. It is an additional research aid, not proof that a provision remains in force.

### Official Nigerian reference portals

These portals are configured as reference destinations. Their inclusion does not mean that every law or judgment on the portal is automatically retrieved or verified.

| Institution | Link | Intended use |
| --- | --- | --- |
| National Assembly of Nigeria | [nass.gov.ng](https://nass.gov.ng/) | Legislative information and materials |
| Federal Ministry of Justice | [justice.gov.ng](https://www.justice.gov.ng/) | Federal justice publications and legal materials |
| Supreme Court of Nigeria | [supremecourt.gov.ng](https://supremecourt.gov.ng/) | Court and judgment reference materials |

The implementation also recognises selected legal-information publishers in its live retrieval allowlist. The exact host allowlist and retrieval rules are maintained in the source code, particularly src/lib/liveLegalSearch.js and src/lib/legalSources.js.

### How source claims are handled

- A search result is a lead, not legal evidence.
- EllaLexi attempts to retrieve the actual page before using it as source text.
- A bill, proposal, announcement or news report must not be presented as an enacted law merely because it is recent.
- Commencement, amendment, repeal and current legal effect are not assumed from a page's publication date.
- Federal law must not be used to infer the law of a Nigerian state.
- If the actual legal text cannot be retrieved, the system should not manufacture a legal finding from a search snippet.

This is an MVP research pipeline, not a complete legal database or a substitute for checking primary legislation, gazettes and binding judgments.

## Logo and visual asset attribution

The current repository favicon is [public/favicon.svg](public/favicon.svg).

- **Asset source:** created directly as an SVG file in this repository.
- **External source repository:** none identified for this SVG.
- **External image URL or icon pack:** none referenced by the SVG file.
- **Format:** inline SVG vector artwork.
- **Colours and geometry:** defined directly in the SVG markup.

The SVG contains a muted light-olive rounded square and a dark stylised letterform. It is a project asset, not a downloaded logo from another GitHub repository. If the logo is later replaced or adapted from a third-party asset, its original creator, source URL, licence and any required attribution should be recorded here.

## Privacy and security

The MVP is designed around temporary document processing:

- No user account or sign-in is required in the current workflow.
- There is no persistent user-document database or document library in this stage.
- Uploaded files are processed temporarily by the serverless routes and temporary files are cleaned up after processing.
- Uploaded documents are not added to the legal-source corpus.
- API keys remain server-side and must not use a VITE_ prefix.
- Provider error details and credentials should not be exposed to the browser.
- Upload validation checks file size and file signatures, not only the filename extension.
- API responses use no-store behaviour where sensitive analysis responses are involved.

Do not upload documents unless you are comfortable processing them through the configured service providers. Temporary processing does not remove the need to understand the privacy and retention policies of the hosting and AI providers.

## Project structure

~~~text
.
├── api/
│   ├── _lib/                 # Shared Gemini and SSE helpers
│   ├── documents/             # Extraction, analysis and follow-up endpoints
│   ├── legal/                 # Legal-source verification endpoint
│   └── health.js              # Health check
├── docs/                      # Architecture and staged implementation notes
├── public/
│   └── favicon.svg            # Project SVG favicon
├── src/
│   ├── components/            # Reusable interface and analysis tools
│   ├── lib/                   # Upload, legal retrieval, SSE, report utilities
│   ├── pages/                 # Application pages
│   └── styles/                 # Application styles
├── .env.example               # Environment variable template
├── package.json
├── vercel.json
└── vite.config.js
~~~

## Run locally

### Requirements

- Node.js compatible with the installed Vite version.
- npm.
- A Gemini API key for real AI analysis and legal-source review.
- Vercel CLI or another Vercel-compatible runtime to exercise the serverless API routes locally.

### Install and start the frontend

~~~bash
git clone https://github.com/joejoe-max/Ellalexi-Ai.git
cd Ellalexi-Ai
npm install
npm run dev
~~~

Vite serves the frontend. **Vite alone does not execute the files in api/.** To test the complete application locally, run it through a Vercel-compatible development runtime, for example:

~~~bash
npx vercel dev
~~~

Configure the environment variables before making API requests.

## Environment configuration

Copy .env.example into the environment configuration used by your local Vercel runtime, or configure the values in the Vercel project settings when a project is connected.

| Variable | Required | Description |
| --- | --- | --- |
| GEMINI_API_KEY | Yes for AI features | Server-side Google Gemini API key |
| GEMINI_MODELS | No | Comma-separated model fallback order; defaults are maintained in api/_lib/gemini.js |

Example:

~~~env
GEMINI_API_KEY=your_server_side_key
# Optional: comma-separated model IDs
GEMINI_MODELS=gemini-3.8-flash,gemini-3.5-flash-lite,gemini-3.1-flash-lite
~~~

Keep the key private. Do not commit a real key, expose it through a VITE_* variable, or include it in client-side code. Confirm that configured model IDs are supported for the Gemini API project and region you use before production deployment.

## Tests and checks

Run the automated checks:

~~~bash
npm run lint
npm run test:run
npm run build
npm audit
~~~

GitHub Actions runs dependency installation, security audit, ESLint, automated tests and the production build on repository changes.

A passing CI run verifies the checks executed in CI. It does not by itself prove that a live Gemini key works, that a deployed serverless endpoint is configured, or that every PDF/DOCX behaves correctly on every device.

## Known limitations

This project is still an MVP. Current limitations include:

- Real Gemini API integration has not yet been validated in a configured production deployment.
- Live legal search may miss relevant materials or be unable to retrieve pages from some publishers.
- The live retrieval pipeline currently skips PDFs and unsupported content types; scanned legal source documents are therefore not comprehensively indexed.
- The historical legislation mirror may be incomplete or out of date.
- The current implementation does not reliably reconcile every principal Act with all subsequent amendments, commencement notices, repeals and judicial interpretations.
- Search and source retrieval do not constitute a complete legal-currentness verification service.
- Follow-up answers use the structured analysis passed by the browser and do not re-process the original upload.
- The MVP has no persistent user accounts, saved document history or multi-user workspace.
- Real-document, device, accessibility and production end-to-end testing remain necessary.

These limitations should be addressed before EllaLexi is relied on for high-stakes legal decisions.

## Disclaimer

EllaLexi AI provides document explanations and source-assisted information for general understanding. It may misunderstand a clause, omit relevant context, retrieve incomplete or outdated legal materials, or produce an incorrect interpretation.

It does not provide a definitive legal opinion, does not guarantee that a document is valid or enforceable, and does not tell users whether they should sign. Have a qualified Nigerian legal practitioner review important documents and unresolved legal questions before acting on them.
