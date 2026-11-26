export async function consumeSSE(response,{onEvent,signal}={}){
 const type=response.headers.get("content-type")||"";
 if(!type.toLowerCase().includes("text/event-stream")){
  let data={};try{data=await response.json()}catch{ /* The response body may be empty or non-JSON. */ }
  throw new Error(data.error||"The service returned an unexpected response. Please try again.");
 }
 if(!response.body)throw new Error("Streaming is not supported by this browser.");
 const reader=response.body.getReader(),decoder=new TextDecoder();let buffer="";
 const dispatch=frame=>{
  const lines=frame.replace(/\r/g,"").split("\n");let event="message";const data=[];
  for(const line of lines){if(line.startsWith(":"))continue;if(line.startsWith("event:"))event=line.slice(6).trim();else if(line.startsWith("data:"))data.push(line.slice(5).replace(/^ /,""));}
  if(!data.length)return;
  let payload;try{payload=JSON.parse(data.join("\n"))}catch{throw new Error("The service sent an invalid response.");}
  onEvent?.(event,payload);
  if(event==="error")throw new Error(payload.message||"The request could not be completed.");
 };
 try{
  while(true){
   if(signal?.aborted)throw new DOMException("Aborted","AbortError");
   const {value,done}=await reader.read();if(done)break;
   buffer+=decoder.decode(value,{stream:true}).replace(/\r\n/g,"\n").replace(/\r/g,"\n");
   let split;while((split=buffer.indexOf("\n\n"))>=0){dispatch(buffer.slice(0,split));buffer=buffer.slice(split+2);}
  }
  buffer+=decoder.decode();if(buffer.trim())dispatch(buffer);
 }finally{reader.releaseLock();}
}
