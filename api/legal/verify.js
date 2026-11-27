import { searchLiveLegalSources } from "../../src/lib/liveLegalSearch.js";
import {generateWithFallback} from "../_lib/reasoning.js";
import {retrieveLegalSources} from "../../src/lib/legalSourceRetrieval.js";
import {buildLegalReviewContext} from "../_lib/legalReviewContext.js";
import {enforceLegalCurrentness} from "../_lib/legalSourceValidation.js";
import {startSSE,sendEvent,endSSE,sendSafeError} from "../_lib/sse.js";

const SCHEMA = { type:"OBJECT", properties:{
  status:{type:"STRING",enum:["verified_sources_found","insufficient_sources","conflicting_sources","general_principles"]},
  summary:{type:"STRING"},
  findings:{type:"ARRAY",items:{type:"OBJECT",properties:{
    topic:{type:"STRING"},documentPosition:{type:"STRING"},legalPosition:{type:"STRING"},
    jurisdiction:{type:"STRING"},authority:{type:"STRING"},provision:{type:"STRING"},
    effectiveStatus:{type:"STRING",enum:["currentness_verified","historical_or_unverified","unclear","general_principle"]},
    confidence:{type:"STRING",enum:["high","moderate","low","insufficient"]},sourceIds:{type:"ARRAY",items:{type:"INTEGER"}},caveat:{type:"STRING"}
  },required:["topic","documentPosition","legalPosition","jurisdiction","authority","provision","effectiveStatus","confidence","sourceIds","caveat"]}},
  unresolvedQuestions:{type:"ARRAY",items:{type:"STRING"}},limitations:{type:"ARRAY",items:{type:"STRING"}}
},required:["status","summary","findings","unresolvedQuestions","limitations"]};

const SYSTEM_VERIFIED = "You are EllaBrief AI's Nigerian legal-source comparison component. Use ONLY supplied retrieved excerpts as legal evidence. The document overview and executive summary are navigation hints only; only clauses and risks with verified source quotations are grounded in the uploaded document. Historical repository copies are not proof of current law and cannot establish currentness. Never invent Acts, sections, cases, dates, quotations or legal rules that are not supported by the excerpts. Distinguish document text from source text. Distinguish enacted laws from bills and news. Do not say currentness is verified unless retrieved source text establishes legal effect and date. Every finding must cite sourceIds that support it. Never advise signing or not signing.";

const SYSTEM_PRINCIPLES = `You are EllaBrief AI's Nigerian legal-education component for document reviews.
A live primary-source page could not be retrieved. Your job is still to help the user understand how ordinary Nigerian legal principles typically relate to THIS document.

Rules:
- Base documentPosition strictly on source-verified clauses and risks supplied in the analysis. The overview and executive summary are model-generated navigation hints only, not verified contract evidence; do not present their uncorroborated details as document facts.
- legalPosition must explain general Nigerian principles relevant to that point (contract, companies/CAMA-style concepts for contributor/startup/equity offers, IP assignment, confidentiality, dispute resolution, limitation of liability, etc.).
- Do NOT invent specific section numbers, gazette dates, or case names.
- Set effectiveStatus to "general_principle", confidence to "moderate" or "low", sourceIds to [], authority to "General Nigerian legal principles (not a verified statutory citation)", provision to "General principle — not a verified section citation".
- Highlight practical red flags: one-sided IP assignment, short review deadlines, exclusive company-friendly dispute terms, unpaid contribution in exchange for uncertain future equity, broad confidentiality, etc.
- Never advise sign / don't sign. Never claim court outcomes.
- status must be "general_principles".
- Produce 3–6 useful findings tied to real issues in the analysis.`;

const send = (res,status,data) => { if(status===200)sendEvent(res,"complete",data);else sendEvent(res,"error",{message:data.error||"Legal verification could not be completed.",code:data.code||"legal_review_error"});endSSE(res);return data; };

function inferDocumentType(analysis) {
  const text = [
    analysis.documentOverview,
    analysis.executiveSummary,
    ...(analysis.clauses || []).slice(0, 12).map(c => `${c.heading || ""} ${c.plainMeaning || ""}`),
    ...(analysis.risks || []).slice(0, 8).map(r => `${r.title || ""} ${r.whyItMatters || ""}`)
  ].join(" ").toLowerCase();

  if (/tenanc|lease agreement|landlord|tenant|rent control|premises|sub-?let/.test(text)) return "tenancy / lease agreement";
  if (/contributor|startup|founders?|equity grant|share option|vesting|cap table|ordinary shares|preference shares|shareholder|subscription agreement|offer to contributors/.test(text)) return "startup / founders / contributor agreement";
  if (/employment|employee|employer|termination of employment|probation|salary|staff handbook/.test(text)) return "employment contract";
  if (/non[- ]?disclosure|nda\b|confidentiality agreement|trade secret/.test(text)) return "non-disclosure agreement";
  if (/loan agreement|facility agreement|borrower|lender|repayment|interest rate|security interest/.test(text)) return "loan / facility agreement";
  if (/sale of goods|purchase agreement|supply agreement|goods sold/.test(text)) return "sale / supply agreement";
  if (/partnership agreement|partners' agreement|joint venture/.test(text)) return "partnership / joint venture agreement";
  if (/service agreement|consultancy|independent contractor|statement of work/.test(text)) return "service / consultancy agreement";
  if (/power of attorney|deed of assignment|deed of gift/.test(text)) return "deed / power of attorney";
  return "commercial agreement";
}

function legalCuesForType(docType) {
  const map = {
    "tenancy / lease agreement": "tenancy agreement Nigeria Recovery of Premises Act Rent Control landlord tenant rights obligations",
    "startup / founders / contributor agreement": "Companies and Allied Matters Act CAMA Nigeria founders agreement shareholders equity vesting intellectual property assignment contributor",
    "employment contract": "Labour Act Nigeria employment contract termination redundancy employee rights",
    "non-disclosure agreement": "confidentiality non-disclosure agreement Nigeria trade secrets contract law",
    "loan / facility agreement": "loan agreement Nigeria interest security mortgage",
    "sale / supply agreement": "Sale of Goods Act Nigeria contract for sale of goods",
    "partnership / joint venture agreement": "Partnership Act Nigeria joint venture agreement",
    "service / consultancy agreement": "contract for services Nigeria independent contractor",
    "deed / power of attorney": "Power of Attorney Nigeria Conveyancing Act",
    "commercial agreement": "Nigerian contract law agreement breach damages obligations"
  };
  return map[docType] || map["commercial agreement"];
}

function buildQuery(analysis) {
  const docType = inferDocumentType(analysis);
  const pieces = [docType, legalCuesForType(docType)];
  for (const clause of (analysis.clauses || []).slice(0, 12)) {
    pieces.push(clause.heading, clause.plainMeaning, (clause.terminology || []).map(t => t.term).join(" "));
  }
  for (const risk of (analysis.risks || []).slice(0, 10)) {
    pieces.push(risk.title, risk.whyItMatters, risk.quote);
  }
  for (const question of (analysis.questions || []).slice(0, 8)) {
    pieces.push(question.question);
  }
  return pieces.filter(Boolean).join(" ").slice(0, 9000);
}

async function generatePrinciplesGuidance(compact, docType, onFallback) {
  const input = JSON.stringify({ documentType: docType, analysis: compact });
  const generated = await generateWithFallback({
    stage: "legal_principles",
    systemInstruction: SYSTEM_PRINCIPLES,
    parts: [{
      text: "Provide general Nigerian legal-principle guidance for this " + docType + ". Tie each finding to issues in the analysis. Do not invent section numbers.\n\n" + input
    }],
    generationConfig: { temperature: 0.25, maxOutputTokens: 5000, responseMimeType: "application/json", responseSchema: SCHEMA },
    timeout: 35000,
    onFallback
  });
  let result;
  try { result = JSON.parse(generated.text); }
  catch { return null; }
  if (!Array.isArray(result.findings)) return null;
  result.status = "general_principles";
  result.mode = "general_principles";
  result.findings = result.findings.map(f => ({
    ...f,
    sourceIds: [],
    citations: [],
    effectiveStatus: "general_principle",
    authority: f.authority || "General Nigerian legal principles (not a verified statutory citation)",
    provision: f.provision || "General principle — not a verified section citation",
    confidence: f.confidence === "high" ? "moderate" : (f.confidence || "moderate"),
    caveat: f.caveat || "This is educational guidance from general principles, not a verified citation to a specific Act section. Confirm with a qualified Nigerian legal practitioner."
  }));
  if (!result.summary) {
    result.summary = "General Nigerian legal principles relevant to this " + docType;
  }
  result.limitations = Array.isArray(result.limitations) ? result.limitations : [];
  result.limitations.push("No live primary-source page was retrieved for this review. Guidance is based on ordinary Nigerian legal principles, not a verified statutory extract.");
  result.limitations.push("Specific section numbers and case authorities were intentionally omitted because they were not independently verified from a retrieved source.");
  result.unresolvedQuestions = Array.isArray(result.unresolvedQuestions) ? result.unresolvedQuestions : [];
  return { result, model: generated.model };
}

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Use POST to verify legal sources." });
  }
  startSSE(res);
  sendEvent(res, "status", { message: "Identifying the document type and retrieving relevant Nigerian legal sources…" });
  const { analysis, jurisdiction = "Nigeria" } = req.body || {};
  if (!analysis || typeof analysis !== "object" || Array.isArray(analysis)) {
    return send(res, 400, { error: "A document analysis object is required." });
  }

  const compact = buildLegalReviewContext(analysis);

  try {
    const docType = inferDocumentType(compact);
    const query = buildQuery(compact);
    const [live,historical]=await Promise.all([searchLiveLegalSources(query),retrieveLegalSources(query).catch(()=>({sources:[],warnings:["Historical legal reference material could not be retrieved."]}))]);
    const combined=[...live.sources,...historical.sources.map(source=>({...source,authority:"historical_repository",status:source.status||"Historical repository copy; currentness and legal effect are not verified."}))].filter((source,index,all)=>all.findIndex(item=>item.url===source.url)===index).slice(0,6);
    const warnings = [...(live.warnings || []), ...(historical.warnings || [])].filter(w =>
      !/local repository|historical fallback|local source index/i.test(w)
    );

    if (!combined.length) {
      sendEvent(res, "status", { message: "Primary sources unavailable — preparing general legal principles for this document type…" });
      const principles = await generatePrinciplesGuidance(compact, docType, () =>
        sendEvent(res, "fallback", { message: "Trying another AI model…" })
      );
      if (principles) {
        return send(res, 200, {
          ok: true,
          
          result: principles.result,
          sources: [],
          sourceCatalog: [],
          warnings,
          search: { liveAttempted: live.searched, liveSources: 0, historicalSources: historical.sources.length, documentType: docType, mode: "general_principles" },
          notice: "Educational legal information based on general Nigerian principles, not formal advice. Confirm important points with a qualified Nigerian legal practitioner."
        });
      }
      return send(res, 200, {
        ok: true,
        result: {
          status: "insufficient_sources",
          summary: "Limited legal guidance could be prepared for this " + docType + ".",
          findings: [],
          unresolvedQuestions: ["A primary legal source page could not be retrieved, and general guidance could not be completed. The document analysis above still stands."],
          limitations: ["Absence of a retrieved source does not mean no law applies."]
        },
        sources: [],
        sourceCatalog: [],
        warnings,
        search: { liveAttempted: live.searched, liveSources: 0, documentType: docType },
        notice: "Source-assisted information, not legal advice."
      });
    }

    const input = JSON.stringify({
      jurisdiction: String(jurisdiction).slice(0, 100),
      documentType: docType,
      analysis: compact,
      retrievedSources: combined.map((s, index) => ({
        sourceId: index + 1,
        title: s.title,
        publisher: s.publisher,
        jurisdiction: s.jurisdiction,
        authority: s.authority || "legal_information_source",
        status: s.status,
        publicationYear: s.publicationYear,
        excerpt: s.excerpt
      }))
    });
    if (input.length > 52000) return send(res, 413, { error: "The legal-source context is too large to process." });

    sendEvent(res, "status", { message: "Comparing retrieved source passages with the document…" });
    const generated = await generateWithFallback({
      stage: "legal_verification",
      systemInstruction: SYSTEM_VERIFIED,
      parts: [{
        text: "Compare the document issues with the retrieved Nigerian legal source excerpts. The document appears to be a " + docType + ". Use sourceIds exactly as supplied.\n\n" + input
      }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 6000, responseMimeType: "application/json", responseSchema: SCHEMA },
      timeout: 45000,
      onFallback: () => sendEvent(res, "fallback", { message: "Trying another AI model…" })
    });

    let result;
    try {
      result = JSON.parse(String(generated.text || "").trim().replace(/^\x60\x60\x60(?:json)?\s*/i, "").replace(/\s*\x60\x60\x60$/, ""));
      if (result?.result && typeof result.result === "object" && !Array.isArray(result.result)) result = result.result;
      if (result?.analysis && typeof result.analysis === "object" && !Array.isArray(result.analysis)) result = result.analysis;
    } catch {
      return send(res, 502, { error: "The legal-source service returned an unreadable result." });
    }
    // Models occasionally omit optional arrays or wrap the object. Normalise
    // those harmless shape variations, but never fabricate legal findings.
    if (!result || typeof result !== "object" || Array.isArray(result)) {
      return send(res, 502, { error: "The legal-source service returned an invalid result." });
    }
    result.findings = Array.isArray(result.findings) ? result.findings : [];
    result.limitations = Array.isArray(result.limitations) ? result.limitations : [];
    result.unresolvedQuestions = Array.isArray(result.unresolvedQuestions) ? result.unresolvedQuestions : [];
    result.summary = typeof result.summary === "string" ? result.summary : "Legal source review completed with limited structured findings.";
    if (!["verified_sources_found", "insufficient_sources", "conflicting_sources", "general_principles"].includes(result.status)) {
      result.status = result.findings.length ? "verified_sources_found" : "insufficient_sources";
    }

    const sources = combined.map((source, index) => ({
      id: index + 1,
      title: source.title,
      uri: source.url,
      publisher: source.publisher,
      jurisdiction: source.jurisdiction,
      authority: source.authority || "legal_information_source",
      status: source.status,
      year: source.publicationYear || null,
      excerpt: source.excerpt.slice(0, 1800)
    }));
    const sourceById = new Map(sources.map(s => [s.id, s]));

    result.findings = result.findings.flatMap(f => {
      if (!Array.isArray(f.sourceIds) || !f.sourceIds.length) return [];
      const citations = f.sourceIds.map(id => sourceById.get(id)).filter(Boolean).map(source => {
        const provision = String(f.provision || "").trim();
        const sectionMatch = provision.match(/(?:section|s\.)\s*([0-9]+[A-Za-z]?(?:\([0-9A-Za-z]+\))*)/i);
        const sectionNumber = sectionMatch?.[1]?.toLowerCase();
        const sectionPattern = sectionNumber
          ? new RegExp("(?:section|s\\.)\\s*" + sectionNumber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?![0-9])", "i")
          : null;
        const provisionVerified = Boolean(sectionPattern && sectionPattern.test(source.excerpt));
        if (!source.year || (sectionMatch && !provisionVerified)) return null;
        return {
          sourceId: source.id,
          authority: source.title,
          year: source.year,
          provision: provisionVerified ? provision : "Provision not independently located in retrieved excerpt",
          publisher: source.publisher,
          jurisdiction: source.jurisdiction,
          url: source.uri,
          provisionVerified,
          sourceStatus: source.status,
          sourceAuthority: source.authority,
          currentnessVerified: source.currentnessVerified === true
        };
      }).filter(Boolean);
      return citations.length ? [{ ...f, citations }] : [];
    });
    enforceLegalCurrentness(result);

    if (!result.findings.length) {
      sendEvent(res, "status", { message: "Preparing general legal principles for this document type…" });
      const principles = await generatePrinciplesGuidance(compact, docType, () =>
        sendEvent(res, "fallback", { message: "Trying another AI model…" })
      );
      if (principles) {
        return send(res, 200, {
          ok: true,
          result: principles.result,
          sources: [],
          sourceCatalog: [],
          warnings,
          search: { liveAttempted: live.searched, liveSources: live.sources.length, historicalSources: historical.sources.length, documentType: docType, mode: "general_principles" },
          notice: "Educational legal information based on general Nigerian principles, not formal advice. Confirm important points with a qualified Nigerian legal practitioner."
        });
      }
      result.status = "insufficient_sources";
    }

    result.limitations.push("Live web discovery can miss relevant laws or amendments. A retrieved page does not alone establish commencement, repeal, currentness or legal effect.");

    return send(res, 200, {
      ok: true,
      
      result,
      sources,
      sourceCatalog: [],
      warnings,
      search: { liveAttempted: live.searched, liveSources: live.sources.length, historicalSources: historical.sources.length, documentType: docType },
      notice: "Source-assisted legal information, not legal advice. Check the cited material and seek a qualified Nigerian legal practitioner for important decisions."
    });
  } catch (error) {
    if (error.userMessage) sendSafeError(res, error);
    else sendSafeError(res, Object.assign(new Error(), {
      userMessage: "Legal verification could not be completed. Please try again.",
      kind: "legal_review_error"
    }));
  }
}
