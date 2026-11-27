import {estimateTokens} from "./documentChunker.js";

const GROUPS = ["parties","clauses","rightsAndObligations","risks","moneyMatters","missingProtections","questions"];
const FIELDS = ["name","role","source","heading","documentId","documentLabel","documentName","page","quote","plainMeaning","practicalEffect","party","kind","description","title","severity","whoAffected","whyItMatters","item","amount","frequency","notes","protection","scope","question","reason"];
const compact = item => {
  const value = {};
  for (const key of FIELDS) {
    if (item?.[key] !== undefined && item[key] !== null && String(item[key]).trim()) value[key] = String(item[key]).slice(0, 420);
  }
  return value;
};
const normalise = value => String(value || "").normalize("NFKC").toLowerCase().replace(/[“”‘’]/g, "'").replace(/\s+/g, " ").trim();

export function buildCrossDocumentEvidence(analysis, options = {}) {
  const requested = Number(options.maxTokens);
  const maxTokens = Math.max(500, Number.isFinite(requested) && requested > 0 ? requested : 2400);
  const evidence = {};
  const evidenceByDocument = {};
  const namesById = new Map();
  let used = 0;
  let omitted = 0;

  for (const group of GROUPS) {
    for (const raw of Array.isArray(analysis?.[group]) ? analysis[group] : []) {
      const item = compact(raw);
      const documentId = item.documentId;
      if (!documentId || !item.documentName || raw?.evidenceStatus !== "verified" || !item.quote) {
        omitted++;
        continue;
      }
      const tokens = estimateTokens(JSON.stringify(item));
      if (used + tokens > maxTokens) {
        omitted++;
        continue;
      }
      (evidence[group] ||= []).push(item);
      (evidenceByDocument[documentId] ||= []).push({ group, ...item });
      namesById.set(documentId, item.documentLabel || item.documentName);
      used += tokens;
    }
  }

  return {
    evidence,
    evidenceByDocument,
    documentIds: Object.keys(evidenceByDocument),
    documentNames: [...namesById.values()],
    estimatedTokens: used,
    omitted
  };
}

const SECTION_LISTS = ["parties","clauses","rightsAndObligations","risks","moneyMatters","missingProtections","questions","limitations"];

export function mergeSectionAnalyses(sections = []) {
  const usable = sections.filter(section => section && typeof section === "object" && !Array.isArray(section));
  if (!usable.length) return null;
  const merged = { ...usable[0], crossDocumentFindings: [] };
  for (const key of SECTION_LISTS) merged[key] = [];
  const seenExact = Object.fromEntries(SECTION_LISTS.map(key => [key, new Set()]));
  const overviews = [];
  const summaries = [];
  const readable = value => String(value || "").replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\r\n/g, "\n").trim();

  for (const section of usable) {
    const overview = readable(section.documentOverview);
    const summary = readable(section.executiveSummary);
    if (overview) overviews.push(overview);
    if (summary) summaries.push(summary);
    for (const key of SECTION_LISTS) {
      if (!Array.isArray(section[key])) continue;
      for (const item of section[key]) {
        const exact = JSON.stringify(item);
        if (seenExact[key].has(exact)) continue;
        seenExact[key].add(exact);
        merged[key].push(item);
      }
    }
  }
  merged.documentOverview = overviews.join("\n\n");
  merged.executiveSummary = summaries.join("\n\n");
  return merged;
}

/**
 * After section merge, optionally run a lightweight deterministic cleanup
 * that collapses near-identical overviews when they clearly describe the same document.
 */
export function consolidateDocumentNarratives(analysis, { documentNames = [] } = {}) {
  if (!analysis || typeof analysis !== "object") return analysis;
  const names = documentNames.length ? documentNames : [...new Set((analysis.clauses || []).map(c => c.documentName).filter(Boolean))];
  if (names.length === 1) {
    const overview = String(analysis.documentOverview || "");
    const parts = overview.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
    if (parts.length > 1) {
      const unique = [];
      const seen = new Set();
      for (const part of parts) {
        const key = normalise(part).slice(0, 120);
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(part);
      }
      analysis.documentOverview = unique.join("\n\n");
    }
    const summary = String(analysis.executiveSummary || "");
    const sParts = summary.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
    if (sParts.length > 1) {
      const unique = [];
      const seen = new Set();
      for (const part of sParts) {
        const key = normalise(part).slice(0, 120);
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(part);
      }
      analysis.executiveSummary = unique.join("\n\n");
    }
  }
  return analysis;
}

export function validateCrossDocumentFindings(findings = [], comparison = {}) {
  if (!Array.isArray(findings)) return [];
  const byDocument = comparison.evidenceByDocument || {};
  const allowedIds = new Set(comparison.documentIds || Object.keys(byDocument));
  const accepted = [];

  for (const item of findings) {
    if (!item || typeof item.finding !== "string" || item.finding.trim().length < 20) continue;
    const documentIds = Array.isArray(item.documentIds)
      ? [...new Set(item.documentIds.filter(id => typeof id === "string" && allowedIds.has(id)))]
      : [];
    if (documentIds.length < 2) continue;

    const citations = Array.isArray(item.evidence) ? item.evidence : [];
    const verified = [];
    let valid = true;

    for (const documentId of documentIds) {
      const citation = citations.find(entry => entry?.documentId === documentId);
      const quote = normalise(citation?.quote);
      const page = String(citation?.page || "not available");
      const sourceEntries = byDocument[documentId] || [];
      const matchedSource = sourceEntries.find(source =>
        String(source.page || "not available") === page &&
        quote.length >= 12 &&
        normalise(source.quote) === quote
      );
      if (!matchedSource) {
        valid = false;
        break;
      }
      verified.push({
        documentId,
        documentName: matchedSource.documentLabel || matchedSource.documentName,
        page,
        quote: String(matchedSource.quote).slice(0, 420)
      });
    }

    if (!valid || verified.length !== documentIds.length) continue;
    accepted.push({
      finding: item.finding.trim().slice(0, 1800),
      documentIds,
      documents: verified.map(entry => entry.documentName),
      significance: String(item.significance || "Requires review").slice(0, 500),
      evidence: verified
    });
  }
  return mergeCrossDocumentFindings([], accepted);
}

export function mergeCrossDocumentFindings(existing = [], additions = []) {
  const seen = new Set();
  return [...existing, ...additions].filter(item => {
    const docs = Array.isArray(item?.documents) ? item.documents.slice().sort().join("|") : "";
    const key = [normalise(item?.finding), docs, normalise(item?.significance)].join("::");
    if (!item?.finding || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
