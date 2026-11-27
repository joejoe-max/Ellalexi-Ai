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

export function mergeCrossDocumentFindings(existing = [], additions = []) {
  const seen = new Set();
  return [...existing, ...additions].filter(item => {
    const key = [item?.finding,item?.documents?.join("|"),item?.significance].join("::").toLowerCase();
    if (!item?.finding || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
