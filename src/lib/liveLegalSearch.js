import {generateWithFallback} from "../../api/_lib/gemini.js";
const TRUSTED_HOSTS = [
  { suffix: ".gov.ng", publisher: "Nigerian government website", authority: "official_government" },
  { suffix: "nass.gov.ng", publisher: "National Assembly of Nigeria", authority: "official_government" },
  { suffix: "nlrc.gov.ng", publisher: "Nigerian Law Reform Commission", authority: "official_government" },
  { suffix: "justice.gov.ng", publisher: "Federal Ministry of Justice", authority: "official_government" },
  { suffix: "supremecourt.gov.ng", publisher: "Supreme Court of Nigeria", authority: "official_court" },
  { suffix: "placng.org", publisher: "Policy and Legal Advocacy Centre", authority: "secondary_legal_source" },
  { suffix: "nigerialii.org", publisher: "Nigeria Legal Information Institute", authority: "legal_information_repository" },
  { suffix: "commonlii.org", publisher: "CommonLII", authority: "legal_information_repository" },
  { suffix: "lawpavilion.com", publisher: "LawPavilion", authority: "secondary_legal_source" }
];
function publisherFor(url) {
  const host = new URL(url).hostname.toLowerCase();
  return TRUSTED_HOSTS.find(item => host === item.suffix.replace(/^\./, "") || host.endsWith(item.suffix)) || null;
}
function cleanText(value) {
  return String(value || "").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, " ")
    .replace(/<header\b[^>]*>[\s\S]*?<\/header>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ").trim();
}
function extractYear(title, text) {
  return (String(title + " " + text).match(/\b(?:19|20)\d{2}\b/) || [])[0] || null;
}
export function normalizeGroundingChunks(chunks = []) {
  const seen = new Set();
  return chunks.flatMap(chunk => {
    const web = chunk?.web;
    if (!web?.uri || !web?.title) return [];
    try {
      const url = new URL(web.uri);
      const publisher = publisherFor(url.toString());
      if (url.protocol !== "https:" || !publisher || /\.pdf(?:$|[?#])/i.test(url.pathname)) return [];
      if (seen.has(url.toString())) return [];
      seen.add(url.toString());
      return [{ title: String(web.title).slice(0, 240), url: url.toString(), ...publisher }];
    } catch { return []; }
  }).slice(0, 6);
}
export async function searchLiveLegalSources(query, { apiKey, fetchImpl = fetch } = {}) {
  if (!apiKey) return { sources: [], warnings: ["Live legal search is not configured because GEMINI_API_KEY is missing."], searched: false };
  const prompt = [
    "Search the live public internet for Nigerian legal materials relevant to the issue below.",
    "Prioritise actual Acts, amending Acts, regulations, official gazettes and court judgments hosted by Nigerian government or court sources.",
    "Search for later amendments, repeal, commencement, effective dates and current legal status of any principal Act.",
    "Distinguish enacted laws from bills, proposals, policy announcements and news. A newer upload or news report does not prove that an amendment commenced.",
    "Return relevant primary-source pages. Search snippets are not legal evidence.",
    "Issue: " + String(query).slice(0, 8500)
  ].join("\n");
  try {
    const generated = await generateWithFallback({parts:[{text:prompt}],generationConfig:{temperature:0.1,maxOutputTokens:1800},tools:[{google_search:{}}],timeout:25000,fetchImpl,allowEmptyText:true});
    const payload=generated.payload;
    const candidates = normalizeGroundingChunks(payload.candidates?.[0]?.groundingMetadata?.groundingChunks || []);
    const sources = (await Promise.all(candidates.map(async candidate => {
      try {
        const page = await fetchImpl(candidate.url, { headers: { "User-Agent": "EllaLexiLegalResearch/1.0" }, signal: AbortSignal.timeout(12000), redirect: "follow" });
        if (!page.ok) return null;
        const finalUrl = page.url || candidate.url;
        const publisher = publisherFor(finalUrl);
        if (!publisher || new URL(finalUrl).protocol !== "https:") return null;
        const type = page.headers?.get?.("content-type") || "";
        if (type && !/text\/html|text\/plain|application\/xhtml\+xml/i.test(type)) return null;
        const raw = await page.text();
        if (raw.length > 180000) return null;
        const excerpt = cleanText(raw).slice(0, 14000);
        if (excerpt.length < 180) return null;
        return { title: candidate.title, url: finalUrl, publisher: publisher.publisher,
          jurisdiction: "Nigeria (confirm federal/state applicability)", authority: publisher.authority,
          status: "Live web result; legal effect/currentness not independently established",
          publicationYear: extractYear(candidate.title, excerpt), excerpt, retrieval: "google_search_grounding" };
      } catch { return null; }
    }))).filter(Boolean);
    return { sources, searched: true, warnings: sources.length ? [] : ["Live search ran, but no eligible legal source page could be retrieved in full. Search-result snippets were not used as legal evidence."] };
  } catch {
    return { sources: [], searched: false, warnings: ["Live legal search could not be completed. The local source index was also checked where available."] };
  }
}
