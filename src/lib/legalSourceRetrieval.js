import { RETRIEVABLE_LEGAL_SOURCES } from "./legalSources.js";

const STOP_WORDS = new Set(["about","after","also","among","and","any","are","been","being","between","can","could","does","for","from","has","have","into","its","may","more","must","not","of","on","or","other","our","shall","should","that","the","their","there","these","this","those","through","under","was","were","what","when","where","which","who","will","with","would"]);

function terms(value) {
  return [...new Set(String(value || "").toLowerCase().match(/[a-z0-9]{3,}/g) || [])].filter(word => !STOP_WORDS.has(word));
}

export function parseLegalIndex(markdown, baseUrl) {
  const links = [];
  const pattern = /^\s*- \[([^\]]+)\]\((\.\/[^)]+\.md)\)/gm;
  let match;
  while ((match = pattern.exec(String(markdown || "")))) {
    const relative = match[2].replace(/^\.\//, "");
    links.push({
      title: match[1].replace(/\s+/g, " ").trim(),
      url: new URL(relative, baseUrl).toString()
    });
  }
  return links;
}

export function rankLegalDocuments(documents, query, limit = 4) {
  const queryTerms = terms(query);
  if (!queryTerms.length) return [];
  return documents.map(document => {
    const titleTerms = terms(document.title);
    const bodyTerms = new Set(terms(document.text));
    const score = queryTerms.reduce((total, term) => total + (titleTerms.includes(term) ? 4 : 0) + (bodyTerms.has(term) ? 1 : 0), 0);
    return { ...document, score };
  }).filter(document => document.score > 0).sort((a,b) => b.score-a.score).slice(0,limit);
}

function stripMarkdown(value) {
  return String(value || "").replace(/\r/g,"").replace(/!\[([^\]]*)\]\([^)]+\)/g,"$1").replace(/\[([^\]]+)\]\([^)]+\)/g,"$1").replace(/^#{1,6}\s*/gm,"").replace(/[*_`>]/g,"").replace(/\n{3,}/g,"\n\n").trim();
}

export async function retrieveLegalSources(query, { fetchImpl = fetch, maxDocuments = 4 } = {}) {
  const collected = [];
  const warnings = [];
  for (const source of RETRIEVABLE_LEGAL_SOURCES) {
    try {
      const indexResponse = await fetchImpl(source.indexUrl, { signal: AbortSignal.timeout(12000) });
      if (!indexResponse.ok) throw new Error("Index returned HTTP " + indexResponse.status);
      const index = await indexResponse.text();
      const candidates = parseLegalIndex(index, source.baseUrl);
      const rankedTitles = rankLegalDocuments(candidates.map(item => ({...item,text:""})), query, maxDocuments);
      const selected = rankedTitles.slice(0, maxDocuments);
      const docs = await Promise.all(selected.map(async item => {
        const response = await fetchImpl(item.url, { signal: AbortSignal.timeout(15000) });
        if (!response.ok) return null;
        const text = stripMarkdown(await response.text()).slice(0, 14000);
        return text ? { title:item.title, url:item.url, publisher:source.publisher, jurisdiction:source.jurisdiction, sourceName:source.name, status:source.status, excerpt:text } : null;
      }));
      collected.push(...docs.filter(Boolean));
    } catch {
      warnings.push("Could not retrieve the indexed federal-law repository at this time.");
    }
  }
  return {
    sources: collected,
    warnings,
    sourceCatalog: RETRIEVABLE_LEGAL_SOURCES.map(({name,url,status,jurisdiction})=>({name,url,status,jurisdiction}))
  };
}
