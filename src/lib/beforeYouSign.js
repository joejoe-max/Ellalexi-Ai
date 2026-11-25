export function buildBeforeYouSignChecklist(analysis = {}, legalReview = null) {
 const items=[];
 for(const x of analysis.risks||[])items.push({id:`risk-${items.length}`,title:x.title||"Review an identified issue",detail:x.whyItMatters||"Check the original document.",source:[x.documentName,x.page&&x.page!=="not available"?`page ${x.page}`:""].filter(Boolean).join(" · "),category:"Issue to review"});
 for(const x of analysis.missingProtections||[])items.push({id:`protection-${items.length}`,title:x.protection||"Consider an additional protection",detail:x.whyItMatters||x.scope||"Discuss whether this protection is appropriate.",source:x.scope||"",category:"Protection to discuss"});
 for(const x of analysis.questions||[])items.push({id:`question-${items.length}`,title:x.question||"Clarify an open question",detail:x.reason||"Seek clarification.",source:[x.documentName,x.page&&x.page!=="not available"?`page ${x.page}`:""].filter(Boolean).join(" · "),category:"Question to ask"});
 for(const x of legalReview?.findings||[])items.push({id:`law-${items.length}`,title:x.topic||"Verify a legal issue",detail:x.caveat||x.legalPosition||"Confirm with a qualified Nigerian legal practitioner.",source:(x.citations||[]).map(c=>[c.authority,c.year,c.publisher].filter(Boolean).join(", ")).join(" · "),category:"Legal point to verify"});
 const seen=new Set();return items.filter(x=>{const k=x.title.trim().toLowerCase();if(!k||seen.has(k))return false;seen.add(k);return true});
}
