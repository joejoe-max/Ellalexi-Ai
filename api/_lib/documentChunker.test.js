import {describe,it,expect} from "vitest";
import {estimateTokens,chunkDocument,buildAnalysisBatches} from "./documentChunker.js";

describe("document chunking",()=>{
  it("estimates a nonzero token budget for text",()=>expect(estimateTokens("A legal agreement creates obligations.")).toBeGreaterThan(0));
  it("preserves document identity and page provenance",()=>{
    const chunks=chunkDocument({id:"a",name:"Agreement.pdf",pages:[{page:2,text:"First clause wording."},{page:3,text:"Second clause wording."}]});
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({documentId:"a",documentName:"Agreement.pdf",startPage:"2",endPage:"3"});
    expect(chunks[0].text).toContain("[Page 2]");
    expect(chunks[0].text).toContain("[Page 3]");
  });
  it("splits long documents into bounded chunks",()=>{
    const chunks=chunkDocument({name:"Long.docx",text:Array.from({length:900},(_,i)=>`Paragraph ${i} contains contractual wording and obligations.`).join("\\n\\n")},{targetTokens:600,overlapTokens:40});
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every(chunk=>chunk.estimatedTokens>0)).toBe(true);
  });
  it("builds chunks independently for every uploaded document",()=>{
    const chunks=buildAnalysisBatches([{name:"A",text:"Alpha clause."},{name:"B",text:"Beta clause."}]);
    expect(chunks.map(chunk=>chunk.documentName)).toEqual(["A","B"]);
  });
  it("adds overlap once at the beginning of the next chunk, never inside an existing chunk",()=>{
    const targetTokens=500, overlapTokens=20, maxChars=Math.floor(targetTokens*3.2);
    const first="FIRST-CLAUSE ".repeat(105);
    const second="SECOND-CLAUSE ".repeat(150);
    const third="THIRD-CLAUSE ".repeat(150);
    const chunks=chunkDocument({name:"Long.pdf",pages:[{page:4,text:[first,second,third].join("\\n")}]},{targetTokens,overlapTokens});
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].text).toContain("FIRST-CLAUSE");
    expect(chunks[0].text).not.toContain("THIRD-CLAUSE");
    expect(chunks[1].overlapFromPrevious).toBe(true);
    const secondChunkBody=chunks[1].text.split("[Page 4]\\n").slice(1).join("[Page 4]\\n");
    expect(secondChunkBody).toContain("FIRST-CLAUSE");
    expect(chunks[1].text).toContain("SECOND-CLAUSE");
    expect(chunks.every(chunk=>chunk.text.length<=maxChars+64)).toBe(true);
  });
  it("does not overlap across a real page boundary",()=>{
    const chunks=chunkDocument({name:"Pages.pdf",pages:[{page:1,text:"A ".repeat(100)},{page:2,text:"B ".repeat(100)}]},{targetTokens:500,overlapTokens:20});
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toContain("[Page 1]");
    expect(chunks[0].text).toContain("[Page 2]");
  });
  it("supports an explicit zero-overlap setting",()=>{
    const chunks=chunkDocument({name:"NoOverlap.pdf",text:"Clause ".repeat(900)},{targetTokens:500,overlapTokens:0});
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.slice(1).every(chunk=>!chunk.overlapFromPrevious)).toBe(true);
  });
});
