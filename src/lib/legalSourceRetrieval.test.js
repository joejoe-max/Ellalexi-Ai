import { describe, expect, it, vi } from "vitest";
import { parseLegalIndex, rankLegalDocuments, retrieveLegalSources } from "./legalSourceRetrieval.js";

describe("legal source retrieval", () => {
  it("extracts markdown legislation links from the index", () => {
    const docs = parseLegalIndex("- [Companies and Allied Matters Act](./2020/companies-act.md)", "https://raw.githubusercontent.com/example/laws/master/");
    expect(docs).toEqual([{ title:"Companies and Allied Matters Act", url:"https://raw.githubusercontent.com/example/laws/master/2020/companies-act.md" }]);
  });
  it("ranks documents using agreement-related terms", () => {
    const ranked = rankLegalDocuments([{title:"Companies and Allied Matters Act",text:"company shares directors"} ,{title:"Child Rights Act",text:"children"}], "company shares");
    expect(ranked[0].title).toBe("Companies and Allied Matters Act");
  });
  it("returns no results for an empty query", () => {
    expect(rankLegalDocuments([{title:"Companies Act",text:"company"}], "")).toEqual([]);
  });
  it("returns retrieved passages and catalog metadata", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({ok:true,text:async()=>"- [Companies Act](./2020/companies-act.md)"})
      .mockResolvedValueOnce({ok:true,text:async()=>"## Companies Act\n\nSection 1 company shares directors"});
    const result = await retrieveLegalSources("companies shares", {fetchImpl});
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].excerpt).toContain("Section 1");
    expect(result.sourceCatalog.length).toBeGreaterThan(0);
  });
});
