# Architecture

EllaBrief is a document-grounded legal intelligence MVP. Uploaded documents are processed temporarily; no user account, persistent user-document store, embeddings database or Gemini File Search store is required for this stage.

## Request flow
1. React/Vite uploads PDF or DOCX to the Vercel API.
2. Server-side extraction and Gemini 2.5 Flash produce structured document analysis.
3. The active analysis workspace presents a plain-English overview, document inventory, clauses, rights/obligations, risks, money terms, missing protections, questions, cross-document findings and limitations.
4. `POST /api/legal/verify` performs live Nigerian legal web discovery through Gemini Google Search grounding and retrieves actual eligible source pages.
5. In parallel, the historical local Nigerian federal-law index is searched as an additional source.
6. Retrieved excerpts and metadata are passed to Gemini for comparison.
7. The browser displays source-assisted legal findings with citations beside each finding.

## Workspace
- Navigation is contextual to the active analysis and only links to populated sections.
- Document quotations retain their source document/page and code-checked quote status.
- Empty categories are omitted; no arbitrary risk score is displayed.
- Questions and limitations remain part of the current analysis, not separate global destinations.

## Safety boundaries
- API keys stay server-side.
- Search snippets are discovery only, never legal evidence.
- Live pages are restricted to an HTTPS host allowlist.
- The historical local repository is not proof of current law.
- No legal conclusion is made without retrieved source text.
- Currentness, commencement, repeal and amendment effect are not assumed from upload dates.
- Uploaded user documents are not added to the legal source corpus.
