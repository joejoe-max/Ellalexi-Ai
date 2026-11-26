import {useEffect,useRef,useState,useMemo} from "react";
import {Link} from "react-router-dom";
import {ArrowLeft,ArrowRight,CheckCircle2,FileText,FileUp,LoaderCircle,ShieldCheck,Trash2,UploadCloud,XCircle,AlertTriangle,ChevronDown,ChevronUp} from "lucide-react";
import {validateFiles,MAX_FILES,MAX_TOTAL_BYTES} from "../lib/uploadValidation.js";
import {getWorkspaceSections} from "../lib/analysisWorkspace.js";
import AnalysisTools from "../components/AnalysisTools.jsx";
import {consumeSSE} from "../lib/sse.js";
import {loadReviewSession,saveReviewSession,clearReviewSession} from "../lib/reviewSession.js";

const size=n=>n<1048576?`${Math.max(1,Math.round(n/1024))} KB`:`${(n/1048576).toFixed(1)} MB`;

function Evidence({item}){
  const verified=item.evidenceStatus==="verified";
  const showQuote=Boolean(item.quote);
  return <div className="analysis-evidence">
    {showQuote&&<blockquote>“{item.quote}”</blockquote>}
    <small>{item.documentName}{item.page&&item.page!=="not available"?` · Page ${item.page}`:""}</small>
    {verified&&<p className="evidence-ok">Matched against the document text.</p>}

    {!verified&&item.evidenceStatus==="not_located"&&<p>Could not automatically re-find this passage in the extracted text. Compare with the original document.</p>}
  </div>;
}

function ListSection({id,title,items,render}){
  if(!items?.length)return null;
  return <section className="analysis-section" id={id} aria-labelledby={`${id}-heading`}><h3 id={`${id}-heading`}>{title}<span>{items.length}</span></h3><div className="analysis-list">{items.map((item,i)=><article className="analysis-card" key={i}>{render(item)}</article>)}</div></section>;
}

function uniqueLimitations(list){
  const seen=new Set();
  const out=[];
  for(const item of list||[]){
    const key=String(item||"").toLowerCase().replace(/\s+/g," ").trim();
    if(!key||seen.has(key))continue;
    // Drop near-duplicate disclaimer noise
    if(/not (constitute )?formal legal advice|educational legal information|confirm (important points )?with a qualified|no primary-source|no live primary-source|section numbers and case authorities were intentionally/i.test(key))continue;
    seen.add(key);
    out.push(item);
    if(out.length>=2)break;
  }
  return out;
}

export default function UploadPage(){
  const input=useRef(null);
  const[files,setFiles]=useState([]);
  const[drag,setDrag]=useState(false);
  const[error,setError]=useState("");
  const[loading,setLoading]=useState(false);
  const[result,setResult]=useState(null);
  const[legalReview,setLegalReview]=useState(null);
  const[sessionReady,setSessionReady]=useState(false);
  const[sessionNotice,setSessionNotice]=useState("");
  const[legalExpanded,setLegalExpanded]=useState(false);

  useEffect(()=>{let active=true;loadReviewSession().then(saved=>{if(!active||!saved)return;setFiles(saved.files||[]);setResult(saved.result||null);setLegalReview(saved.legalReview||null);setSessionNotice("Your previous review and original files were restored on this device.");}).catch(()=>{if(active)setSessionNotice("A previous review could not be restored from this browser.");}).finally(()=>{if(active)setSessionReady(true);});return()=>{active=false;};},[]);
  useEffect(()=>{if(!sessionReady)return;if(files.length||result){saveReviewSession({files,result,legalReview}).then(()=>setSessionNotice(result?"Review and original files are saved privately on this device.":"Selected files are saved privately on this device.")).catch(()=>setSessionNotice("This browser could not save the files. Keep the originals available for follow-up questions."));}else{clearReviewSession().catch(()=>{});}},[files,result,legalReview,sessionReady]);

  function add(incoming){const next=[...files];for(const f of Array.from(incoming||[]))if(!next.some(x=>x.name===f.name&&x.size===f.size&&x.lastModified===f.lastModified))next.push(f);const issue=validateFiles(next);if(issue){setError(issue);return;}setFiles(next);setError("");setResult(null);setLegalReview(null);setLegalExpanded(false);}
  function remove(i){setFiles(old=>old.filter((_,n)=>n!==i));setError("");setResult(null);setLegalReview(null);setLegalExpanded(false);}

  async function submit(){
    const issue=validateFiles(files);if(issue){setError(issue);return;}
    setLoading(true);setError("");setResult(null);setLegalReview(null);setLegalExpanded(false);
    const body=new FormData();files.forEach(f=>body.append("documents",f));
    try{
      const response=await fetch("/api/documents/analyze",{method:"POST",body});
      let completed=null;
      await consumeSSE(response,{onEvent:(event,data)=>{if(event==="status")setError("");if(event==="complete")completed=data;}});
      if(!completed)throw new Error("The analysis did not return a complete result. Please try again.");
      setError("");setResult(completed);setLegalReview({loading:true});
      try{
        const lr=await fetch("/api/legal/verify",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({analysis:completed.analysis,jurisdiction:"Nigeria"})});
        let ld=null;
        await consumeSSE(lr,{onEvent:(event,data)=>{if(event==="complete")ld=data;if(event==="fallback")setLegalReview({loading:true,message:data.message});}});
        if(!ld)throw new Error("Legal verification did not return a complete result.");
        setLegalReview({data:ld});
      }catch(le){setLegalReview({error:le.message||"Legal verification unavailable."});}
    }catch(e){setError(e.message||"Network error. Please try again.");}
    finally{setLoading(false);}
  }

  const analysis=result?.analysis;
  const ready=result?.documents?.length||0;
  const workspaceSections=getWorkspaceSections(analysis);
  const legalStatus=legalReview?.data?.result?.status;
  const legalIsPrinciples=legalStatus==="general_principles"||legalReview?.data?.result?.mode==="general_principles";
  const allFindings=legalReview?.data?.result?.findings||[];
  const shownFindings=allFindings;
  const cleanLimitations=useMemo(()=>uniqueLimitations(legalReview?.data?.result?.limitations),[legalReview?.data?.result?.limitations]);
  const cleanQuestions=useMemo(()=>{
    const qs=legalReview?.data?.result?.unresolvedQuestions||[];
    return qs.filter(q=>!/not constitute formal legal advice|educational legal information/i.test(String(q||""))).slice(0,4);
  },[legalReview?.data?.result?.unresolvedQuestions]);

  return <section className="upload-page section-wrap">
    <Link className="upload-back" to="/"><ArrowLeft size={15}/> Back to EllaBrief</Link>
    <div className="upload-heading"><div className="eyebrow"><span className="eyebrow-dot"/> DOCUMENT ANALYSIS</div><h1>Understand your<br/><em>documents.</em></h1><p>Upload one agreement or a related set of documents. EllaBrief will explain what the text says, identify issues to examine and suggest questions worth asking.</p></div>
    <div className="upload-panel">
      <div className={`drop-zone ${drag?"is-dragging":""}`} role="button" tabIndex={0} aria-label="Choose PDF or DOCX documents" onClick={()=>input.current?.click()} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();input.current?.click();}}} onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);add(e.dataTransfer.files);}}>
        <div className="drop-icon"><UploadCloud size={24}/></div>
        <h2>Drop your documents here</h2>
        <p>or <span>browse files</span> from your device</p>
        <small>PDF or DOCX · Up to {MAX_FILES} files · 10 MB each</small>
        <input ref={input} type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" multiple hidden onChange={e=>{add(e.target.files);e.target.value="";}}/>
      </div>
      {files.length>0&&<div className="selected-files"><div className="upload-section-label"><span>SELECTED DOCUMENTS</span><span>{files.length} / {MAX_FILES}</span></div>{files.map((f,i)=><div className="selected-file" key={f.name+f.lastModified+i}><span className="file-type-icon"><FileText size={18}/></span><span className="file-details"><b>{f.name}</b><small>{size(f.size)} · {f.name.toLowerCase().endsWith(".pdf")?"PDF document":"Word document"}</small></span><button type="button" className="remove-file" aria-label={`Remove ${f.name}`} onClick={()=>remove(i)}><Trash2 size={16}/></button></div>)}<div className="upload-total">{size(files.reduce((n,f)=>n+f.size,0))} of {size(MAX_TOTAL_BYTES)} total</div></div>}
      {error&&<div className="upload-error" role="alert"><XCircle size={17}/>{error}</div>}
      <button className="process-button" type="button" disabled={!files.length||loading} onClick={submit}>{loading?<><LoaderCircle className="spin" size={17}/> Reading and analysing documents…</>:<><FileUp size={17}/> Analyse documents <ArrowRight size={16}/></>}</button>
    </div>

    {analysis&&<div className="analysis-workspace" aria-live="polite">
      <header className="analysis-workspace-head"><div><div className="eyebrow">YOUR DOCUMENT REVIEW</div><h2>Analysis overview</h2><p>{ready} document{ready===1?"":"s"} reviewed</p></div><span className="results-status"><CheckCircle2 size={15}/> Complete</span></header>
      <div className="analysis-notice"><ShieldCheck size={17}/><p>{result.notice}</p></div>
      {sessionNotice&&<p className="tool-intro" role="status">{sessionNotice}</p>}

      {legalReview?.loading&&<div className="legal-review-panel"><div className="eyebrow">NIGERIAN LEGAL SOURCE REVIEW</div><p>Identifying the document type and preparing relevant Nigerian legal guidance…</p></div>}
      {legalReview?.error&&<div className="legal-review-panel legal-review-muted"><div className="eyebrow">NIGERIAN LEGAL SOURCE REVIEW</div><p>{legalReview.error}</p><small>Document analysis remains available.</small></div>}

      {legalReview?.data&&<section className="legal-review-panel">
        <div className="eyebrow">NIGERIAN LEGAL SOURCE REVIEW</div>
        <h3>{legalReview.data.result.summary||(legalIsPrinciples?"General Nigerian legal principles for this document type":legalStatus==="insufficient_sources"?"Limited legal guidance available":"Legal source review")}</h3>
        <button type="button" className="legal-see-more" aria-expanded={legalExpanded} onClick={()=>setLegalExpanded(v=>!v)}>
          {legalExpanded?<><ChevronUp size={15}/> Show less</>:<><ChevronDown size={15}/> See more</>}
        </button>
        {legalExpanded&&<>
                  {legalIsPrinciples&&<p>Below is guidance based on ordinary Nigerian legal principles for this kind of document. It is educational, not a formal legal opinion.</p>}
                  {legalStatus==="insufficient_sources"&&!legalIsPrinciples&&<p>EllaBrief could not retrieve a clear, citable Nigerian legal provision for the issues raised. The document explanation above still stands.</p>}
          
                  <div className="legal-findings-wrap">
                    {shownFindings.map((f,i)=><article className="legal-finding" key={i}>
                      <b>{f.topic}</b>
                      <p><strong>Document position:</strong> {f.documentPosition}</p>
                      <p><strong>Legal position:</strong> {f.legalPosition}</p>
                      <small>{f.jurisdiction}{f.effectiveStatus?` · ${String(f.effectiveStatus).replaceAll("_"," ")}`:""}{f.confidence?` · confidence: ${f.confidence}`:""}</small>
                      {(f.citations||[]).length>0&&<div className="legal-inline-citations" aria-label="Legal sources">{f.citations.map((c,ci)=><span className="legal-citation" key={c.sourceId||ci}>[{c.authority}{c.year?`, ${c.year}`:""}{c.provisionVerified&&c.provision?`, ${c.provision}`:""}{c.publisher?`, ${c.publisher}`:""}] {c.url&&<a href={c.url} target="_blank" rel="noreferrer">View source</a>}{ci<f.citations.length-1?"; ":""}</span>)}</div>}
                      {f.caveat&&!/not formal legal advice|educational guidance from general principles/i.test(f.caveat)&&<small>{f.caveat}</small>}
                    </article>)}
                  </div>

          
                  {cleanQuestions.map((q,i)=><p key={i}>• {q}</p>)}
                  {cleanLimitations.map((q,i)=><small className="legal-limitation" key={i}>{q}</small>)}
                  <p className="legal-review-disclaimer">General information only — confirm important points with a qualified Nigerian legal practitioner.</p>
        </>}
      </section>}

      <nav className="analysis-section-nav" aria-label="Jump to an analysis section">
        <a href="#analysis-overview">Overview</a>
        {workspaceSections.map(section=><a href={`#${section.id}`} key={section.id}>{section.label}<span>{section.count}</span></a>)}
        <a href="#before-you-sign">Checklist</a>
        <a href="#ask-ellabrief">Ask</a>
        <a href="#document-report">Report</a>
      </nav>

      <section className="analysis-summary" id="analysis-overview">
        <div className="eyebrow">IN SIMPLE TERMS</div>
        <h3>{analysis.documentOverview}</h3>
        <p>{analysis.executiveSummary}</p>
        {result.documents?.length>0&&<div className="workspace-documents"><b>Documents included</b>{result.documents.map((doc,i)=><div className="workspace-document" key={`${doc.name}-${i}`}><FileText size={15}/><span>{doc.name}<small>{doc.type} · {doc.pageCount?`${doc.pageCount} pages`:"Page count unavailable"} · {doc.readingMethod==="gemini_native_pdf"?"Read directly from PDF pages":doc.truncated?"Text limit reached":"Text extracted"}</small></span></div>)}</div>}
      </section>

      <ListSection id="people" title="People and organisations" items={analysis.parties} render={x=><><b>{x.name}</b><p>{x.role}</p><small>{x.source}</small></>}/>
      <ListSection id="clauses" title="Key clauses" items={analysis.clauses} render={x=><><div className="analysis-card-title"><b>{x.heading}</b><span className={`risk-pill ${x.riskLevel}`}>{x.riskLevel} risk</span></div><div className="clause-explanation"><b>What this clause means</b><p>{x.plainMeaning}</p><b>How it works in practice</b><p>{x.practicalEffect}</p>{x.consequences&&<><b>What this could mean for each party</b><p>{x.consequences}</p></>}{x.benefits?.length>0&&<><b>Potential benefits</b><ul>{x.benefits.map((v,i)=><li key={i}>{v}</li>)}</ul></>}{x.burdens?.length>0&&<><b>Obligations and disadvantages</b><ul>{x.burdens.map((v,i)=><li key={i}>{v}</li>)}</ul></>}{x.terminology?.length>0&&<div className="clause-terms"><b>Terms explained</b>{x.terminology.map((t,i)=><p key={i}><strong>{t.term}:</strong> {t.meaning} <span>{t.effectInThisClause}</span></p>)}</div>}</div><Evidence item={x}/></>}/>
      <ListSection id="obligations" title="Rights and obligations" items={analysis.rightsAndObligations} render={x=><><div className="analysis-card-title"><b>{x.party}</b><span className="risk-pill">{x.kind}</span></div><p>{x.description}</p><Evidence item={x}/></>}/>
      <ListSection id="risks" title="Issues worth examining" items={analysis.risks} render={x=><><div className="analysis-card-title"><b><AlertTriangle size={15}/>{x.title}</b><span className={`risk-pill ${x.severity}`}>{x.severity}</span></div><p>{x.whyItMatters}</p><small>Affected: {x.whoAffected}</small><Evidence item={x}/><p className="analysis-next-step"><b>Possible next step:</b> {x.suggestedNextStep}</p></>}/>
      <ListSection id="money" title="Money and financial terms" items={analysis.moneyMatters} render={x=><><b>{x.item}</b><p>{x.amount} · {x.frequency}</p><p>{x.notes}</p><Evidence item={x}/></>}/>
      <ListSection id="protections" title="Protections to consider" items={analysis.missingProtections} render={x=><><b>{x.protection}</b><p>{x.whyItMatters}</p><small>{x.scope}</small></>}/>
      <ListSection id="questions" title="Questions worth asking" items={analysis.questions} render={x=><><b>{x.question}</b><p>{x.reason}</p><small>{x.documentName}{x.page&&x.page!=="not available"?` · Page ${x.page}`:""}</small></>}/>
      <ListSection id="cross-documents" title="Across your documents" items={analysis.crossDocumentFindings} render={x=><><b>{x.finding}</b><p>{x.significance}</p><small>{x.documents.join(" · ")}</small></>}/>
      <ListSection id="limitations" title="Limitations" items={analysis.limitations} render={x=><p>{x}</p>}/>

      <AnalysisTools analysis={analysis} documents={result.documents||[]} legalReview={legalReview?.data?.result||null} files={files}/>
      <div id="document-report" className="analysis-endnote">EllaBrief helps explain documents. It does not replace advice from a qualified Nigerian legal practitioner.</div>
      <button type="button" className="process-button analysis-reset" onClick={async()=>{setResult(null);setLegalReview(null);setFiles([]);setSessionNotice("");setLegalExpanded(false);await clearReviewSession().catch(()=>{});window.scrollTo({top:0,behavior:"smooth"});}}>Analyse another set of documents <ArrowRight size={16}/></button>
    </div>}
  </section>;
}
