# Stage 5 — Analysis workspace

## User experience
- The upload and analysis flow remains one continuous experience: Upload → Analysis.
- Analysis is presented in the active upload workspace; there are no separate global workspace or report destinations.
- A compact, horizontally scrollable in-page index links to sections that actually contain results.
- The overview includes the plain-English explanation and the list of documents included, with extraction and page metadata.
- Findings retain their source quotation, document name and page where available, plus the quote-verification state.
- The workspace presents parties, clauses, rights and obligations, issues, financial terms, possible missing protections, generated questions, cross-document findings and limitations.
- Empty categories are omitted rather than filled with invented or placeholder content.
- Multi-document findings remain grouped in the same workspace.

## Evidence and boundaries
- Document-grounded quotations are marked as checked, unverified or not verifiable for scanned PDFs.
- No overall legal-risk score is invented.
- Legal source review remains a separate, clearly labelled panel with inline citations from Stage 4.
- This workspace explains uploaded text; it does not recommend signing or not signing and does not replace a Nigerian legal practitioner.

## Automated tests
The analysis workspace navigation tests verify that links reflect populated result categories, tolerate missing/malformed fields and include cross-document navigation only when findings exist.

## Remaining validation
The workspace still needs real-device review with representative PDF/DOCX agreements and multi-document sets after deployment. Stage 7 covers release-level testing and deployment.
