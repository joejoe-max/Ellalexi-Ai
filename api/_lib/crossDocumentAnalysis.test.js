import {describe,it,expect} from "vitest";
import {buildCrossDocumentEvidence,mergeCrossDocumentFindings} from "./crossDocumentAnalysis.js";

describe("cross-document evidence preparation",()=>{
 it("keeps original document names, page numbers and quotes",()=>{const result=buildCrossDocumentEvidence({clauses:[{documentName:"A.pdf",page:"4",quote:"Exact wording",heading:"IP ownership"}]});expect(result.evidence.clauses[0]).toMatchObject({documentName:"A.pdf",page:"4",quote:"Exact wording"});});
 it("bounds the comparison payload",()=>{const result=buildCrossDocumentEvidence({clauses:Array.from({length:100},(_,i)=>({documentName:"A",page:String(i),quote:"Some contractual wording ".repeat(10)}))},{maxTokens:500});expect(result.estimatedTokens).toBeLessThanOrEqual(500);expect(result.omitted).toBeGreaterThan(0);});
 it("deduplicates identical cross-document findings",()=>expect(mergeCrossDocumentFindings([{finding:"Conflict",documents:["A","B"],significance:"High"}],[{finding:"Conflict",documents:["A","B"],significance:"High"}])).toHaveLength(1));
});
