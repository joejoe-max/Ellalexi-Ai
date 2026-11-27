import { describe, expect, it } from "vitest";
import { buildLegalReviewContext } from "./legalReviewContext.js";

describe("legal review context", () => {
  it("includes only evidence-verified clauses and risks", () => {
    const context = buildLegalReviewContext({
      documentOverview: "An employment agreement.",
      executiveSummary: "It sets payment and termination terms.",
      clauses: [
        { heading: "Verified", evidenceStatus: "verified", documentId: "doc-a", documentName: "Offer.pdf", quote: "Salary shall be paid monthly.", page: "2", plainMeaning: "Monthly pay." },
        { heading: "Unsupported", evidenceStatus: "unverified", documentId: "doc-a", documentName: "Offer.pdf", quote: "Invented wording.", page: "9", plainMeaning: "Unsupported claim." }
      ],
      risks: [
        { title: "Verified risk", evidenceStatus: "verified", documentId: "doc-a", documentName: "Offer.pdf", quote: "Either party may terminate immediately.", page: "4", whyItMatters: "No notice period." },
        { title: "Unsupported risk", evidenceStatus: "missing_evidence", documentId: "doc-a", documentName: "Offer.pdf", quote: "", page: "4", whyItMatters: "No source." }
      ],
      questions: [{ question: "What is the notice period?", reason: "It is unclear.", documentName: "Offer.pdf", page: "4" }]
    });
    expect(context.clauses.map(item => item.heading)).toEqual(["Verified"]);
    expect(context.risks.map(item => item.title)).toEqual(["Verified risk"]);
    expect(context.questions).toHaveLength(1);
    expect(context.clauses[0]).toMatchObject({ documentId: "doc-a", documentName: "Offer.pdf", page: "2" });
  });

  it("does not promote findings without a stable source identity or quotation", () => {
    const context = buildLegalReviewContext({
      clauses: [
        { evidenceStatus: "verified", documentName: "Offer.pdf", quote: "Some wording." },
        { evidenceStatus: "verified", documentId: "doc-a", documentName: "Offer.pdf", quote: "" }
      ]
    });
    expect(context.clauses).toEqual([]);
  });
});
