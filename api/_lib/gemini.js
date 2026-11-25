const DEFAULT_MODELS=["gemini-3.8-flash","gemini-3.5-flash-lite","gemini-3.1-flash-lite"];
export function getModels(){const configured=(process.env.GEMINI_MODELS||"").split(",").map(x=>x.trim()).filter(Boolean);return [...new Set(configured.length?configured:DEFAULT_MODELS)].slice(0,4)}
export function classifyProviderError(status,payload={},cause){
 const reason=String(payload?.error?.status||payload?.error?.details?.[0]?.reason||"").toUpperCase();
 if(cause?.name==="TimeoutError"||cause?.name==="AbortError")return {kind:"timeout",retry:true,httpStatus:504,message:"The AI request took too long. Please try again."};
 if(cause instanceof TypeError)return {kind:"network_error",retry:true,httpStatus:503,message:"The AI service could not be reached. Please try again shortly."};
 if(status===429||reason.includes("RESOURCE_EXHAUSTED"))return {kind:"rate_limit",retry:true,httpStatus:503,message:"EllaLexi is handling too many requests right now. Please wait a little and try again."};
 if([500,502,503,504].includes(status))return {kind:"provider_unavailable",retry:true,httpStatus:503,message:"The AI service is temporarily unavailable. Please try again shortly."};
 if(status===404)return {kind:"model_unavailable",retry:true,httpStatus:503,message:"The AI service is updating. Please try again shortly."};
 if(status===401||status===403)return {kind:"configuration",retry:false,httpStatus:503,message:"EllaLexi's AI service is not correctly configured. Please contact the administrator."};
 if(status===400)return {kind:"invalid_request",retry:false,httpStatus:422,message:"This request could not be processed. Check the uploaded content and try again."};
 return {kind:"provider_error",retry:false,httpStatus:502,message:"EllaLexi could not complete this request. Please try again."};
}
export async function generateWithFallback({parts,systemInstruction,generationConfig,tools,timeout=90000,onFallback,fetchImpl=fetch,allowEmptyText=false,apiKey:suppliedApiKey}){
 const key=suppliedApiKey||process.env.GEMINI_API_KEY;
 if(!key)throw Object.assign(new Error("AI is not configured."),{kind:"configuration",httpStatus:503,userMessage:"EllaLexi's AI service is not configured yet. Please try again later."});
 const models=getModels();let last;
 for(let i=0;i<models.length;i++){
  const model=models[i];
  try{
   const response=await fetchImpl("https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(model)+":generateContent",{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":key},body:JSON.stringify({systemInstruction:{parts:[{text:systemInstruction}]},contents:[{role:"user",parts}],generationConfig,...(tools?{tools}:{})}),signal:AbortSignal.timeout(timeout)});
   if(!response.ok){const payload=await response.json().catch(()=>({}));const err=classifyProviderError(response.status,payload);last=Object.assign(new Error(err.message),{...err,userMessage:err.message,model});if(!err.retry||i===models.length-1)break;onFallback?.(models[i+1]);continue;}
   const payload=await response.json();const text=payload.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("");
   if(!text&&!allowEmptyText)throw Object.assign(new Error("Empty model response"),{kind:"empty_response",retry:true,httpStatus:502,userMessage:"The AI service returned an incomplete response. Please try again."});
   return {model,text,payload};
  }catch(cause){const err=classifyProviderError(0,{},cause);last=Object.assign(new Error(err.message),{...err,model});if(!err.retry||i===models.length-1)break;onFallback?.(models[i+1]);}
 }
 throw last||Object.assign(new Error("AI unavailable"),{httpStatus:503,userMessage:"EllaLexi is temporarily unavailable. Please try again shortly."});
}
