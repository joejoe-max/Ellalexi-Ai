export async function consumeSSE(response,{onEvent,signal}={}){
 const type=response.headers.get("content-type")||"";
 if(!type.includes("text/event-stream")){let data={};try{data=await response.json()}catch{}throw new Error(data.error||"The service returned an unexpected response. Please try again.");}
 if(!response.body)throw new Error("Streaming is not supported by this browser.");
 const reader=response.body.getReader(),decoder=new TextDecoder();let buffer="",event="message";
 try{
  while(true){if(signal?.aborted)throw new DOMException("Aborted","AbortError");const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let split;
   while((split=buffer.indexOf("\n\n"))>=0){const frame=buffer.slice(0,split).replace(/\r/g,"");buffer=buffer.slice(split+2);let data=[];event="message";for(const line of frame.split("\n")){if(line.startsWith("event:"))event=line.slice(6).trim();else if(line.startsWith("data:"))data.push(line.slice(5).trimStart());}if(data.length){let payload;try{payload=JSON.parse(data.join("\n"))}catch{throw new Error("The service sent an invalid response.")}onEvent?.(event,payload);if(event==="error")throw new Error(payload.message||"The request could not be completed.");}}
  }
 }finally{reader.releaseLock();}
}
