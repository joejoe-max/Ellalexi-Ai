import{describe,it,expect}from"vitest";
import{buildPdfPageText,isMeaningfulPageText,getUnreadablePageNumbers}from"./documentExtraction.js";
describe("PDF text quality detection",()=>{it("recognises selectable page text",()=>{expect(isMeaningfulPageText("This page contains enough selectable legal document text to analyse properly.")).toBe(true)});it("flags image-only and decorative pages without text",()=>{expect(isMeaningfulPageText("")).toBe(false);expect(isMeaningfulPageText("LOGO")).toBe(false)});it("returns only pages needing OCR",()=>{expect(getUnreadablePageNumbers([{page:1,text:"This page contains enough selectable legal document text to analyse properly."},{page:2,text:""},{page:3,text:"x"}])).toEqual([2,3])})});

describe("PDF text reconstruction",()=> {
  it("does not insert spaces inside adjacent glyph runs",()=> {
    const items=[
      {str:"Contri",transform:[10,0,0,10,10,100],width:25},
      {str:"butor",transform:[10,0,0,10,35,100],width:22},
      {str:" agreement",transform:[10,0,0,10,57,100],width:48}
    ];
    expect(buildPdfPageText(items)).toBe("Contributor agreement");
  });
  it("preserves measured word gaps and line endings",()=> {
    const items=[
      {str:"The",transform:[10,0,0,10,10,100],width:15},
      {str:"Company",transform:[10,0,0,10,29,100],width:45,hasEOL:true},
      {str:"shall",transform:[10,0,0,10,10,88],width:20}
    ];
    expect(buildPdfPageText(items)).toBe("The Company\\nshall");
  });
});
