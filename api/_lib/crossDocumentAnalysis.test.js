import {describe,it,expect} from "vitest";
import {buildCrossDocumentEvidence,mergeCrossDocumentFindings,mergeSectionAnalyses,validateCrossDocumentFindings} from "./crossDocumentAnalysis.js";

describe("cross-document evidence preparation",()=>{
  it("preserves exact source document names, pages and quotes",()=>{
    const result=buildCrossDocumentEvidence({clauses:[{documentName:"A.pdf",page:"4",quote:"Exact wording",heading:"IP ownership"}]});
    expect(result.evidence.clauses[0]).toMatchObject({documentName:"A.pdf",page:"4",quote:"Exact wording"});
    expect(result.documentNames).toEqual(["A.pdf"]);
  });
  it("bounds comparison evidence and records omitted items",()=>{
    const result=buildCrossDocumentEvidence({clauses:Array.from({length:100},(_,i)=>({documentName:"A.pdf",page:String(i),quote:"Some contractual wording ".repeat(10)}))},{maxTokens:500});
    expect(result.estimatedTokens).toBeLessThanOrEqual(500);
    expect(result.omitted).toBeGreaterThan(0);
  });
  it("joins summaries with actual line breaks and converts escaped newline text",()=>{
    const merged=mergeSectionAnalyses([
      {documentOverview:"First section.\\n\\nSecond paragraph.",executiveSummary:"Summary one.",clauses:[{heading:"A"}],crossDocumentFindings:[{finding:"Invented"}]},
      {documentOverview:"Second section.",executiveSummary:"Summary two.",clauses:[{heading:"B"}],risks:[{title:"Risk"}],crossDocumentFindings:[{finding:"Also invented"}]}
    ]);
    expect(merged.documentOverview).toBe("First section.\n\nSecond paragraph.\n\nSecond section.");
    expect(merged.executiveSummary).toBe("Summary one.\n\nSummary two.");
    expect(merged.clauses.map(item=>item.heading)).toEqual(["A","B"]);
    expect(merged.risks).toHaveLength(1);
    expect(merged.crossDocumentFindings).toEqual([]);
  });
  it("deduplicates identical findings independent of document ordering",()=>{
    expect(mergeCrossDocumentFindings(
      [{finding:"Conflict",documents:["A","B"],significance:"High"}],
      [{finding:"Conflict",documents:["B","A"],significance:"High"}]
    )).toHaveLength(1);
  });
});

describe("cross-document claim validation",()=>{
  const comparison=buildCrossDocumentEvidence({
    clauses:[
      {documentName:"A.pdf",page:"2",quote:"The supplier shall deliver all goods by 1 June."},
      {documentName:"B.pdf",page:"5",quote:"Delivery shall occur no later than 15 June."}
    ]
  });
  it("accepts a finding only with two known documents and matching quotes from both",()=>{
    const findings=validateCrossDocumentFindings([{
      finding:"The delivery deadlines differ between the two agreements.",
      documents:["A.pdf","B.pdf"],
      significance:"Potential timing conflict",
      evidence:[
        {documentName:"A.pdf",page:"2",quote:"The supplier shall deliver all goods by 1 June."},
        {documentName:"B.pdf",page:"5",quote:"Delivery shall occur no later than 15 June."}
      ]
    }],comparison);
    expect(findings).toHaveLength(1);
    expect(findings[0].evidence).toHaveLength(2);
  });
  it("rejects one-document, unknown-document and invented-quote claims",()=>{
    const findings=validateCrossDocumentFindings([
      {finding:"This is a one-document claim only.",documents:["A.pdf"],evidence:[]},
      {finding:"This names an unuploaded agreement.",documents:["A.pdf","Other.pdf"],evidence:[]},
      {finding:"This alleges a conflict without source evidence.",documents:["A.pdf","B.pdf"],evidence:[
        {documentName:"A.pdf",quote:"Invented wording that is not in the agreement"},
        {documentName:"B.pdf",quote:"Also invented wording that is not in the agreement"}
      ]}
    ],comparison);
    expect(findings).toEqual([]);
  });
  it("rejects unsupported or incomplete citations",()=>{
    expect(validateCrossDocumentFindings([{
      finding:"A comparison without citations for both sides.",
      documents:["A.pdf","B.pdf"],
      evidence:[{documentName:"A.pdf",quote:"The supplier shall deliver all goods by 1 June."}]
    }],comparison)).toEqual([]);
  });
});
