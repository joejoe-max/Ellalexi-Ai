export function startSSE(res){res.statusCode=200;res.setHeader("Content-Type","text/event-stream; charset=utf-8");res.setHeader("Cache-Control","no-cache, no-transform");res.setHeader("Connection","keep-alive");res.setHeader("X-Accel-Buffering","no");res.setHeader("X-Content-Type-Options","nosniff");res.flushHeaders?.();}
export function sendEvent(res,event,data){if(res.writableEnded)return;res.write("event: "+event+"\ndata: "+JSON.stringify(data)+"\n\n");}
export function endSSE(res){if(!res.writableEnded)res.end();}
export function sendSafeError(res,error){sendEvent(res,"error",{message:error.userMessage||"EllaLexi could not complete this request. Please try again.",code:error.kind||"internal"});endSSE(res);}
