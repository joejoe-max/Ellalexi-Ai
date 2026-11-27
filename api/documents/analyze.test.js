import { describe, expect, it } from "vitest";
import { cleanJson, verifyEvidence } from "./analyze.js";

const emptyAnalysis = overrides => ({
  documentOverview: "This agreement sets out the parties' obligations.",
  executiveSummary: "It describes delivery and payment.",
  parties: [], clauses: [], rightsAndObligations: [], risks: [], moneyMatters: [],
  missingProtections: [], questions: [], crossDocumentFindings: [], limitations: [],
  ...overrides
});

describe("document analysis response validation", () => {
  it("accepts complete structured output with genuinely empty optional categories", () => {
    expect(cleanJson(JSON.stringify(emptyAnalysis()))).toMatchObject({
      documentOverview: expect.any(String),
      clauses: [],
      risks: [],
      questions: []
    });
  });

  it("rejects malformed or incomplete structured output instead of fabricating empty fields", () => {
    const malformed = emptyAnalysis();
    delete malformed.risks;
    expect(() => cleanJson(JSON.stringify(malformed))).toThrow(/risks/);
    expect(() => cleanJson("not JSON")).toThrow();
  });

  it("attaches safe machine-readable codes and field paths to validation failures", () => {
    try { cleanJson("not JSON"); } catch (error) {
      expect(error).toMatchObject({ name: "AnalysisValidationError", validationCode: "invalid_json" });
    }
    const missingArray = emptyAnalysis();
    delete missingArray.risks;
    try { cleanJson(JSON.stringify(missingArray)); } catch (error) {
      expect(error).toMatchObject({ name: "AnalysisValidationError", validationCode: "invalid_array", validationPath: "risks" });
    }
  });

  it("marks a quote verified only when its normalized wording exists in the cited document page", () => {
    const analysis = emptyAnalysis({
      clauses: [{
        heading: "Payment",
        documentId: "doc-offer",
        documentName: "Offer.pdf",
        page: "2",
        quote: "The Company shall pay the Contributor a monthly stipend of N50,000.",
        plainMeaning: "Monthly payment is promised."
      }]
    });
    verifyEvidence(analysis, [{
      documentId: "doc-offer",
      name: "Offer.pdf",
      pages: [{ page: 2, text: "The Company shall pay the Contributor a monthly stipend of N50,000." }]
    }]);
    expect(analysis.clauses[0]).toMatchObject({
      documentName: "Offer.pdf",
      page: "2",
      evidenceStatus: "verified"
    });
  });

  it("does not mark a majority-token or wrong-document match as verified", () => {
    const analysis = emptyAnalysis({
      clauses: [{
        heading: "Payment",
        documentId: "missing-doc",
        documentName: "Other.pdf",
        page: "1",
        quote: "The company pays a contributor monthly for work performed."
      }, {
        heading: "Termination",
        documentId: "doc-offer",
        documentName: "Offer.pdf",
        page: "99",
        quote: "Either party may terminate this agreement by giving thirty days written notice."
      }]
    });
    verifyEvidence(analysis, [{
      documentId: "doc-offer",
      name: "Offer.pdf",
      pages: [{ page: 1, text: "Either party may terminate this agreement by giving thirty days written notice." }]
    }]);
    expect(analysis.clauses.map(item => item.evidenceStatus)).toEqual(["unverified", "page_mismatch"]);
  });
  it("does not verify repeated filenames without a stable document ID", () => {
    const analysis = emptyAnalysis({ clauses: [{ documentName: "Agreement.pdf", page: "1", quote: "The supplier shall deliver all goods by 1 June." }] });
    verifyEvidence(analysis, [
      { documentId: "doc-a", name: "Agreement.pdf", pages: [{ page: 1, text: "The supplier shall deliver all goods by 1 June." }] },
      { documentId: "doc-b", name: "Agreement.pdf", pages: [{ page: 1, text: "The supplier shall deliver all goods by 1 June." }] }
    ]);
    expect(analysis.clauses[0].evidenceStatus).toBe("ambiguous_source");
  });

  it("keeps missing quotations visible as missing evidence", () => {
    const analysis = emptyAnalysis({ clauses: [{ heading: "Payment", documentName: "Offer.pdf", quote: "" }] });
    verifyEvidence(analysis, [{ documentId: "doc-offer", name: "Offer.pdf", pages: [] }]);
    expect(analysis.clauses).toHaveLength(1);
    expect(analysis.clauses[0].evidenceStatus).toBe("missing_evidence");
  });

  it("rejects incomplete finding objects and incorrect chunk provenance", () => {
    const incomplete = emptyAnalysis({
      clauses: [{ heading: "Payment", documentId: "doc-a", documentName: "Offer.pdf", page: "1", quote: "The buyer shall pay within thirty days.", plainMeaning: "Payment is due." }]
    });
    expect(() => cleanJson(JSON.stringify(incomplete))).toThrow(/practicalEffect/);

    const wrongSource = emptyAnalysis({
      clauses: [{
        heading: "Payment", documentId: "doc-b", documentName: "Other.pdf", page: "1",
        quote: "The buyer shall pay within thirty days.", plainMeaning: "Payment is due.",
        practicalEffect: "The buyer must pay.", beneficiary: "Seller", consequences: "Late payment",
        riskLevel: "medium", benefits: [], burdens: [], terminology: []
      }]
    });
    expect(() => cleanJson(JSON.stringify(wrongSource), { documentId: "doc-a", documentName: "Offer.pdf" })).toThrow(/incorrect source document ID/);
  });

  it("rejects invalid enum values instead of rendering arbitrary model labels", () => {
    const invalid = emptyAnalysis({
      risks: [{
        documentId: "doc-a", title: "Payment risk", severity: "critical-ish", whoAffected: "Buyer",
        whyItMatters: "The payment deadline is unclear.", documentName: "Offer.pdf",
        page: "1", quote: "Payment shall be made as agreed.", suggestedNextStep: "Clarify the date."
      }]
    });
    expect(() => cleanJson(JSON.stringify(invalid))).toThrow(/invalid severity/);
  });

});
