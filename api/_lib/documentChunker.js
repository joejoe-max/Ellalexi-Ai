const DEFAULT_CHUNK_TOKENS = 2200;
const DEFAULT_OVERLAP_TOKENS = 180;

export function estimateTokens(value) {
  const text = String(value || "");
  if (!text) return 0;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.ceil(Math.max(text.length / 3.5, words * 1.25));
}

function splitLongText(value, maxChars) {
  const pieces = [];
  let rest = String(value || "").trim();
  while (rest.length > maxChars) {
    let cut = rest.lastIndexOf("\n", maxChars);
    if (cut < maxChars * 0.55) {
      const sentenceCut = rest.lastIndexOf(". ", maxChars);
      if (sentenceCut >= maxChars * 0.55) cut = sentenceCut + 1;
    }
    if (cut < maxChars * 0.55) cut = maxChars;
    const piece = rest.slice(0, cut).trim();
    const next = rest.slice(cut).trim();
    if (!piece || next.length >= rest.length) {
      pieces.push(rest.slice(0, maxChars).trim());
      rest = rest.slice(maxChars).trim();
    } else {
      pieces.push(piece);
      rest = next;
    }
  }
  if (rest) pieces.push(rest);
  return pieces;
}

/**
 * Split a document into bounded evidence sections. Source text appears once in
 * its owning chunk; only an explicit bounded tail is repeated at a same-page
 * chunk boundary. Page provenance is retained for every segment.
 */
export function chunkDocument(doc, options = {}) {
  const configuredTarget = Number(options.targetTokens);
  const configuredOverlap = Number(options.overlapTokens);
  const targetTokens = Math.max(500, Number.isFinite(configuredTarget) && configuredTarget > 0 ? configuredTarget : DEFAULT_CHUNK_TOKENS);
  const overlapTokens = Math.max(0, Number.isFinite(configuredOverlap) ? configuredOverlap : DEFAULT_OVERLAP_TOKENS);
  const maxChars = Math.floor(targetTokens * 3.2);
  const overlapChars = Math.floor(overlapTokens * 3.2);
  const pages = Array.isArray(doc?.pages) && doc.pages.length
    ? doc.pages.map(page => ({ page: String(page.page ?? "not available"), text: String(page.text || "").trim() })).filter(page => page.text)
    : [{ page: "not available", text: String(doc?.text || "").trim() }].filter(page => page.text);

  const chunks = [];
  let current = [];
  let currentChars = 0;

  const flush = () => {
    if (!current.length) return;
    const first = current[0].page;
    const last = current[current.length - 1].page;
    const text = current.map(item => {
      const overlap = item.overlap ? item.overlap + "\n" : "";
      return "[Page " + item.page + "]\n" + overlap + item.text;
    }).join("\n\n");
    chunks.push({
      documentId: doc.id || doc.name,
      documentName: doc.name,
      startPage: first,
      endPage: last,
      text,
      estimatedTokens: estimateTokens(text),
      index: chunks.length,
      overlapFromPrevious: Boolean(current[0].overlap)
    });
    current = [];
    currentChars = 0;
  };

  for (const page of pages) {
    const pieceLimit = Math.max(1, maxChars - overlapChars - 24);
    const pieces = splitLongText(page.text, overlapChars > 0 ? pieceLimit : maxChars);
    for (let index = 0; index < pieces.length; index++) {
      const piece = pieces[index];
      let overlap = "";

      if (current.length && currentChars + piece.length + 16 > maxChars) {
        const previous = current[current.length - 1];
        flush();
        if (previous.page === page.page && overlapChars > 0) {
          overlap = previous.text.slice(-Math.min(overlapChars, Math.max(0, maxChars - piece.length - 24))).trim();
        }
      }

      // A 90%-threshold flush leaves no current chunk to carry context. Add
      // the previous piece once, and only for another piece on the same page.
      if (!current.length && index > 0 && !overlap && overlapChars > 0) {
        const previousPiece = pieces[index - 1];
        overlap = previousPiece.slice(-Math.min(overlapChars, Math.max(0, maxChars - piece.length - 24))).trim();
      }

      current.push({ page: page.page, text: piece, overlap });
      currentChars += piece.length + overlap.length + 16;
      if (currentChars >= maxChars * 0.9 && index < pieces.length - 1) flush();
    }
  }

  flush();
  return chunks;
}

export function buildAnalysisBatches(documents, options = {}) {
  return documents.flatMap(doc => chunkDocument(doc, options));
}
