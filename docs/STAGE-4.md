# Stage 4 — Nigerian Legal Knowledge Base and Retrieval

## Implemented
- Separate legal-source registry; user agreements are never ingested into this persistent store.
- Mandatory provenance, jurisdiction, document type, publication/effective dates, legal status, verification date and reuse/permission metadata.
- Approval gate rejects missing metadata, unapproved sources, invalid statuses and permission-required material without recorded permission.
- Gemini File Search ingestion with source metadata and controlled chunking.
- POST /api/legal/verify retrieves from the configured legal store and returns structured legal comparisons, limitations and inspectable source passages.
- Upload analysis invokes legal verification as a separate section when configured. If the store is not configured, document analysis remains available and legal review is marked unavailable.
- Legal findings separate document positions from legal positions. Currentness is not assumed.

## Configuration
- GEMINI_API_KEY: server-side Gemini API key.
- GEMINI_LEGAL_STORE: existing Gemini File Search store resource name, e.g. fileSearchStores/....
- Keep both values server-side; never use VITE_ prefixes.

## Populate the library
Review legal-library/README.md and manifest.example.json. Put approved source documents under legal-library/, create manifest.json, complete evidence fields and explicitly approve each source. Run npm run legal:ingest with both environment variables. Inspect indexed documents and test retrieval before enabling the store in production.

No Nigerian statute, judgment or secondary-source document has been silently added in this commit. Public availability is not proof of reuse permission, currentness or legal authority. The initial manifest is intentionally empty.

## Limitations
A real corpus still needs to be sourced, permission-checked, reviewed and indexed. File Search results are not automatically authoritative or current. State-specific law, commencement, amendments, repeals and case-law treatment depend on corpus quality. Actual Gemini retrieval requires the API key and configured store and cannot be exercised in CI without them.
