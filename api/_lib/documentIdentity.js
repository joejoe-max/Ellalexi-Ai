/**
 * Stable document identity helpers.
 * Document is the primary entity; chunks are internal evidence units only.
 */

import { createHash, randomUUID } from "node:crypto";

/**
 * Create a stable document identity for an uploaded file.
 * Prefer a content-aware hash when a buffer is available so the same file
 * uploaded again in the same session keeps a recognisable identity.
 */
export function createDocumentId({ name, size, buffer } = {}) {
  if (buffer && buffer.length) {
    const digest = createHash("sha256").update(buffer).update(String(size ?? buffer.length)).digest("hex").slice(0, 16);
    const safeName = String(name || "document").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 48);
    return `doc_${digest}_${safeName}`;
  }
  return `doc_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

/**
 * Normalise a document or section display name for matching.
 */
export function normaliseDocumentName(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[“”‘’]/g, "'")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Build a short correlation context for logs (no document text).
 */
export function correlationContext({ requestId, documentId, documentName, sectionIndex, sectionCount, stage } = {}) {
  return {
    requestId: requestId || null,
    documentId: documentId || null,
    documentName: documentName ? String(documentName).slice(0, 120) : null,
    sectionIndex: Number.isFinite(sectionIndex) ? sectionIndex : null,
    sectionCount: Number.isFinite(sectionCount) ? sectionCount : null,
    stage: stage || null
  };
}
