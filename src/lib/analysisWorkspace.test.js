import { describe, expect, it } from "vitest";
import { getWorkspaceSections } from "./analysisWorkspace.js";
describe("analysis workspace navigation", () => {
 it("only exposes sections containing results", () => { expect(getWorkspaceSections({clauses:[{heading:"Term"}],risks:[],moneyMatters:[{item:"Fee"},{item:"Deposit"}]})).toEqual([{key:"clauses",label:"Clauses",id:"clauses",count:1},{key:"moneyMatters",label:"Money",id:"money",count:2}]); });
 it("handles missing or malformed analysis fields", () => { expect(getWorkspaceSections(null)).toEqual([]); expect(getWorkspaceSections({clauses:"not-an-array"})).toEqual([]); });
 it("includes cross-document analysis only when findings exist", () => { expect(getWorkspaceSections({crossDocumentFindings:[{finding:"Mismatch"}]})).toContainEqual({key:"crossDocumentFindings",label:"Across documents",id:"cross-documents",count:1}); });
});
