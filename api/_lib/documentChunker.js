const DEFAULT_CHUNK_TOKENS = 2200;
const DEFAULT_OVERLAP_TOKENS = 180;

export function estimateTokens(value) {
  // Conservative, dependency-free estimate for mixed legal prose and identifiers.
  const text = String(value || "");
  if (!text) return 0;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.ceil(Math.max(text.length / 3.5, words * 1.25));
}

function splitLongText(text, maxChars) {
  const pieces = [];
  let rest = String(text || "").trim();
  while (rest.length > maxChars) {
    let cut = rest.lastIndexOf("\n", maxChars);
    if (cut < maxChars * 0.55) cut = rest.lastIndexOf(". ", maxChars);
    if (cut < maxChars * 0.55) cut = maxChars;
    pieces.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) pieces.push(rest);
  return pieces;
}

/**
 * Build chunks without losing document/page provenance. PDF page boundaries are
 * preferred; DOCX text is split on paragraph boundaries. Long individual pages
 * are split with a bounded overlap so clauses spanning a boundary retain context.
 */
export function chunkDocument(doc, options = {}) {
  const targetTokens = Math.max(500, Number(options.targetTokens) || DEFAULT_CHUNK_TOKENS);
  const overlapTokens = Math.max(0, Number(options.overlapTokens) || DEFAULT_OVERLAP_TOKENS);
  const maxChars = Math.floor(targetTokens * 3.2);
  const overlapChars = Math.floor(overlapTokens * 3.2);
  const pages = Array.isArray(doc?.pages) && doc.pages.length
    ? doc.pages.map(page => ({ page: String(page.page), text: String(page.text || "").trim() })).filter(page => page.text)
    : [{ page: "not available", text: String(doc?.text || "").trim() }].filter(page => page.text);

  const chunks = [];
  let current = [];
  let currentChars = 0;
  const flush = () => {
    if (!current.length) return;
    const first = current[0].page;
    const last = current[current.length - 1].page;
    const text = current.map(item => `[Page ${item.page}]\n${item.text}`).join("\n\n");
    chunks.push({ documentId: doc.id || doc.name, documentName: doc.name, startPage: first, endPage: last, text, estimatedTokens: estimateTokens(text), index: chunks.length });
    current = [];
    currentChars = 0;
  };

  for (const page of pages) {
    const pieces = splitLongText(page.text, maxChars);
    for (let i = 0; i < pieces.length; i++) {
      const piece = pieces[i];
      const segment = i ? (pieces[i - 1].slice(-overlapChars) + "\n" + piece) : piece;
      if (current.length && currentChars + segment.length > maxChars) flush();
      current.push({ page: page.page, text: segment });
      currentChars += segment.length;
      if (currentChars >= maxChars * 0.9) flush();
    }
  }
  flush();
  return chunks;
}

export function buildAnalysisBatches(documents, options = {}) {
  return documents.flatMap(doc => chunkDocument(doc, options));
}
