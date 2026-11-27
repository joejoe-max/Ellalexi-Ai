import {estimateTokens} from "./documentChunker.js";

const GROUPS = ["parties","clauses","rightsAndObligations","risks","moneyMatters","missingProtections","questions"];
const compact = item => {
  const value = {};
  for (const key of ["name","role","source","heading","documentName","page","quote","plainMeaning","practicalEffect","party","kind","description","title","severity","whoAffected","whyItMatters","item","amount","frequency","notes","protection","scope","question","reason"]) {
    if (item?.[key] !== undefined && item[key] !== null && String(item[key]).trim()) value[key] = String(item[key]).slice(0, 420);
  }
  return value;
};

/** Create a bounded, provenance-preserving comparison payload from per-document findings. */
export function buildCrossDocumentEvidence(analysis, options = {}) {
  const maxTokens = Math.max(500, Number(options.maxTokens) || 2400);
  const output = {};
  let used = 0;
  for (const group of GROUPS) {
    const items = Array.isArray(analysis?.[group]) ? analysis[group] : [];
    const selected = [];
    for (const item of items) {
      const candidate = compact(item);
      const tokens = estimateTokens(JSON.stringify(candidate));
      if (used + tokens > maxTokens) continue;
      selected.push(candidate);
      used += tokens;
    }
    if (selected.length) output[group] = selected;
  }
  return { evidence: output, estimatedTokens: used, omitted: GROUPS.reduce((sum,key)=>sum+(analysis?.[key]?.length||0)-(output[key]?.length||0),0) };
}

const SECTION_LISTS = ["parties","clauses","rightsAndObligations","risks","moneyMatters","missingProtections","questions","limitations"];

/**
 * Combine per-section analyses. Section passes do not see the other documents,
 * so their cross-document claims are discarded and left for the comparison pass.
 */
export function mergeSectionAnalyses(sections = []) {
  const usable = sections.filter(section => section && typeof section === "object" && !Array.isArray(section));
  if (!usable.length) return null;
  const merged = { ...usable[0], crossDocumentFindings: [] };
  for (const key of SECTION_LISTS) merged[key] = [];
  const overviews = [];
  const summaries = [];
  for (const section of usable) {
    if (typeof section.documentOverview === "string" && section.documentOverview.trim()) overviews.push(section.documentOverview.trim());
    if (typeof section.executiveSummary === "string" && section.executiveSummary.trim()) summaries.push(section.executiveSummary.trim());
    for (const key of SECTION_LISTS) {
      if (Array.isArray(section[key])) merged[key].push(...section[key]);
    }
  }
  merged.documentOverview = overviews.join("\n\n");
  merged.executiveSummary = summaries.join("\n\n");
  return merged;
}

export function mergeCrossDocumentFindings(existing = [], additions = []) {
  const seen = new Set();
  return [...existing, ...additions].filter(item => {
    const key = [item?.finding,item?.documents?.join("|"),item?.significance].join("::").toLowerCase();
    if (!item?.finding || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
