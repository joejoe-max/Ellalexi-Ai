import { describe, it, expect } from "vitest";
import { createDocumentId, normaliseDocumentName, correlationContext } from "./documentIdentity.js";

describe("document identity", () => {
  it("creates a stable id from buffer content and name", () => {
    const buffer = Buffer.from("contract body for identity hash");
    const a = createDocumentId({ name: "Agreement.pdf", buffer });
    const b = createDocumentId({ name: "Agreement.pdf", buffer });
    expect(a).toBe(b);
    expect(a).toMatch(/^doc_[a-f0-9]+_Agreement\.pdf$/);
  });

  it("creates a uuid-based id when no buffer is available", () => {
    const id = createDocumentId({ name: "note.docx" });
    expect(id).toMatch(/^doc_[a-f0-9]+$/);
  });

  it("normalises document names for matching", () => {
    expect(normaliseDocumentName("  My  Contract.PDF ")).toBe("my contract pdf");
  });

  it("builds correlation context without document text", () => {
    expect(correlationContext({
      requestId: "req_abc",
      documentId: "doc_1",
      documentName: "A.pdf",
      sectionIndex: 2,
      sectionCount: 4,
      stage: "document_analysis"
    })).toEqual({
      requestId: "req_abc",
      documentId: "doc_1",
      documentName: "A.pdf",
      sectionIndex: 2,
      sectionCount: 4,
      stage: "document_analysis"
    });
  });
});
