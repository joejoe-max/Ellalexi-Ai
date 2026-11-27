/**
 * Prevent a model from declaring current law solely from an excerpt or a publication year.
 * A source must be explicitly marked currentnessVerified by the retrieval layer.
 */
export function enforceLegalCurrentness(result) {
  if (!result || !Array.isArray(result.findings)) return result;
  let downgraded = 0;
  result.findings = result.findings.map(finding => {
    if (finding?.effectiveStatus !== "currentness_verified") return finding;
    const citations = Array.isArray(finding.citations) ? finding.citations : [];
    const independentlyVerified = citations.length > 0 && citations.every(citation => citation.currentnessVerified === true);
    if (independentlyVerified) return finding;
    downgraded++;
    const historicalOnly = citations.length > 0 && citations.every(citation =>
      /historical repository|historical material|historical copy/i.test(String(citation.sourceStatus || ""))
    );
    return {
      ...finding,
      effectiveStatus: historicalOnly ? "historical_or_unverified" : "unclear",
      confidence: finding.confidence === "high" ? "moderate" : finding.confidence,
      caveat: [finding.caveat, "The retrieved material does not independently establish that this legal provision is currently in force."].filter(Boolean).join(" ")
    };
  });
  if (downgraded) {
    if (!result.limitations) result.limitations = [];
    result.limitations.push("Current legal effect could not be independently established for " + downgraded + " finding(s); do not treat them as confirmed current law.");
    if (!result.findings.some(finding => finding.effectiveStatus === "currentness_verified")) {
      result.status = "insufficient_sources";
    }
  }
  return result;
}
