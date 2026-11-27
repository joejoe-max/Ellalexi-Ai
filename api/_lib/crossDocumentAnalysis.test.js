import {describe,it,expect} from "vitest";
import {buildCrossDocumentEvidence,mergeCrossDocumentFindings,mergeSectionAnalyses} from "./crossDocumentAnalysis.js";

describe("cross-document evidence preparation",()=>{
 it("keeps original document names, page numbers and quotes",()=>{const result=buildCrossDocumentEvidence({clauses:[{documentName:"A.pdf",page:"4",quote:"Exact wording",heading:"IP ownership"}]});expect(result.evidence.clauses[0]).toMatchObject({documentName:"A.pdf",page:"4",quote:"Exact wording"});});
 it("bounds the comparison payload",()=>{const result=buildCrossDocumentEvidence({clauses:Array.from({length:100},(_,i)=>({documentName:"A",page:String(i),quote:"Some contractual wording ".repeat(10)}))},{maxTokens:500});expect(result.estimatedTokens).toBeLessThanOrEqual(500);expect(result.omitted).toBeGreaterThan(0);});
 it("deduplicates identical cross-document findings",()=>expect(mergeCrossDocumentFindings([{finding:"Conflict",documents:["A","B"],significance:"High"}],[{finding:"Conflict",documents:["A","B"],significance:"High"}])).toHaveLength(1));
 it("joins section summaries on real line breaks and drops single-section cross-document claims",()=>{
  const merged=mergeSectionAnalyses([
   {documentOverview:"First section.",executiveSummary:"Summary one.",clauses:[{heading:"A"}],risks:[],crossDocumentFindings:[{finding:"Invented from one section",documents:["A"],significance:"none"}]},
   {documentOverview:"Second section.",executiveSummary:"Summary two.",clauses:[{heading:"B"}],risks:[{title:"Risk"}],crossDocumentFindings:[{finding:"Also invented",documents:["B"],significance:"none"}]}
  ]);
  expect(merged.documentOverview).toBe("First section.\n\nSecond section.");
  expect(merged.executiveSummary).toBe("Summary one.\n\nSummary two.");
  expect(merged.clauses.map(item=>item.heading)).toEqual(["A","B"]);
  expect(merged.risks).toHaveLength(1);
  expect(merged.crossDocumentFindings).toEqual([]);
 });
});
