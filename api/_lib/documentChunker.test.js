import {describe,it,expect} from "vitest";
import {estimateTokens,chunkDocument,buildAnalysisBatches} from "./documentChunker.js";

describe("document chunking",()=>{
  it("estimates a nonzero token budget for text",()=>expect(estimateTokens("A legal agreement creates obligations.")).toBeGreaterThan(0));
  it("preserves document identity and page provenance",()=>{
    const chunks=chunkDocument({id:"a",name:"Agreement.pdf",pages:[{page:2,text:"First clause wording."},{page:3,text:"Second clause wording."}]});
    expect(chunks.length).toBe(1);
    expect(chunks[0]).toMatchObject({documentId:"a",documentName:"Agreement.pdf",startPage:"2",endPage:"3"});
    expect(chunks[0].text).toContain("[Page 2]");
    expect(chunks[0].text).toContain("[Page 3]");
  });
  it("splits long documents into bounded chunks",()=>{
    const chunks=chunkDocument({name:"Long.docx",text:Array.from({length:900},(_,i)=>`Paragraph ${i} contains contractual wording and obligations.\n\n`).join("")},{targetTokens:600,overlapTokens:40});
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every(chunk=>chunk.estimatedTokens>0)).toBe(true);
  });
  it("builds chunks independently for every uploaded document",()=>{
    const chunks=buildAnalysisBatches([{name:"A",text:"Alpha clause."},{name:"B",text:"Beta clause."}]);
    expect(chunks.map(chunk=>chunk.documentName)).toEqual(["A","B"]);
  });
  it("repeats overlap only after a chunk boundary",()=>{
    const targetTokens=600;
    const maxChars=Math.floor(targetTokens*3.2);
    const head="Alpha clause wording. ".repeat(Math.ceil((maxChars*0.7)/22));
    const tail="Beta obligation wording. ".repeat(Math.ceil(maxChars/24));
    const chunks=chunkDocument({name:"Long.pdf",pages:[{page:4,text:head+"\n"+tail}]},{targetTokens,overlapTokens:40});
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].text.includes("Beta obligation")).toBe(false);
    expect(chunks[0].text.split("Alpha clause wording.").length-1).toBeLessThan(chunks[0].text.length);
    const overlap=head.slice(-Math.floor(40*3.2)).trim();
    expect(chunks[1].text.includes(overlap.slice(0,80))).toBe(true);
    expect(chunks[1].text.includes("Beta obligation wording.")).toBe(true);
    expect(chunks[1].startPage).toBe("4");
  });
});
