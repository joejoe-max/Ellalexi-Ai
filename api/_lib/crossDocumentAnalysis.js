import {estimateTokens} from "./documentChunker.js";

const GROUPS = ["parties","clauses","rightsAndObligations","risks","moneyMatters","missingProtections","questions"];
const FIELDS = ["name","role","source","heading","documentName","page","quote","plainMeaning","practicalEffect","party","kind","description","title","severity","whoAffected","whyItMatters","item","amount","frequency","notes","protection","scope","question","reason"];
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
  let used = 0;
  let omitted = 0;
  for (const group of GROUPS) {
    for (const raw of Array.isArray(analysis?.[group]) ? analysis[group] : []) {
      const item = compact(raw);
      const documentName = item.documentName;
      if (!documentName) { omitted++; continue; }
      const tokens = estimateTokens(JSON.stringify(item));
      if (used + tokens > maxTokens) { omitted++; continue; }
      (evidence[group] ||= []).push(item);
      (evidenceByDocument[documentName] ||= []).push({ group, ...item });
      used += tokens;
    }
  }
  return { evidence, evidenceByDocument, documentNames: Object.keys(evidenceByDocument), estimatedTokens: used, omitted };
}

const SECTION_LISTS = ["parties","clauses","rightsAndObligations","risks","moneyMatters","missingProtections","questions","limitations"];

export function mergeSectionAnalyses(sections = []) {
  const usable = sections.filter(section => section && typeof section === "object" && !Array.isArray(section));
  if (!usable.length) return null;
  const merged = { ...usable[0], crossDocumentFindings: [] };
  for (const key of SECTION_LISTS) merged[key] = [];
  const seen = Object.fromEntries(SECTION_LISTS.map(key => [key, new Set()]));
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
        const signature = JSON.stringify(item);
        if (seen[key].has(signature)) continue;
        seen[key].add(signature);
        merged[key].push(item);
      }
    }
  }
  merged.documentOverview = overviews.join("\n\n");
  merged.executiveSummary = summaries.join("\n\n");
  return merged;
}

export function validateCrossDocumentFindings(findings = [], comparison = {}) {
  if (!Array.isArray(findings)) return [];
  const byDocument = comparison.evidenceByDocument || {};
  const allowed = new Set(comparison.documentNames || Object.keys(byDocument));
  const accepted = [];
  for (const item of findings) {
    if (!item || typeof item.finding !== "string" || item.finding.trim().length < 20) continue;
    const documents = Array.isArray(item.documents) ? [...new Set(item.documents.filter(name => typeof name === "string" && allowed.has(name)))] : [];
    if (documents.length < 2) continue;
    const citations = Array.isArray(item.evidence) ? item.evidence : [];
    const verified = [];
    let valid = true;
    for (const documentName of documents) {
      const citation = citations.find(entry => entry?.documentName === documentName);
      const quote = normalise(citation?.quote);
      const sourceQuotes = (byDocument[documentName] || []).map(entry => normalise(entry.quote)).filter(Boolean);
      if (quote.length < 12 || !sourceQuotes.some(source => source.includes(quote) || (quote.includes(source) && source.length >= 12))) {
        valid = false;
        break;
      }
      verified.push({ documentName, page: String(citation.page || "not available"), quote: String(citation.quote).slice(0, 420) });
    }
    if (!valid || verified.length !== documents.length) continue;
    accepted.push({
      finding: item.finding.trim().slice(0, 1800),
      documents,
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
