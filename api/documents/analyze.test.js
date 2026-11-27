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

  it("marks a quote verified only when its normalized wording exists in the cited document page", () => {
    const analysis = emptyAnalysis({
      clauses: [{
        heading: "Payment",
        documentName: "Offer.pdf",
        page: "99",
        quote: "The Company shall pay the Contributor a monthly stipend of N50,000.",
        plainMeaning: "Monthly payment is promised."
      }]
    });
    verifyEvidence(analysis, [{
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
        documentName: "Other.pdf",
        page: "1",
        quote: "The company pays a contributor monthly for work performed."
      }, {
        heading: "Termination",
        documentName: "Offer.pdf",
        page: "1",
        quote: "Either party may terminate immediately without notice."
      }]
    });
    verifyEvidence(analysis, [{
      name: "Offer.pdf",
      pages: [{ page: 1, text: "Either party may terminate this agreement by giving thirty days written notice." }]
    }]);
    expect(analysis.clauses.map(item => item.evidenceStatus)).toEqual(["unverified", "unverified"]);
  });
});
