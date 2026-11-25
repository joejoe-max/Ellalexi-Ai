# Stage 4 — MVP Nigerian legal-source retrieval

## MVP decision
Gemini File Search and a persistent legal knowledge store are deferred. The MVP uses a replaceable source-retrieval module and a small configured source registry. No File Search store or GEMINI_LEGAL_STORE is required.

## Current retrieval path
- `src/lib/legalSources.js` lists the source catalogue.
- `src/lib/legalSourceRetrieval.js` fetches the historical Nigerian federal-law Markdown index, ranks legislation titles against document-analysis terms and retrieves a small number of matching texts.
- `POST /api/legal/verify` sends the retrieved excerpts and compact document analysis to Gemini 2.5 Flash.
- The model must cite supplied source IDs. The API rejects findings that cite missing source IDs.
- User-uploaded agreements are not added to the source catalogue or retained.

## Source limitations
The initial searchable repository is a historical federal-law collection. It is useful for MVP workflow testing, not proof of current Nigerian law. Its index includes material of different ages and must not be presented as a complete, current or authoritative consolidated code. State legislation and judgments are not yet automatically searchable. Official National Assembly, Federal Ministry of Justice and Supreme Court portals are listed as reference destinations but are not yet crawled or queried.

If relevant text cannot be retrieved, EllaLexi must say so. It must not fill the gap with general model knowledge. Currentness, amendments, repeal, commencement and state-specific applicability remain unresolved unless verified from the retrieved source itself.

## Configuration
Only `GEMINI_API_KEY` is needed for AI analysis and legal-source comparison. Keep it server-side; never use a VITE_ prefix. Gemini File Search configuration and ingestion scripts are deferred until a later upgrade.

## Upgrade path
The `retrieveLegalSources` interface is isolated from the verification endpoint. It can later be replaced or extended with Gemini File Search or another retrieval backend without changing the analysis UI contract.
