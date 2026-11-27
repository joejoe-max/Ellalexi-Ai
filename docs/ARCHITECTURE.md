# Architecture

EllaBrief is a document-grounded legal intelligence MVP. Uploaded documents are processed temporarily; no user account, persistent user-document store, embeddings database or model file-search store is required.

## Request flow
1. React/Vite uploads PDF or DOCX to the Vercel API.
2. PDF.js extracts selectable text page-by-page. Mammoth extracts DOCX text.
3. A page-level text-quality check identifies only PDF pages that lack meaningful selectable text.
4. Gemini Flash-Lite OCR is used only for those scanned pages. If all configured Gemini OCR models fail, Tesseract.js with the Node canvas renderer is attempted as a local fallback.
5. Extracted/OCR text is passed to the reasoning layer; original PDFs are not sent to a reasoning model.
6. Groq is the primary reasoning provider for analysis, follow-up answers and legal-source comparison. Configured Groq models are tried in order. gpt-oss models default to low reasoning effort so structured extraction spends tokens on the answer rather than a long hidden trace. Strict JSON schema is requested first. If Groq returns `json_validate_failed` or rejects the schema, the same model is retried with JSON-object mode and the existing local response validator. A failed model does not stop the remaining Groq models.
7. OpenRouter is the provider-wide reasoning fallback when Groq is not configured, rate-limited, unable to produce valid JSON, or its credentials are rejected. OpenRouter is asked for a JSON object, then for plain text that is still checked by the local validator. The default model setting uses OpenRouter's free router; model availability and free routing are controlled by OpenRouter and are not guaranteed. Each attempt logs provider, model, stage, format, status and token estimates only — never keys, prompts or document text.
8. Legal discovery is a separate Groq browser-search workflow using dedicated search models. Search snippets are discovery only. EllaBrief fetches the full source page before treating it as evidence.
9. The historical Nigerian federal-law repository is a supplementary fallback when live search is unavailable. It is clearly labelled historical and cannot establish current law.
10. Retrieved excerpts and metadata are compared with the document analysis using structured reasoning output. Currentness, commencement, repeal and amendment effect are never assumed from upload dates or snippets.

## Provider and cost boundaries
- Gemini is not used for analysis, chat or legal reasoning; it is OCR-only.
- Groq model failover can help with model-specific limits, but models may still share organisation-level quotas.
- OpenRouter's free router may select only models/providers currently available under its own free policy. A free model does not guarantee uptime or unlimited use.
- Groq browser search is a separate tool workflow and may have its own provider limits. No external search API with a paid or credit-based quota is silently enabled.
- If Groq search is unavailable, historical local reference material may be used. There is no guaranteed independent, unlimited, free live-web-search provider in this architecture.
- If all reasoning providers are unavailable, new AI actions fail with a neutral retry message. Previously completed review data remains available in the current browser session.

## Safety boundaries
- API keys stay server-side.
- Uploaded documents are untrusted source material, never instructions.
- Search snippets are discovery only, never legal evidence.
- Live pages are restricted to an HTTPS host allowlist; redirects are revalidated before retrieval.
- The historical local repository is not proof of current consolidated Nigerian law.
- No legal conclusion is made without retrieved source text.
- Currentness, commencement, repeal and amendment effect are not assumed.
- Uploaded user documents are not added to the legal source corpus.

## Document analysis integrity and execution limits

- Each source page is split into bounded chunks. A small tail is repeated only at the start of the next chunk when a long page is split; overlap is never inserted into the middle of an already accumulated chunk. A real page boundary does not create artificial overlap.
- Every chunk retains the exact uploaded filename and page range. Section-level passes analyse one section only and their cross-document claims are discarded during assembly.
- Summary sections are joined with actual paragraph separators. Escaped newline sequences returned as text are normalized before the UI renders summaries with preserved whitespace.
- Cross-document comparison is a separate final pass. A result is shown only if it names at least two distinct uploaded filenames and supplies an exact quote from each document that matches the extracted evidence included in that comparison. Unsupported names, one-document claims, and invented/mismatched quotes are rejected.
- The current Vercel route is deliberately synchronous and has no durable job queue or shared job store. It therefore accepts at most six analysis sections and enforces one 52-second processing deadline shared across PDF extraction, scanned-page OCR and Groq/OpenRouter failover attempts. Larger uploads are rejected before AI analysis rather than being left to time out or returned partially. This is a safety bound, not background processing.
- A future increase in document size requires durable asynchronous jobs: persist the job and section results, process with bounded concurrency and retry policy, expose progress, and assemble only after every required section is complete. Do not raise the section limit or rely on longer per-provider timeouts as a substitute.
