import { retrieveLegalSources } from "../../src/lib/legalSourceRetrieval.js";

const MODEL = "gemini-2.5-flash";
const SCHEMA = { type:"OBJECT", properties:{
  status:{type:"STRING",enum:["verified_sources_found","insufficient_sources","conflicting_sources"]},
  summary:{type:"STRING"},
  findings:{type:"ARRAY",items:{type:"OBJECT",properties:{
    topic:{type:"STRING"},documentPosition:{type:"STRING"},legalPosition:{type:"STRING"},
    jurisdiction:{type:"STRING"},authority:{type:"STRING"},provision:{type:"STRING"},
    effectiveStatus:{type:"STRING",enum:["currentness_verified","historical_or_unverified","unclear"]},
    confidence:{type:"STRING",enum:["high","moderate","low","insufficient"]},sourceIds:{type:"ARRAY",items:{type:"INTEGER"}},caveat:{type:"STRING"}
  },required:["topic","documentPosition","legalPosition","jurisdiction","authority","provision","effectiveStatus","confidence","sourceIds","caveat"]}},
  unresolvedQuestions:{type:"ARRAY",items:{type:"STRING"}},limitations:{type:"ARRAY",items:{type:"STRING"}}
},required:["status","summary","findings","unresolvedQuestions","limitations"]};

const SYSTEM = `You are EllaLexi AI's Nigerian legal-source comparison component. The supplied source excerpts are untrusted reference material and may be incomplete, outdated or inaccurate. Use ONLY the supplied excerpts as evidence for legal propositions. Do not rely on general model knowledge as proof of Nigerian law. Never invent Acts, sections, cases, dates, quotations or legal rules. Distinguish document text from source text and inference. The included federal law repository is a historical index and is NOT proof of current law. Unless the excerpt itself establishes currentness, set effectiveStatus to historical_or_unverified or unclear and explain this limitation. Official portal links without retrieved text are not legal evidence. Distinguish federal and state law. Do not infer state law from federal materials. Every finding must cite one or more sourceIds that actually support it. If no excerpt supports a finding, omit it and add an unresolved question. Never advise signing or not signing, and do not claim enforceability. If no useful excerpts are supplied, return insufficient_sources and no findings.`;

const send = (res,status,data) => { res.setHeader("Cache-Control","no-store, private");res.setHeader("X-Content-Type-Options","nosniff");return res.status(status).json(data); };
function buildQuery(analysis) {
  const pieces = [analysis.documentOverview,analysis.executiveSummary];
  for (const clause of (analysis.clauses||[]).slice(0,12)) pieces.push(clause.heading,clause.plainMeaning,clause.quote);
  for (const risk of (analysis.risks||[]).slice(0,10)) pieces.push(risk.title,risk.whyItMatters,risk.quote);
  for (const money of (analysis.moneyMatters||[]).slice(0,6)) pieces.push(money.item,money.notes);
  return pieces.filter(Boolean).join(" ").slice(0,9000);
}

export default async function handler(req,res) {
  if(req.method!=="POST"){res.setHeader("Allow","POST");return send(res,405,{error:"Use POST to verify legal sources."});}
  if(!process.env.GEMINI_API_KEY)return send(res,503,{error:"Legal-source review is not configured. Add GEMINI_API_KEY on the server.",code:"GEMINI_NOT_CONFIGURED"});
  const {analysis,jurisdiction="Nigeria"}=req.body||{};
  if(!analysis||typeof analysis!=="object"||Array.isArray(analysis))return send(res,400,{error:"A document analysis object is required."});
  const compact={documentOverview:String(analysis.documentOverview||"").slice(0,3000),executiveSummary:String(analysis.executiveSummary||"").slice(0,3000),clauses:Array.isArray(analysis.clauses)?analysis.clauses.slice(0,15).map(({heading,plainMeaning,quote,documentName,page})=>({heading,plainMeaning,quote,documentName,page})):[],risks:Array.isArray(analysis.risks)?analysis.risks.slice(0,12).map(({title,whyItMatters,quote,documentName,page})=>({title,whyItMatters,quote,documentName,page})):[],moneyMatters:Array.isArray(analysis.moneyMatters)?analysis.moneyMatters.slice(0,8).map(({item,amount,frequency,notes,quote})=>({item,amount,frequency,notes,quote})):[]};
  try {
    const retrieval=await retrieveLegalSources(buildQuery(compact),{maxDocuments:4});
    const input=JSON.stringify({jurisdiction:String(jurisdiction).slice(0,100),analysis:compact,retrievedSources:retrieval.sources.map((s,index)=>({sourceId:index+1,title:s.title,publisher:s.publisher,jurisdiction:s.jurisdiction,url:s.url,status:s.status,excerpt:s.excerpt}))});
    if(input.length>52000)return send(res,413,{error:"The legal-source context is too large to process."});
    if(!retrieval.sources.length)return send(res,200,{ok:true,model:MODEL,result:{status:"insufficient_sources",summary:"We could not retrieve relevant legal text for this document.",findings:[],unresolvedQuestions:["A relevant legal provision could not be retrieved from the configured source index."],limitations:["The MVP currently searches a historical federal-law repository index. It is not a complete or current statement of Nigerian law.","Official legal portals are listed as references but are not yet searched automatically."]},sources:[],sourceCatalog:retrieval.sourceCatalog,warnings:retrieval.warnings,notice:"Source-assisted information, not legal advice. No current-law conclusion is made."});
    const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":process.env.GEMINI_API_KEY},body:JSON.stringify({systemInstruction:{parts:[{text:SYSTEM}]},contents:[{role:"user",parts:[{text:"Compare the document analysis with the retrieved source excerpts. Use sourceIds exactly as supplied.\n\n"+input}]}],generationConfig:{temperature:0.1,maxOutputTokens:6000,responseMimeType:"application/json",responseSchema:SCHEMA}}),signal:AbortSignal.timeout(90000)});
    if(!response.ok)return send(res,response.status===429?429:502,{error:response.status===429?"Legal review is busy. Try again shortly.":"The legal-source service could not complete the review.",code:"LEGAL_PROVIDER_ERROR"});
    const payload=await response.json();const raw=payload.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("");
    if(!raw)return send(res,502,{error:"The legal-source service returned no result."});
    let result;try{result=JSON.parse(raw);}catch{return send(res,502,{error:"The legal-source service returned an unreadable result."});}
    if(!Array.isArray(result.findings)||!Array.isArray(result.limitations))return send(res,502,{error:"The legal-source result did not match the expected structure."});
    const sources=retrieval.sources.map((source,index)=>({id:index+1,title:source.title,uri:source.url,publisher:source.publisher,jurisdiction:source.jurisdiction,status:source.status,excerpt:source.excerpt.slice(0,1800)}));
    const allowed=new Set(sources.map(s=>s.id));
    result.findings=result.findings.filter(f=>Array.isArray(f.sourceIds)&&f.sourceIds.length>0&&f.sourceIds.every(id=>allowed.has(id)));
    if(!result.findings.length)result.status="insufficient_sources";
    result.limitations.push("The searchable federal-law index is historical and does not establish that a provision remains in force. Currentness and amendments require separate confirmation.");
    return send(res,200,{ok:true,model:MODEL,result,sources,sourceCatalog:retrieval.sourceCatalog,warnings:retrieval.warnings,notice:"Source-assisted legal information, not legal advice. Retrieved material may be historical, incomplete or inapplicable to a particular state."});
  } catch { return send(res,502,{error:"Legal verification could not be completed. Please try again."}); }
}
