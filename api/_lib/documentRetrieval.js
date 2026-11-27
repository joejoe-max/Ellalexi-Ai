import {estimateTokens} from "./documentChunker.js";

const FIELDS=["parties","clauses","rightsAndObligations","risks","moneyMatters","missingProtections","questions","crossDocumentFindings","limitations"];
const STOP=new Set("what which when where who whom whose how does do did is are was were can could would should the a an and or of to for in on at by with from about this that these those it me my our their they them its be been being explain tell compare between across all documents document agreement".split(" "));
const terms=value=>String(value||"").toLowerCase().normalize("NFKC").match(/[a-z0-9]{3,}/g)?.filter(term=>!STOP.has(term))||[];
function searchable(item){return [item?.name,item?.role,item?.source,item?.heading,item?.documentName,item?.page,item?.quote,item?.plainMeaning,item?.practicalEffect,item?.party,item?.kind,item?.description,item?.title,item?.severity,item?.whoAffected,item?.whyItMatters,item?.item,item?.amount,item?.frequency,item?.notes,item?.protection,item?.scope,item?.question,item?.reason,item?.finding,item?.significance].filter(Boolean).join(" ");}
function score(item,queryTerms){const hay=searchable(item).toLowerCase();let hits=0;for(const term of queryTerms)if(hay.includes(term))hits++;return hits/(queryTerms.length||1);}
export function retrieveStructuredEvidence(analysis,question,{maxTokens=2600,maxItems=36}={}) {
 const queryTerms=[...new Set(terms(question))];
 const ranked=[];
 for(const field of FIELDS){for(const item of Array.isArray(analysis?.[field])?analysis[field]:[]){const relevance=score(item,queryTerms);if(relevance>0||!queryTerms.length)ranked.push({field,item,relevance});}}
 ranked.sort((a,b)=>b.relevance-a.relevance);
 const selected=[];let used=0;
 for(const entry of ranked){if(selected.length>=maxItems)break;const candidate={category:entry.field,...entry.item};const cost=estimateTokens(JSON.stringify(candidate));if(used+cost>maxTokens)continue;selected.push(candidate);used+=cost;}
 return {question,evidence:selected,estimatedTokens:used,totalCandidates:ranked.length,omitted:Math.max(0,ranked.length-selected.length)};
}

export function retrieveSourcePassages(documents,question,{maxTokens=1800,maxPages=12}={}) {
 const queryTerms=[...new Set(terms(question))];
 const pages=(documents||[]).flatMap(doc=>(doc.pages||[]).map(page=>({documentName:doc.name,page:String(page.page),text:String(page.text||"")})));
 const ranked=pages.map(page=>({...page,relevance:score(page,queryTerms)})).filter(page=>page.text.trim()&&(!queryTerms.length||page.relevance>0)).sort((a,b)=>b.relevance-a.relevance);
 const selected=[];let used=0;
 for(const page of ranked){if(selected.length>=maxPages)break;const text=page.text.slice(0,Math.max(0,(maxTokens-used)*3));if(!text)continue;const passage={documentName:page.documentName,page:page.page,text};const cost=estimateTokens(JSON.stringify(passage));if(used+cost>maxTokens)continue;selected.push(passage);used+=cost;}
 return {passages:selected,estimatedTokens:used,omitted:Math.max(0,ranked.length-selected.length)};
}
