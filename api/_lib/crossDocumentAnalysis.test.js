import {describe,it,expect} from "vitest";
import {buildCrossDocumentEvidence,mergeCrossDocumentFindings,mergeSectionAnalyses,validateCrossDocumentFindings,consolidateDocumentNarratives} from "./crossDocumentAnalysis.js";

describe("cross-document evidence preparation",()=>{
  it("preserves exact source document names, pages and quotes",()=>{
    const result=buildCrossDocumentEvidence({clauses:[{documentId:"doc-a",documentName:"A.pdf",page:"4",quote:"Exact wording",heading:"IP ownership",evidenceStatus:"verified"}]});
    expect(result.evidence.clauses[0]).toMatchObject({documentName:"A.pdf",page:"4",quote:"Exact wording"});
    expect(result.documentIds).toEqual(["doc-a"]);
    expect(result.documentNames).toEqual(["A.pdf"]);
  });
  it("excludes quotes that were not verified against their uploaded source",()=>{
    const result=buildCrossDocumentEvidence({clauses:[{documentId:"doc-a",documentName:"A.pdf",page:"4",quote:"Unverified source wording"}]});
    expect(result.documentNames).toEqual([]);
    expect(result.omitted).toBe(1);
  });
  it("bounds comparison evidence and records omitted items",()=>{
    const result=buildCrossDocumentEvidence({clauses:Array.from({length:100},(_,i)=>({documentId:"doc-a",documentName:"A.pdf",page:String(i),quote:"Some contractual wording ".repeat(10),evidenceStatus:"verified"}))},{maxTokens:500});
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
  it("does not collapse distinct clauses that share only their opening words",()=>{
    const weaker={heading:"Termination",documentName:"A.pdf",page:"3",quote:"Either party may terminate",evidenceStatus:"not_located"};
    const stronger={heading:"Termination",documentName:"A.pdf",page:"3",quote:"Either party may terminate on thirty days written notice",evidenceStatus:"verified"};
    const merged=mergeSectionAnalyses([
      {documentOverview:"Overview A",executiveSummary:"Summary A",clauses:[weaker]},
      {documentOverview:"Overview B",executiveSummary:"Summary B",clauses:[stronger]}
    ]);
    expect(merged.clauses).toHaveLength(2);
    expect(merged.clauses.map(item=>item.quote)).toEqual([weaker.quote,stronger.quote]);
  });
  it("deduplicates identical findings independent of document ordering",()=>{
    expect(mergeCrossDocumentFindings(
      [{finding:"Conflict",documents:["A","B"],significance:"High"}],
      [{finding:"Conflict",documents:["B","A"],significance:"High"}]
    )).toHaveLength(1);
  });
  it("keeps same-filename uploads separate by stable document ID", () => {
    const result = buildCrossDocumentEvidence({ clauses: [
      { documentId:"doc-a",documentName:"Agreement.pdf",documentLabel:"Agreement.pdf",page:"1",quote:"The first party shall pay within thirty days.",evidenceStatus:"verified" },
      { documentId:"doc-b",documentName:"Agreement.pdf",documentLabel:"Agreement.pdf (upload 2)",page:"1",quote:"The second party shall pay within sixty days.",evidenceStatus:"verified" }
    ]});
    expect(result.documentIds).toEqual(["doc-a","doc-b"]);
    expect(result.evidenceByDocument["doc-a"]).toHaveLength(1);
    expect(result.evidenceByDocument["doc-b"]).toHaveLength(1);
  });

});

describe("document narrative consolidation",()=>{
  it("collapses repeated overview paragraphs for a single uploaded document",()=>{
    const analysis={
      documentOverview:"This is the employment agreement.\n\nThis is the employment agreement.\n\nIt covers salary and notice.",
      executiveSummary:"Summary one.\n\nSummary one.\n\nExtra detail.",
      clauses:[{documentName:"Offer.pdf",heading:"Salary"}]
    };
    consolidateDocumentNarratives(analysis,{documentNames:["Offer.pdf"]});
    expect(analysis.documentOverview).toBe("This is the employment agreement.\n\nIt covers salary and notice.");
    expect(analysis.executiveSummary).toBe("Summary one.\n\nExtra detail.");
  });
  it("does not collapse overviews when multiple original documents are present",()=>{
    const analysis={
      documentOverview:"Doc A overview.\n\nDoc B overview.",
      executiveSummary:"A.\n\nB.",
      clauses:[
        {documentName:"A.pdf",heading:"One"},
        {documentName:"B.pdf",heading:"Two"}
      ]
    };
    const before=analysis.documentOverview;
    consolidateDocumentNarratives(analysis,{documentNames:["A.pdf","B.pdf"]});
    expect(analysis.documentOverview).toBe(before);
  });
});

describe("cross-document claim validation",()=>{
  const comparison=buildCrossDocumentEvidence({
    clauses:[
      {documentId:"doc-a",documentName:"A.pdf",page:"2",quote:"The supplier shall deliver all goods by 1 June.",evidenceStatus:"verified"},
      {documentId:"doc-b",documentName:"B.pdf",page:"5",quote:"Delivery shall occur no later than 15 June.",evidenceStatus:"verified"}
    ]
  });
  it("accepts a finding only with two known documents and matching quotes from both",()=>{
    const findings=validateCrossDocumentFindings([{
      finding:"The delivery deadlines differ between the two agreements.",
      documents:["A.pdf","B.pdf"],
      documentIds:["doc-a","doc-b"],
      significance:"Potential timing conflict",
      evidence:[
        {documentId:"doc-a",documentName:"A.pdf",page:"2",quote:"The supplier shall deliver all goods by 1 June."},
        {documentId:"doc-b",documentName:"B.pdf",page:"5",quote:"Delivery shall occur no later than 15 June."}
      ]
    }],comparison);
    expect(findings).toHaveLength(1);
    expect(findings[0].evidence).toHaveLength(2);
  });
  it("rejects one-document, unknown-document and invented-quote claims",()=>{
    const findings=validateCrossDocumentFindings([
      {finding:"This is a one-document claim only.",documents:["A.pdf"],documentIds:["doc-a"],evidence:[]},
      {finding:"This names an unuploaded agreement.",documents:["A.pdf","Other.pdf"],documentIds:["doc-a","unknown"],evidence:[]},
      {finding:"This alleges a conflict without source evidence.",documents:["A.pdf","B.pdf"],documentIds:["doc-a","doc-b"],evidence:[
        {documentId:"doc-a",documentName:"A.pdf",quote:"Invented wording that is not in the agreement"},
        {documentId:"doc-b",documentName:"B.pdf",quote:"Also invented wording that is not in the agreement"}
      ]}
    ],comparison);
    expect(findings).toEqual([]);
  });
  it("rejects source quotes assigned to the wrong page",()=>{
    expect(validateCrossDocumentFindings([{
      finding:"The delivery deadlines differ between the two agreements.",
      documents:["A.pdf","B.pdf"],
      documentIds:["doc-a","doc-b"],
      evidence:[
        {documentId:"doc-a",documentName:"A.pdf",page:"99",quote:"The supplier shall deliver all goods by 1 June."},
        {documentId:"doc-b",documentName:"B.pdf",page:"5",quote:"Delivery shall occur no later than 15 June."}
      ]
    }],comparison)).toEqual([]);
  });
  it("rejects filename-only citations without stable document IDs", () => {
    expect(validateCrossDocumentFindings([{
      finding:"The delivery deadlines differ between the two agreements.",
      documents:["A.pdf","B.pdf"],
      evidence:[
        {documentName:"A.pdf",page:"2",quote:"The supplier shall deliver all goods by 1 June."},
        {documentName:"B.pdf",page:"5",quote:"Delivery shall occur no later than 15 June."}
      ]
    }],comparison)).toEqual([]);
  });

  it("requires the comparison quote to match the verified source quote exactly", () => {
    expect(validateCrossDocumentFindings([{
      finding:"The delivery deadlines differ between the two agreements.",
      documents:["A.pdf","B.pdf"],
      documentIds:["doc-a","doc-b"],
      evidence:[
        {documentId:"doc-a",documentName:"A.pdf",page:"2",quote:"The supplier shall deliver all goods."},
        {documentId:"doc-b",documentName:"B.pdf",page:"5",quote:"Delivery shall occur no later than 15 June."}
      ]
    }],comparison)).toEqual([]);
  });

  it("rejects unsupported or incomplete citations",()=>{
    expect(validateCrossDocumentFindings([{
      finding:"A comparison without citations for both sides.",
      documents:["A.pdf","B.pdf"],
      documentIds:["doc-a","doc-b"],
      evidence:[{documentId:"doc-a",documentName:"A.pdf",quote:"The supplier shall deliver all goods by 1 June."}]
    }],comparison)).toEqual([]);
  });
});
