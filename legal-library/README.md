# Nigerian legal knowledge base

This folder is the controlled source registry for the persistent legal retrieval index. It is separate from user-uploaded agreements.

Public availability or a public GitHub repository does not itself grant permission to reproduce, index or use material in a commercial AI product. Review the repository licence and underlying document rights separately. Do not ingest PLAC-hosted materials unless required permission is obtained; its published terms restrict software/AI use without permission.

Prefer official government or court publications where available. The Federal Ministry of Justice identifies its Department of Law Reporting and Publication as an official publication arm. National Assembly materials help establish legislative provenance, but a bill is not an enacted Act.

Every entry records exact title, document type, jurisdiction, source URL and publisher, publication/effective dates, legal status, verification date and licence/permission basis. For amended legislation, include the principal Act and each verified amendment separately. Do not call a consolidated text current unless checked against official amendments and commencement information. Case law should include court, case name, citation, decision date and source.

## Ingestion
1. Put approved source files inside this directory.
2. Copy manifest.example.json to manifest.json and complete metadata.
3. Set GEMINI_API_KEY and GEMINI_LEGAL_STORE locally.
4. Run npm run legal:ingest.
5. Inspect indexed documents and test retrieval before enabling the store in the deployed app.

The script refuses unapproved or incomplete sources. Never commit API keys or confidential agreements. The example manifest is intentionally unapproved; no source is silently indexed.
