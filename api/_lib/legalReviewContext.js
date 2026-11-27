/**
 * Build a compact legal-source review context from evidence-verified findings only.
 * Unverified model interpretations must not become premises for legal conclusions.
 */
export function buildLegalReviewContext(analysis = {}) {
  const verified = item => item && item.evidenceStatus === "verified" && item.documentId && item.quote;
  return {
    documentOverview: String(analysis.documentOverview || "").slice(0, 3000),
    executiveSummary: String(analysis.executiveSummary || "").slice(0, 3000),
    contextNote: "The overview and summary are model-generated navigation hints, not verified source evidence. Only clauses and risks listed below have passed source quotation, document identity and page verification. Do not treat unverified statements as contract facts.",
    clauses: (Array.isArray(analysis.clauses) ? analysis.clauses : [])
      .filter(verified).slice(0, 15).map(({ heading, plainMeaning, quote, documentId, documentName, documentLabel, page, benefits, terminology }) =>
        ({ heading, plainMeaning, quote, documentId, documentName: documentLabel || documentName, page, benefits, terminology })),
    risks: (Array.isArray(analysis.risks) ? analysis.risks : [])
      .filter(verified).slice(0, 12).map(({ title, whyItMatters, quote, documentId, documentName, documentLabel, page }) =>
        ({ title, whyItMatters, quote, documentId, documentName: documentLabel || documentName, page })),
    questions: (Array.isArray(analysis.questions) ? analysis.questions : []).slice(0, 8)
  };
}
