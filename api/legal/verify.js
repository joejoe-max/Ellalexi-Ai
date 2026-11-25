import { retrieveLegalSources } from "../../src/lib/legalSourceRetrieval.js";
import { searchLiveLegalSources } from "../../src/lib/liveLegalSearch.js";
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
const SYSTEM = "You are EllaLexi AI's Nigerian legal-source comparison component. Use ONLY supplied retrieved excerpts as evidence. Never rely on general model knowledge as proof of Nigerian law. Never invent Acts, sections, cases, dates, quotations or legal rules. Distinguish document text from source text and inference. Distinguish enacted laws from bills, proposals, policy announcements and news. A newer upload does not prove commencement, repeal or legal effect. Treat source authority/status metadata as context. A historical repository mirror is not proof of current law. A live search result is not automatically current or authoritative. Do not say currentness is verified unless retrieved source text explicitly establishes the relevant legal effect and date. Distinguish federal and state law. Do not infer state law from federal materials. Every finding must cite sourceIds that support it. If no excerpt supports a finding, omit it and add an unresolved question. Never advise signing or not signing, and do not claim enforceability. If no useful excerpts are supplied, return insufficient_sources and no findings.";
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
    const query=buildQuery(compact);
    const [live,local]=await Promise.all([
      searchLiveLegalSources(query,{apiKey:process.env.GEMINI_API_KEY}),
      retrieveLegalSources(query,{maxDocuments:3})
    ]);
    const combined=[...live.sources,...local.sources].slice(0,8);
    const warnings=[...live.warnings,...local.warnings];
    if(!combined.length)return send(res,200,{ok:true,model:MODEL,result:{status:"insufficient_sources",summary:"We could not retrieve relevant legal text from the live web or local source index.",findings:[],unresolvedQuestions:["A relevant legal provision could not be retrieved in full. Search snippets were not treated as evidence."],limitations:["Live Google Search discovery was attempted, but no eligible source page could be retrieved.","The local repository is a historical fallback and does not establish current Nigerian law."]},sources:[],sourceCatalog:local.sourceCatalog,warnings,search:{liveAttempted:live.searched,liveSources:0,localSources:0},notice:"Source-assisted information, not legal advice. No current-law conclusion is made."});
    const input=JSON.stringify({jurisdiction:String(jurisdiction).slice(0,100),analysis:compact,retrievedSources:combined.map((s,index)=>({sourceId:index+1,title:s.title,publisher:s.publisher,jurisdiction:s.jurisdiction,authority:s.authority||"historical_repository_mirror",status:s.status,publicationYear:s.publicationYear,excerpt:s.excerpt}))});
    if(input.length>52000)return send(res,413,{error:"The legal-source context is too large to process."});
    const response=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+MODEL+":generateContent",{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":process.env.GEMINI_API_KEY},body:JSON.stringify({systemInstruction:{parts:[{text:SYSTEM}]},contents:[{role:"user",parts:[{text:"Compare the document analysis with retrieved live and local source excerpts. Use sourceIds exactly as supplied. Do not infer that a source is current merely because it appeared in live search.\n\n"+input}]}],generationConfig:{temperature:0.1,maxOutputTokens:6000,responseMimeType:"application/json",responseSchema:SCHEMA}}),signal:AbortSignal.timeout(90000)});
    if(!response.ok)return send(res,response.status===429?429:502,{error:response.status===429?"Legal review is busy. Try again shortly.":"The legal-source service could not complete the review.",code:"LEGAL_PROVIDER_ERROR"});
    const payload=await response.json();const raw=payload.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("");
    if(!raw)return send(res,502,{error:"The legal-source service returned no result."});
    let result;try{result=JSON.parse(raw);}catch{return send(res,502,{error:"The legal-source service returned an unreadable result."});}
    if(!Array.isArray(result.findings)||!Array.isArray(result.limitations))return send(res,502,{error:"The legal-source result did not match the expected structure."});
    const sources=combined.map((source,index)=>({id:index+1,title:source.title,uri:source.url,publisher:source.publisher,jurisdiction:source.jurisdiction,authority:source.authority||"historical_repository_mirror",status:source.status,year:source.publicationYear||null,excerpt:source.excerpt.slice(0,1800)}));
    const sourceById=new Map(sources.map(s=>[s.id,s]));
    result.findings=result.findings.flatMap(f=>{
      if(!Array.isArray(f.sourceIds)||!f.sourceIds.length)return [];
      const citations=f.sourceIds.map(id=>sourceById.get(id)).filter(Boolean).map(source=>{
        const provision=String(f.provision||"").trim();
        const sectionMatch=provision.match(/(?:section|s\.)\s*([0-9]+[A-Za-z]?(?:\([0-9A-Za-z]+\))*)/i);
        const sectionNumber=sectionMatch?.[1]?.toLowerCase();
        const sectionPattern=sectionNumber?new RegExp("(?:section|s\\.)\\s*"+sectionNumber.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"(?![0-9])","i"):null;
        const provisionVerified=Boolean(sectionPattern&&sectionPattern.test(source.excerpt));
        if(!source.year||(sectionMatch&&!provisionVerified))return null;
        return {sourceId:source.id,authority:source.title,year:source.year,provision:provisionVerified?provision:"Provision not independently located in retrieved excerpt",publisher:source.publisher,jurisdiction:source.jurisdiction,url:source.uri,provisionVerified,sourceStatus:source.status,sourceAuthority:source.authority};
      }).filter(Boolean);
      return citations.length?[{...f,citations}]:[];
    });
    if(!result.findings.length)result.status="insufficient_sources";
    result.limitations.push("Live web discovery can miss relevant laws or amendments. A retrieved page does not alone establish commencement, repeal, currentness or legal effect.");
    result.limitations.push("The local federal-law repository is a historical fallback, not a current consolidated statement of Nigerian law.");
    return send(res,200,{ok:true,model:MODEL,result,sources,sourceCatalog:local.sourceCatalog,warnings,search:{liveAttempted:live.searched,liveSources:live.sources.length,localSources:local.sources.length},notice:"Source-assisted legal information, not legal advice. Check the cited material and seek a qualified Nigerian legal practitioner for important decisions."});
  } catch { return send(res,502,{error:"Legal verification could not be completed. Please try again."}); }
}
