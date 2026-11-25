import { afterEach, describe, expect, it, vi } from "vitest";
import { parseLegalIndex, rankLegalDocuments, retrieveLegalSources } from "./legalSourceRetrieval.js";

afterEach(() => vi.restoreAllMocks());

describe("legal source retrieval", () => {
  const base = "https://raw.githubusercontent.com/mykeels/nigerian-laws/master/";

  it("parses the real repository's indented Markdown list format", () => {
    const index = [
      "# The Laws of the Federation of Nigeria",
      "- 2004",
      "  - [Companies and Allied Matters Act - CAP. C20 L.F.N. 2004](./2004/companies-and-allied-matters-act-cap-c20-lfn-2004.md)",
      "  - [Labour Act - CAP. L1 L.F.N. 2004](./2004/labour-act-cap-l1-lfn-2004.md)"
    ].join("\n");
    const docs = parseLegalIndex(index, base);
    expect(docs).toHaveLength(2);
    expect(docs[0]).toEqual({
      title: "Companies and Allied Matters Act - CAP. C20 L.F.N. 2004",
      url: base + "2004/companies-and-allied-matters-act-cap-c20-lfn-2004.md"
    });
  });

  it("rejects absolute, non-Markdown and path-traversal links", () => {
    const index = [
      "- [External](https://example.com/law.md)",
      "- [Traversal](./../../private.md)",
      "- [PDF](./law.pdf)"
    ].join("\n");
    expect(parseLegalIndex(index, base)).toEqual([]);
  });

  it("ranks documents using relevant title terms", () => {
    const ranked = rankLegalDocuments([
      { title: "Companies and Allied Matters Act", text: "" },
      { title: "Child Rights Act", text: "" }
    ], "company shares directors");
    expect(ranked[0].title).toBe("Companies and Allied Matters Act");
  });

  it("returns no results for an empty query", () => {
    expect(rankLegalDocuments([{ title: "Companies Act", text: "company" }], "")).toEqual([]);
  });

  it("retrieves a passage from the indexed document", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({ ok: true, headers: { get: () => String(200) }, text: async () => "- 2004\n  - [Companies and Allied Matters Act](./2004/companies-act.md)" })
      .mockResolvedValueOnce({ ok: true, headers: { get: () => "80" }, text: async () => "## Companies and Allied Matters Act\n\nSection 1 company shares directors" });
    const result = await retrieveLegalSources("companies shares", { fetchImpl });
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].excerpt).toContain("Section 1");
    expect(result.sourceCatalog.length).toBeGreaterThan(0);
  });

  it("does not retrieve documents when the index links outside the approved repository", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce({
      ok: true, headers: { get: () => "100" },
      text: async () => "- [External Companies Act](https://example.com/companies.md)"
    });
    const result = await retrieveLegalSources("companies", { fetchImpl });
    expect(result.sources).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
