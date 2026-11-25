import { describe, expect, it, vi } from "vitest";
import { normalizeGroundingChunks, searchLiveLegalSources } from "./liveLegalSearch.js";
describe("live Nigerian legal search", () => {
  it("allows only HTTPS sources from the configured legal publisher list", () => {
    const chunks = [
      { web: { title: "Act 2020", uri: "https://justice.gov.ng/acts/2020" } },
      { web: { title: "External", uri: "https://example.com/law" } },
      { web: { title: "PDF", uri: "https://justice.gov.ng/act.pdf" } },
      { web: { title: "HTTP", uri: "http://nass.gov.ng/act" } }
    ];
    expect(normalizeGroundingChunks(chunks)).toHaveLength(1);
  });
  it("deduplicates URLs", () => {
    const chunk = { web: { title: "Act 2020", uri: "https://justice.gov.ng/act" } };
    expect(normalizeGroundingChunks([chunk, chunk])).toHaveLength(1);
  });
  it("does not call Gemini without a key", async () => {
    const fetchImpl = vi.fn();
    const result = await searchLiveLegalSources("company law", { fetchImpl });
    expect(result.searched).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("fetches full source text after grounded discovery", async () => {
    const html = "<html><body>" + "Companies and Allied Matters Act 2020 Section 22 directors obligations. ".repeat(12) + "</body></html>";
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ candidates: [{ groundingMetadata: { groundingChunks: [
        { web: { title: "Companies and Allied Matters Act 2020", uri: "https://justice.gov.ng/acts/cama" } }
      ] } }] }) })
      .mockResolvedValueOnce({ ok: true, url: "https://justice.gov.ng/acts/cama", headers: { get: () => "text/html" }, text: async () => html });
    const result = await searchLiveLegalSources("company law", { apiKey: "test", fetchImpl });
    expect(result.searched).toBe(true);
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].excerpt).toContain("Section 22");
    expect(result.sources[0].publicationYear).toBe("2020");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
  it("does not retrieve non-allowlisted result URLs", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ candidates: [{ groundingMetadata: { groundingChunks: [
      { web: { title: "Law", uri: "https://example.com/law" } }
    ] } }] }) });
    const result = await searchLiveLegalSources("law", { apiKey: "test", fetchImpl });
    expect(result.sources).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
