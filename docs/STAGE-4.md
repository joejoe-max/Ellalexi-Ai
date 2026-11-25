# Stage 4 — Live and local Nigerian legal research

## Retrieval design
Stage 4 uses two complementary sources:
1. Live internet research: Gemini 2.5 Flash with Google Search grounding discovers relevant Nigerian legislation, amending Acts, regulations, official gazettes and judgments. EllaLexi then retrieves the actual page from eligible publishers. Search snippets alone are never legal evidence.
2. Local fallback: the configured historical Nigerian federal-law Markdown repository index is searched and retrieved as an additional source. It is explicitly labelled historical and is not treated as the current law.

Live search runs alongside local retrieval. Retrieved sources are merged and passed to Gemini for comparison with the uploaded document.

## Source handling and citations
- Google Search grounding metadata supplies candidate titles and URLs; EllaLexi does not accept URLs invented by the model.
- Live retrieval is restricted to HTTPS Nigerian government/court domains and selected legal information publishers to reduce SSRF risk. PDFs and unsupported content types are skipped rather than treated as retrieved text.
- Each candidate page is fetched directly. Search snippets are not passed as source excerpts.
- Publisher and authority class are derived from the final URL host allowlist.
- The year is extracted from the retrieved title or page text, not guessed from the current year.
- Findings cite source IDs. The API rejects missing source IDs, findings without a year, and numbered section references not found in the retrieved excerpt.
- Citations appear beside each legal finding and link to the retrieved page.
- Live search discovery does not prove a law is in force. Enacted laws must be distinguished from bills, proposals, announcements and news. Commencement, repeal and currentness are not assumed from upload dates.
- If actual legal text cannot be retrieved, no finding is produced from a search snippet.

## Limitations
Google Search grounding can miss relevant materials. Some government portals block automated retrieval, some primary materials are PDF scans, and this MVP skips PDFs rather than OCRing them. The allowlist is conservative; relevant material on an unlisted host may be missed. Federal law must not be used to infer state law.

The historical GitHub repository is a fallback only. It is not the latest or authoritative statement of Nigerian law.

## Configuration
The existing server-side GEMINI_API_KEY enables document analysis and Google Search grounding. Never expose it through a VITE_ variable. Gemini File Search, persistent vector store, embeddings and licensing audit remain deferred.

## Testing
Automated tests cover URL allowlisting, duplicate removal, no-key behaviour, full-page retrieval and rejection of non-allowlisted hosts. Live provider requests are mocked in CI. A real Gemini-grounded request and live Vercel test still require a configured API key and deployment.
