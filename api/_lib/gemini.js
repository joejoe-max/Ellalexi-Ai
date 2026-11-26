// Prefer currently supported Gemini Flash models. Override order with GEMINI_MODELS if needed.
const DEFAULT_MODELS=["gemini-3.8-flash","gemini-3.5-flash-lite","gemini-3.1-flash-lite"];
export function getModels(){const configured=(process.env.GEMINI_MODELS||"").split(",").map(x=>x.trim()).filter(Boolean);return [...new Set(configured.length?configured:DEFAULT_MODELS)].slice(0,4)}
export function classifyProviderError(status,payload={},cause){
 const reason=String(payload?.error?.status||payload?.error?.details?.[0]?.reason||"").toUpperCase();
 if(cause?.name==="TimeoutError"||cause?.name==="AbortError")return {kind:"timeout",retry:true,httpStatus:504,message:"The AI request took too long. Please try again."};
 if(cause instanceof TypeError)return {kind:"network_error",retry:true,httpStatus:503,message:"The AI service could not be reached. Please try again shortly."};
 if(status===429||reason.includes("RESOURCE_EXHAUSTED"))return {kind:"rate_limit",retry:true,httpStatus:503,message:"EllaBrief is handling too many requests right now. Please wait a little and try again."};
 if([500,502,503,504].includes(status))return {kind:"provider_unavailable",retry:true,httpStatus:503,message:"The AI service is temporarily unavailable. Please try again shortly."};
 if(status===404)return {kind:"model_unavailable",retry:true,httpStatus:503,message:"The configured AI model is unavailable. Please try again shortly."};
 if(status===401||status===403)return {kind:"configuration",retry:false,httpStatus:503,message:"EllaBrief's AI service is not correctly configured. Please contact the administrator."};
 if(status===400)return {kind:"invalid_request",retry:false,httpStatus:422,message:"This request could not be processed. Check the uploaded content and try again."};
 return {kind:"provider_error",retry:false,httpStatus:502,message:"EllaBrief could not complete this request. Please try again."};
}
export async function generateWithFallback({parts,systemInstruction,generationConfig,tools,timeout=90000,onFallback,fetchImpl=fetch,allowEmptyText=false,apiKey:suppliedApiKey,validateResponse}){
 const key=suppliedApiKey||process.env.GEMINI_API_KEY;
 if(!key)throw Object.assign(new Error("AI is not configured."),{kind:"configuration",httpStatus:503,userMessage:"EllaBrief's AI service is not configured yet. Please try again later."});
 const models=getModels();let last;
 for(let i=0;i<models.length;i++){
  const model=models[i];
  try{
   const response=await fetchImpl("https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(model)+":generateContent",{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":key},body:JSON.stringify({...(systemInstruction?{systemInstruction:{parts:[{text:systemInstruction}]}}:{}),contents:[{role:"user",parts}],generationConfig,...(tools?{tools}:{})}),signal:AbortSignal.timeout(timeout)});
   if(!response.ok){const payload=await response.json().catch(()=>({}));const err=classifyProviderError(response.status,payload);const providerMessage=String(payload?.error?.message||"").slice(0,180);last=Object.assign(new Error(err.message),{...err,userMessage:err.message,model,providerStatus:response.status,providerCode:String(payload?.error?.status||payload?.error?.code||"").slice(0,80),providerMessage});if(!err.retry||i===models.length-1)break;onFallback?.(models[i+1]);continue;}
   const payload=await response.json();const text=payload.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("");
   if(!text&&!allowEmptyText)throw Object.assign(new Error("Empty model response"),{kind:"empty_response",retry:true,httpStatus:502,userMessage:"The AI service returned an incomplete response. Please try again.",responseLength:0,finishReason:payload.candidates?.[0]?.finishReason||"UNKNOWN"});
   const finishReason=payload.candidates?.[0]?.finishReason||"UNKNOWN";
   let validated;
   if(validateResponse){
    try{validated=await validateResponse({model,text,payload,finishReason});}
    catch(cause){throw Object.assign(new Error("The model response failed validation."),{kind:"invalid_response",retry:true,httpStatus:502,userMessage:"The AI service returned an incomplete analysis. Please try again.",responseLength:text.length,finishReason,validationError:String(cause?.message||"invalid response").slice(0,120)});}
   }
   return {model,text,payload,finishReason,...(validateResponse?{validated}:{})};
  }catch(cause){const classified=classifyProviderError(0,{},cause);const err=cause?.retry?{...classified,kind:cause.kind||"invalid_response",retry:true,message:cause.userMessage||"The AI service returned an incomplete response. Please try again."}:classified;last=Object.assign(new Error(err.message),{...err,userMessage:err.message,model,finishReason:cause.finishReason||null,responseLength:Number.isFinite(cause.responseLength)?cause.responseLength:null,validationError:cause.validationError||null,providerStatus:cause.providerStatus||null,providerCode:cause.providerCode||null,providerMessage:cause.providerMessage||null});if(!err.retry||i===models.length-1)break;onFallback?.(models[i+1]);}
 }
 throw last||Object.assign(new Error("AI unavailable"),{httpStatus:503,userMessage:"EllaBrief is temporarily unavailable. Please try again shortly."});
}


// Stream Gemini output to the client as it is generated. Fail over only before
// any text has been emitted so answers from different models are never mixed.
export async function streamWithFallback({parts,systemInstruction,generationConfig,timeout=65000,onToken,onFallback,fetchImpl=fetch,apiKey:suppliedApiKey}){
 const key=suppliedApiKey||process.env.GEMINI_API_KEY;
 if(!key)throw Object.assign(new Error("AI is not configured."),{kind:"configuration",httpStatus:503,userMessage:"EllaBrief's AI service is not configured yet. Please try again later."});
 const models=getModels();let last;
 for(let i=0;i<models.length;i++){
  const model=models[i];let emitted="";
  try{
   const url="https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(model)+":streamGenerateContent?alt=sse";
   const response=await fetchImpl(url,{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":key},body:JSON.stringify({...(systemInstruction?{systemInstruction:{parts:[{text:systemInstruction}]}}:{}),contents:[{role:"user",parts}],generationConfig}),signal:AbortSignal.timeout(timeout)});
   if(!response.ok){const payload=await response.json().catch(()=>({}));const classified=classifyProviderError(response.status,payload);last=Object.assign(new Error(classified.message),{...classified,userMessage:classified.message,model,providerStatus:response.status});if(!classified.retry||i===models.length-1)break;onFallback?.(models[i+1]);continue;}
   if(!response.body)throw Object.assign(new Error("Gemini returned no stream."),{kind:"provider_error",retry:true,httpStatus:503,userMessage:"The AI service returned an incomplete response. Please try again."});
   const reader=response.body.getReader(),decoder=new TextDecoder();let buffer="";
   const consumeFrame=frame=>{
    for(const line of frame.replace(/\r/g,"").split("\n")){
     if(!line.startsWith("data:"))continue;
     const raw=line.slice(5).trim();if(!raw||raw==="[DONE]")continue;
     let payload;try{payload=JSON.parse(raw)}catch{continue;}
     const chunk=(payload.candidates?.[0]?.content?.parts||[]).map(p=>p.text||"").join("");
     if(chunk){emitted+=chunk;onToken?.(chunk);}
    }
   };
   try{
    while(true){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true}).replace(/\r\n/g,"\n").replace(/\r/g,"\n");let boundary;
     while((boundary=buffer.indexOf("\n\n"))>=0){consumeFrame(buffer.slice(0,boundary));buffer=buffer.slice(boundary+2);}
    }
    buffer+=decoder.decode();if(buffer.trim())consumeFrame(buffer);
   }finally{reader.releaseLock();}
   if(!emitted.trim())throw Object.assign(new Error("Empty model response"),{kind:"empty_response",retry:true,httpStatus:502,userMessage:"The AI service returned an empty response. Please try again."});
   return {model,text:emitted};
  }catch(cause){
   if(emitted)throw Object.assign(new Error("The response stream ended unexpectedly."),{kind:"stream_interrupted",httpStatus:502,userMessage:"The response was interrupted. Please ask again; no partial answer was saved."});
   const classified=classifyProviderError(0,{},cause),retry=cause?.retry??classified.retry;
   last=Object.assign(new Error(cause.userMessage||classified.message),{...classified,kind:cause.kind||classified.kind,retry,userMessage:cause.userMessage||classified.message,model});
   if(!retry||i===models.length-1)break;
   onFallback?.(models[i+1]);
  }
 }
 throw last||Object.assign(new Error("AI unavailable"),{httpStatus:503,userMessage:"EllaBrief is temporarily unavailable. Please try again shortly."});
}
