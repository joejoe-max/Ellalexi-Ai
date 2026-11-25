import { RETRIEVABLE_LEGAL_SOURCES } from "./legalSources.js";

const STOP_WORDS = new Set(["about","after","also","among","and","any","are","been","being","between","can","could","does","for","from","has","have","into","its","may","more","must","not","of","on","or","other","our","shall","should","that","the","their","there","these","this","those","through","under","was","were","what","when","where","which","who","will","with","would","agreement","document","party","parties","clause","terms","provision"]);
const INDEX_TIMEOUT_MS = 12000;
const DOCUMENT_TIMEOUT_MS = 15000;
const MAX_INDEX_CHARS = 150000;
const MAX_DOCUMENT_CHARS = 250000;
const MAX_EXCERPT_CHARS = 14000;
const INDEX_CACHE_TTL_MS = 5 * 60 * 1000;
const indexCache = new Map();

function normalizeTerm(word) {
  if (word.endsWith("ies") && word.length > 4) return word.slice(0, -3) + "y";
  if (word.endsWith("s") && !word.endsWith("ss") && word.length > 4) return word.slice(0, -1);
  return word;
}

function terms(value) {
  return [...new Set((String(value || "").toLowerCase().match(/[a-z0-9]{3,}/g) || [])
    .map(normalizeTerm))].filter(word => !STOP_WORDS.has(word));
}

function isAllowedDocumentUrl(url, baseUrl) {
  try {
    const parsed = new URL(url);
    const base = new URL(baseUrl);
    return parsed.protocol === "https:" &&
      parsed.hostname === "raw.githubusercontent.com" &&
      parsed.origin === base.origin &&
      parsed.pathname.startsWith(base.pathname) &&
      parsed.pathname.endsWith(".md");
  } catch {
    return false;
  }
}

export function parseLegalIndex(markdown, baseUrl) {
  const links = [];
  const pattern = /^\s*[-*+]\s+\[([^\]]+)\]\(([^)]+)\)/gm;
  let match;
  while ((match = pattern.exec(String(markdown || "").slice(0, MAX_INDEX_CHARS)))) {
    const href = match[2].trim().replace(/^<|>$/g, "");
    if (!href.startsWith("./") || !href.toLowerCase().endsWith(".md")) continue;
    let url;
    try { url = new URL(href.slice(2), baseUrl).toString(); } catch { continue; }
    if (!isAllowedDocumentUrl(url, baseUrl)) continue;
    links.push({ title: match[1].replace(/\s+/g, " ").trim(), url });
  }
  return links;
}

export function rankLegalDocuments(documents, query, limit = 4) {
  const queryTerms = terms(query);
  if (!queryTerms.length) return [];
  return documents.map(document => {
    const titleTerms = new Set(terms(document.title));
    const bodyTerms = new Set(terms(document.text));
    const matchedTitle = queryTerms.filter(term => titleTerms.has(term)).length;
    const matchedBody = queryTerms.filter(term => bodyTerms.has(term)).length;
    const score = matchedTitle * 5 + matchedBody;
    return { ...document, score, matchedTitle, matchedBody };
  }).filter(document => document.score > 0)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, Math.max(0, limit));
}

async function readLimited(response, maxChars) {
  const declared = Number(response.headers?.get?.("content-length") || 0);
  if (declared > maxChars * 4) throw new Error("Source document exceeds the retrieval size limit.");
  const text = await response.text();
  if (text.length > maxChars) throw new Error("Source document exceeds the retrieval size limit.");
  return text;
}

async function fetchIndex(source, fetchImpl, useCache) {
  const cached = useCache ? indexCache.get(source.indexUrl) : null;
  if (cached && cached.expiresAt > Date.now()) return cached.text;
  const response = await fetchImpl(source.indexUrl, { signal: AbortSignal.timeout(INDEX_TIMEOUT_MS) });
  if (!response.ok) throw new Error("Index returned HTTP " + response.status);
  const text = await readLimited(response, MAX_INDEX_CHARS);
  if (useCache) indexCache.set(source.indexUrl, { text, expiresAt: Date.now() + INDEX_CACHE_TTL_MS });
  return text;
}

function stripMarkdown(value) {
  return String(value || "").replace(/\r/g, "")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/[*_`>]/g, "")
    .replace(/\n{3,}/g, "\n\n").trim();
}

export async function retrieveLegalSources(query, { fetchImpl = fetch, maxDocuments = 4 } = {}) {
  const collected = [];
  const warnings = [];
  for (const source of RETRIEVABLE_LEGAL_SOURCES) {
    try {
      const index = await fetchIndex(source, fetchImpl, fetchImpl === fetch);
      const candidates = parseLegalIndex(index, source.baseUrl);
      const selected = rankLegalDocuments(candidates, query, maxDocuments);
      const docs = await Promise.all(selected.map(async item => {
        if (!isAllowedDocumentUrl(item.url, source.baseUrl)) return null;
        try {
          const response = await fetchImpl(item.url, { signal: AbortSignal.timeout(DOCUMENT_TIMEOUT_MS) });
          if (!response.ok) return null;
          const text = stripMarkdown(await readLimited(response, MAX_DOCUMENT_CHARS)).slice(0, MAX_EXCERPT_CHARS);
          return text ? {
            title: item.title, url: item.url, publisher: source.publisher,
            jurisdiction: source.jurisdiction, sourceName: source.name,
            status: source.status, excerpt: text
          } : null;
        } catch {
          return null;
        }
      }));
      collected.push(...docs.filter(Boolean));
    } catch {
      warnings.push("Could not retrieve the historical federal-law repository index. No legal conclusion should be drawn from unavailable sources.");
    }
  }
  return {
    sources: collected,
    warnings,
    sourceCatalog: RETRIEVABLE_LEGAL_SOURCES.map(({ name, url, status, jurisdiction }) => ({ name, url, status, jurisdiction }))
  };
}
