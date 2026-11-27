import {describe,it,expect} from "vitest";
import {retrieveStructuredEvidence,retrieveSourcePassages} from "./documentRetrieval.js";

describe("question-time evidence retrieval",()=>{
 const analysis={clauses:[{heading:"IP ownership",documentName:"IP Agreement",page:"4",quote:"All intellectual property belongs exclusively to the company.",plainMeaning:"The company owns the IP."},{heading:"Termination",documentName:"Founders Agreement",page:"8",quote:"Either founder may terminate on notice."}],crossDocumentFindings:[{finding:"Potential IP ownership conflict",documents:["IP Agreement","Founders Agreement"],significance:"Conflicting ownership wording."}]};
 it("ranks relevant clauses and cross-document findings",()=>{const result=retrieveStructuredEvidence(analysis,"ownership conflict");expect(result.evidence.some(item=>item.heading==="IP ownership")).toBe(true);expect(result.evidence.some(item=>item.category==="crossDocumentFindings")).toBe(true);});
 it("preserves source page and document for original passages",()=>{const result=retrieveSourcePassages([{name:"Agreement.pdf",pages:[{page:2,text:"Payment due each month."},{page:9,text:"Company owns all intellectual property created under this agreement."}]}],"Who owns intellectual property?");expect(result.passages[0]).toMatchObject({documentName:"Agreement.pdf",page:"9"});});
 it("caps evidence size",()=>{const result=retrieveStructuredEvidence({clauses:Array.from({length:200},(_,i)=>({heading:"IP "+i,quote:"intellectual property ".repeat(20)}))},"intellectual property",{maxTokens:400});expect(result.estimatedTokens).toBeLessThanOrEqual(400);});
});
