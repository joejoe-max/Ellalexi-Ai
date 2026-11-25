# Stage 2 — Upload & Document Processing

- Multiple PDF/DOCX uploads per request.
- Maximum 5 files, 10 MB each, 25 MB combined; PDF limit 150 pages.
- Server validates multipart requests, file signatures and actual file content.
- PDF.js extracts selectable PDF text with page markers; Mammoth extracts DOCX text.
- Scanned/image-only PDFs are explicitly marked `needs_ocr`; OCR/document vision is deferred to Stage 3.
- Corrupt, empty, unsupported and failed documents receive per-file statuses.
- Temporary upload files are removed in a `finally` cleanup path. No user document is stored in a database or legal retrieval index.
- UI supports browse, drag/drop, multi-select, remove, validation, processing state and result display.

## API

`POST /api/documents/extract`, multipart form field `documents`. Returns per-file status and extracted text for files ready for analysis.

## Boundary and privacy

This stage extracts text only; it does not interpret legal meaning. The application cleans up its temporary files, but cannot promise deletion from provider infrastructure beyond its own cleanup behavior. Scanned PDF OCR belongs to the AI analysis stage.