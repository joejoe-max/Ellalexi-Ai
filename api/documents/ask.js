import formidable from "formidable";
import fs from "node:fs/promises";
import {fileTypeFromBuffer} from "file-type";
import {streamWithFallback} from "../_lib/reasoning.js";
import {preparePdfDocument,extractDocxDocument} from "../_lib/documentExtraction.js";
import {startSSE,sendEvent,endSSE,sendSafeError} from "../_lib/sse.js";
export const config={api:{bodyParser:false}};
const MAX_FILES=5,MAX_FILE=10*1024*1024,MAX_TOTAL=25*1024*1024,MAX_TEXT=180000;

const SYSTEM = `You are EllaBrief, a Nigerian legal-document explanation assistant. Help ordinary people understand what they are being asked to sign — what the document says and how that sits against ordinary Nigerian legal principles.

## How to answer

1. **Document first** — Ground answers in the ORIGINAL uploaded document and the structured analysis. Never invent clauses, page numbers, parties, deadlines or amounts that are not in the source.

2. **Legal questions** — If the user asks about the law, rights to sue, remedies, enforceability, red flags, or breach, you MUST answer that part. Do not refuse with "the document does not mention Nigerian law".

3. **Direct answers for "can I sue?" style questions** — When the user asks whether they can sue, take legal action, or enforce the agreement if the other party breaches:
   - Open with a clear direct line such as: "Yes — under ordinary Nigerian contract principles you can generally sue for breach of a binding agreement, subject to the points below."
   - Then explain conditions: the agreement must be binding, there must be a breach, any dispute-resolution clause, limitation periods, practical cost and evidence, and anything in THIS document that helps or hurts that path.
   - Do not hide behind only "consult a lawyer" without first answering the question.
   - Still do not promise a court will rule in their favour.

4. **Use legal review when present** — Prefer cited retrieved sources when available; otherwise use general Nigerian principles clearly labelled as such.

5. **Do not invent** Act section numbers, case names or gazette dates unless they appear in the supplied legalReview.

6. **Disclaimer** — End with ONE short line only, for example: "This is general information, not formal legal advice — confirm with a Nigerian lawyer before acting." Do not repeat long multi-paragraph disclaimers. Do not paste technical notes about "structured review" or "source files".

7. **Never** tell the user to sign or not to sign. Never invent facts about the parties.

Use simple terms. Be concrete and useful.`;

function parse(req){const form=formidable({multiples:true,maxFiles:MAX_FILES,maxFileSize:MAX_FILE,maxTotalFileSize:MAX_TOTAL,allowEmptyFiles:false,minFileSize:1,keepExtensions:true});return new Promise((resolve,reject)=>form.parse(req,(e,fields,files)=>e?reject(e):resolve({fields,files})));}
const one=value=>Array.isArray(value)?value[0]:value;
function field(fields,key){const value=one(fields[key]);if(typeof value!=="string")return null;try{return JSON.parse(value);}catch{return null;}}
/* eslint-disable no-control-regex */
function clean(value){return String(value||"").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,"");}

function questionTerms(question){return [...new Set(String(question||"").toLowerCase().match(/[a-z0-9]{3,}/g)||[])].filter(term=>!["the","and","for","that","this","with","from","what","which","does","about","into","are","you","can","will","have","has","its"].includes(term));}
function retrieveRelevantEvidence(analysis,question,{maxItems=16,maxChars=14000}={}){
 const terms=questionTerms(question);const groups=["crossDocumentFindings","clauses","rightsAndObligations","risks","moneyMatters","parties","missingProtections","questions"];const ranked=[];
 for(const group of groups){for(const item of Array.isArray(analysis?.[group])?analysis[group]:[]){const text=JSON.stringify(item);const lower=text.toLowerCase();const score=terms.reduce((sum,term)=>sum+(lower.includes(term)?1:0),0)+(group==="crossDocumentFindings"?1:0);if(score>0)ranked.push({group,item,score});}}
 ranked.sort((a,b)=>b.score-a.score);let used=0;const selected={};
 for(const row of ranked){if(Object.values(selected).flat().length>=maxItems)break;const text=JSON.stringify(row.item);if(used+text.length>maxChars)continue;(selected[row.group] ||= []).push(row.item);used+=text.length;}
 return {documentOverview:String(analysis.documentOverview||"").slice(0,1800),executiveSummary:String(analysis.executiveSummary||"").slice(0,1800),evidence:selected,limitations:(analysis.limitations||[]).slice(0,6),evidenceItems:Object.values(selected).reduce((n,a)=>n+a.length,0)};
}
function isLegalQuestion(question){
  return /\b(law|legal|sue|suing|sued|court|rights?|remed(y|ies)|enforce|breach|liable|liability|statute|act\b|cama|constitution|illegal|unlawful|red ?flag|protect(ion|ed)?|damages|injunction|arbitration|dispute)\b/i.test(question);
}
function needsOriginalSource(question){
  return /\b(clause|section|article|paragraph|page|quote|quotation|exact wording|word.?for.?word|verbatim|where (?:does|is)|what (?:does|do) .{0,35} say|in the (?:original )?document|according to (?:the )?(?:document|agreement)|wording of|text of)\b/i.test(question);
}
function isSueQuestion(question){
  return /\b(can i sue|could i sue|may i sue|right to sue|sue (them|him|her|the|if)|take (them|him|her) to court|legal action|enforce (the )?agreement)\b/i.test(question);
}

export default async function handler(req,res){
 if(req.method!=="POST"){res.setHeader("Allow","POST");return res.status(405).json({error:"Method not allowed."});}
 startSSE(res);const paths=[];const buffers=[];
 try{
  const {fields,files}=await parse(req);const question=clean(one(fields.question));const analysis=field(fields,"analysis");const legalReview=field(fields,"legalReview");
  if(!question.trim()||question.length>1200)throw Object.assign(new Error(),{userMessage:"Enter a question of up to 1,200 characters.",kind:"invalid_request"});
  if(!analysis||typeof analysis!=="object"||Array.isArray(analysis))throw Object.assign(new Error(),{userMessage:"The active document analysis is required.",kind:"invalid_request"});
  const sourceRequested=needsOriginalSource(question);
  const raw=sourceRequested?files.documents:null;const uploads=Array.isArray(raw)?raw:raw?[raw]:[];const parts=[];let total=0,textChars=0;
  for(const file of uploads){
   paths.push(file.filepath);const buffer=await fs.readFile(file.filepath);buffers.push(buffer);total+=buffer.length;
   if(total>MAX_TOTAL)throw Object.assign(new Error("The source files exceed the supported combined size."),{status:413});
   const detected=await fileTypeFromBuffer(buffer);const pdf=detected?.mime==="application/pdf"&&buffer.subarray(0,5).toString()==="%PDF-";const docx=detected?.mime==="application/zip"&&buffer.subarray(0,2).toString()==="PK";
   if(!pdf&&!docx)throw Object.assign(new Error("A source file is not a valid PDF or DOCX."),{status:400});
   const name=clean(file.originalFilename||"Uploaded document").slice(0,180);
   const extracted=pdf?await preparePdfDocument(buffer):await extractDocxDocument(buffer);
   const text=String(extracted.text||"").slice(0,Math.max(0,MAX_TEXT-textChars));textChars+=text.length;
   if(text)parts.push({text:"ORIGINAL DOCUMENT: "+name+" ("+(pdf?"PDF":"DOCX")+")\n"+text});
  }
  const context=JSON.stringify(retrieveRelevantEvidence(analysis,question));
  if(context.length>18000)throw Object.assign(new Error("Relevant evidence is too large for follow-up."),{userMessage:"This question matches too much material. Narrow it to a particular clause, party or subject.",kind:"invalid_request"});
  let legalHint="";
  if(isSueQuestion(question)){
    legalHint="\n\nINSTRUCTION: This is a can-I-sue / enforcement question. Start with a clear direct answer (Yes, under ordinary Nigerian contract principles you can generally sue for breach of a binding agreement, subject to…). Then explain the conditions using THIS document. End with one short disclaimer line only. Do not add technical notes about structured review or source files.";
  }else if(isLegalQuestion(question)){
    legalHint="\n\nINSTRUCTION: Legal question. Answer what the document says, what it means, and relevant general Nigerian principles. One short disclaimer line at the end only. No technical meta-notes about structured review.";
  }

  parts.push({text:"STRUCTURED REVIEW (secondary context):\n"+context+"\n\nUSER QUESTION:\n"+question.trim()+legalHint});
  if(!uploads.length)parts.unshift({text:"No original file was attached to this follow-up. Use only the structured analysis and clearly state when the source wording cannot be checked."});
  sendEvent(res,"status",{message:sourceRequested?"Checking the original wording and preparing your answer…":"Using your completed document review to prepare an answer…"});
  const {text}=await streamWithFallback({systemInstruction:SYSTEM,parts,generationConfig:{temperature:0.2,maxOutputTokens:2800},timeout:65000,onToken:chunk=>sendEvent(res,"delta",{text:chunk}),onFallback:()=>sendEvent(res,"fallback",{message:"Trying another AI service…"})});
  const answer=String(text||"").trim();if(!answer)throw Object.assign(new Error(),{userMessage:"The assistant returned an empty answer. Please rephrase your question.",kind:"empty_response"});
  sendEvent(res,"complete",{answer});endSSE(res);
 }catch(error){sendSafeError(res,error);}finally{for(const buffer of buffers)buffer.fill(0);for(const path of paths){try{await fs.unlink(path);}catch{ /* Ignore malformed optional fields; validation below returns a safe error. */ }}}
}
