import{describe,it,expect,vi,afterEach}from"vitest";
import{generateWithFallback,streamWithFallback,getGroqReasoningModels,getOpenRouterModels,classifyReasoningError,classifyProviderPayload}from"./reasoning.js";
import{resetTokenBudgets}from"./tokenBudget.js";
describe("Groq-first reasoning failover",()=>{afterEach(()=>{vi.unstubAllEnvs();resetTokenBudgets();});
it("uses a fixed Groq primary and fallback model order",()=>{vi.stubEnv("GROQ_REASONING_MODELS","untrusted/override");expect(getGroqReasoningModels()).toEqual(["openai/gpt-oss-120b","openai/gpt-oss-20b"])});
it("converts Gemini-style schema types to OpenAI JSON Schema types",async()=>{
  vi.stubEnv("GROQ_API_KEY","g");
  vi.stubEnv("GROQ_REASONING_MODELS","schema-model");
  const fetchImpl=vi.fn().mockResolvedValue({ok:true,json:async()=>({choices:[{message:{content:"{\"ok\":true}"},finish_reason:"stop"}]})});
  await generateWithFallback({parts:[{text:"hello"}],generationConfig:{responseMimeType:"application/json",responseSchema:{type:"OBJECT",properties:{ok:{type:"BOOLEAN"}},required:["ok"]}},fetchImpl});
  const body=JSON.parse(fetchImpl.mock.calls[0][1].body);
  expect(body.response_format.json_schema.strict).toBe(true);
  expect(body.response_format.json_schema.schema.type).toBe("object");
  expect(body.response_format.json_schema.schema.additionalProperties).toBe(false);
  expect(body.response_format.json_schema.schema.properties.ok.type).toBe("boolean");
});
it("uses a pinned free OpenRouter fallback model",()=>{vi.stubEnv("OPENROUTER_MODELS","");vi.stubEnv("OPENROUTER_MODEL","");expect(getOpenRouterModels()).toEqual(["openrouter/free"])});
it("keeps the OpenRouter fallback model pinned and ignores model-name environment variables",()=>{vi.stubEnv("OPENROUTER_MODELS","custom/model");vi.stubEnv("OPENROUTER_MODEL","another/model");expect(getOpenRouterModels()).toEqual(["openrouter/free"])});
it("classifies provider rate limits and model errors",()=>{expect(classifyReasoningError(429).retry).toBe(true);expect(classifyReasoningError(404).kind).toBe("model_unavailable");expect(classifyReasoningError(400).retry).toBe(false)});
it("fails over to the next Groq model after a quota response",async()=>{vi.stubEnv("GROQ_API_KEY","g");vi.stubEnv("GROQ_REASONING_MODELS","first,second");const fetchImpl=vi.fn().mockResolvedValueOnce({ok:false,status:429,json:async()=>({error:{code:"rate_limit"}})}).mockResolvedValueOnce({ok:true,json:async()=>({choices:[{message:{content:"answer"},finish_reason:"stop"}]})});const result=await generateWithFallback({parts:[{text:"hello"}],fetchImpl});expect(result).toMatchObject({provider:"groq",model:"openai/gpt-oss-20b",text:"answer"});expect(fetchImpl).toHaveBeenCalledTimes(2)});
it("uses OpenRouter after both pinned Groq models are unavailable",async()=>{vi.stubEnv("GROQ_API_KEY","g");vi.stubEnv("OPENROUTER_API_KEY","o");const unavailable=()=>({ok:false,status:503,json:async()=>({})});const fetchImpl=vi.fn().mockResolvedValueOnce(unavailable()).mockResolvedValueOnce(unavailable()).mockResolvedValueOnce({ok:true,json:async()=>({choices:[{message:{content:"fallback answer"}}]})});const result=await generateWithFallback({parts:[{text:"hello"}],fetchImpl});expect(result).toMatchObject({provider:"openrouter",text:"fallback answer"});expect(fetchImpl).toHaveBeenCalledTimes(3);expect(fetchImpl.mock.calls[2][0]).toContain("openrouter.ai")});
it("uses OpenRouter when the Groq key is rejected",async()=>{vi.stubEnv("GROQ_API_KEY","bad");vi.stubEnv("OPENROUTER_API_KEY","o");const fetchImpl=vi.fn().mockResolvedValueOnce({ok:false,status:401,json:async()=>({})}).mockResolvedValueOnce({ok:true,json:async()=>({choices:[{message:{content:"fallback"}}]})});await expect(generateWithFallback({parts:[],fetchImpl})).resolves.toMatchObject({provider:"openrouter"})});
it("streams provider deltas without mixing models",async()=>{vi.stubEnv("GROQ_API_KEY","g");vi.stubEnv("GROQ_REASONING_MODELS","stream");const stream=new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\ndata: [DONE]\n\n'));c.close()}});const fetchImpl=vi.fn().mockResolvedValue({ok:true,body:stream});const onToken=vi.fn();await expect(streamWithFallback({parts:[],fetchImpl,onToken})).resolves.toMatchObject({text:"Hello"});expect(onToken).toHaveBeenCalledWith("Hello")});

it("classifies Groq 413 rate-limit codes as retryable quota failures",()=>{expect(classifyReasoningError(413,{error:{code:"rate_limit_exceeded"}})).toMatchObject({kind:"rate_limit",retry:true})});
it("routes Groq 413 TPM responses to OpenRouter after both Groq models are tried",async()=>{vi.stubEnv("GROQ_API_KEY","g");vi.stubEnv("OPENROUTER_API_KEY","o");const limited=()=>({ok:false,status:413,json:async()=>({error:{code:"rate_limit_exceeded"}})});const fetchImpl=vi.fn().mockResolvedValueOnce(limited()).mockResolvedValueOnce(limited()).mockResolvedValueOnce({ok:true,json:async()=>({choices:[{message:{content:"fallback after TPM"}}]})});await expect(generateWithFallback({parts:[{text:"short"}],fetchImpl})).resolves.toMatchObject({provider:"openrouter",text:"fallback after TPM"});expect(fetchImpl).toHaveBeenCalledTimes(3);expect(fetchImpl.mock.calls[2][0]).toContain("openrouter.ai")});
it("always attempts Groq even when a legacy local TPM budget is set absurdly low",async()=>{vi.stubEnv("GROQ_API_KEY","g");vi.stubEnv("OPENROUTER_API_KEY","o");vi.stubEnv("GROQ_REASONING_MODELS","only");vi.stubEnv("GROQ_LOCAL_TPM_BUDGET","1");const fetchImpl=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({choices:[{message:{content:"Groq was actually called"}}]})});await expect(generateWithFallback({parts:[{text:"this request exceeds the old local budget"}],fetchImpl})).resolves.toMatchObject({provider:"groq",text:"Groq was actually called"});expect(fetchImpl).toHaveBeenCalledTimes(1);expect(fetchImpl.mock.calls[0][0]).toContain("api.groq.com")});

it("stops provider failover when the shared request deadline has expired",async()=>{
  vi.stubEnv("GROQ_API_KEY","g");
  vi.stubEnv("OPENROUTER_API_KEY","o");
  vi.stubEnv("GROQ_REASONING_MODELS","only");
  const fetchImpl=vi.fn();
  await expect(generateWithFallback({parts:[{text:"hello"}],deadlineAt:Date.now()-1,fetchImpl}))
    .rejects.toMatchObject({kind:"processing_deadline",httpStatus:503});
  expect(fetchImpl).not.toHaveBeenCalled();
});
it("keeps ordinary bad requests terminal and does not call OpenRouter",async()=>{vi.stubEnv("GROQ_API_KEY","g");vi.stubEnv("OPENROUTER_API_KEY","o");vi.stubEnv("GROQ_REASONING_MODELS","only");const fetchImpl=vi.fn().mockResolvedValue({ok:false,status:400,json:async()=>({error:{code:"invalid_request_error",message:"bad prompt"}})});await expect(generateWithFallback({parts:[{text:"hello"}],fetchImpl})).rejects.toMatchObject({kind:"invalid_request",provider:"groq",model:"openai/gpt-oss-120b"});expect(fetchImpl).toHaveBeenCalledTimes(1)});
it("classifies Groq JSON validation failures as retryable",()=>{expect(classifyReasoningError(400,{error:{code:"json_validate_failed",message:"Failed to validate JSON. Please adjust your prompt. See 'failed_generation' for more details."}})).toMatchObject({kind:"json_validation",retry:true});expect(classifyReasoningError(400).retry).toBe(false)});
it("retries structured JSON on both Groq models before OpenRouter",async()=>{vi.stubEnv("GROQ_API_KEY","secret-groq-key");vi.stubEnv("OPENROUTER_API_KEY","secret-openrouter-key");const fetchImpl=vi.fn().mockResolvedValueOnce({ok:false,status:400,json:async()=>({error:{code:"json_validate_failed",message:"Failed to validate JSON."}})}).mockResolvedValueOnce({ok:false,status:400,json:async()=>({error:{code:"json_validate_failed",message:"Failed to validate JSON."}})}).mockResolvedValueOnce({ok:false,status:400,json:async()=>({error:{code:"json_validate_failed",message:"Failed to validate JSON."}})}).mockResolvedValueOnce({ok:false,status:400,json:async()=>({error:{code:"json_validate_failed",message:"Failed to validate JSON."}})}).mockResolvedValueOnce({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({ok:true})},finish_reason:"stop"}],usage:{prompt_tokens:20,completion_tokens:5}})});const logs=[];const spy=vi.spyOn(console,"info").mockImplementation((...args)=>logs.push(args));const result=await generateWithFallback({stage:"document_analysis",parts:[{text:"clause"}],generationConfig:{maxOutputTokens:400,responseMimeType:"application/json",responseSchema:{type:"OBJECT",properties:{ok:{type:"BOOLEAN"}},required:["ok"]}},fetchImpl});spy.mockRestore();expect(result).toMatchObject({provider:"openrouter",text:JSON.stringify({ok:true}),fallbackTriggered:true});const bodies=fetchImpl.mock.calls.map(call=>JSON.parse(call[1].body));expect(bodies[0].response_format.type).toBe("json_schema");expect(bodies[0].response_format.json_schema.strict).toBe(true);expect(bodies[0].reasoning_effort).toBe("low");expect(bodies[1].response_format.type).toBe("json_object");expect(bodies[1].response_format.json_schema).toBeUndefined();expect(fetchImpl.mock.calls[4][0]).toContain("openrouter.ai");const dumped=JSON.stringify(logs);expect(dumped).not.toContain("secret-groq-key");expect(dumped).not.toContain("secret-openrouter-key");expect(dumped).toContain("document_analysis");expect(dumped).toContain("json_validation")});
it("does not let legacy local token budgets block structured Groq requests",async()=>{vi.stubEnv("GROQ_API_KEY","g");vi.stubEnv("OPENROUTER_API_KEY","o");vi.stubEnv("GROQ_REASONING_MODELS","openai/gpt-oss-120b");vi.stubEnv("GROQ_LOCAL_TPM_BUDGET","5500");const fetchImpl=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({choices:[{message:{content:"Groq structured response"}}]})});await expect(generateWithFallback({parts:[{text:"x".repeat(2000)}],generationConfig:{maxOutputTokens:20000,responseSchema:{type:"OBJECT",properties:{ok:{type:"STRING"}},required:["ok"]}},fetchImpl})).resolves.toMatchObject({provider:"groq",text:"Groq structured response"});expect(fetchImpl.mock.calls[0][0]).toContain("api.groq.com")});
it("classifies empty and truncated provider responses with safe shape diagnostics",()=>{
  expect(classifyProviderPayload({choices:[{finish_reason:"length",message:{content:"partial"}}]})).toMatchObject({kind:"truncated_response",diagnostics:{finishReason:"length",messageContentLength:7}});
  expect(classifyProviderPayload({choices:[{finish_reason:"stop",message:{content:null,reasoning:"internal"}}]})).toMatchObject({kind:"empty_response",detail:"missing_content",diagnostics:{reasoningContentLength:8,messageContentType:"object"}});
});
it("logs network failure metadata without secrets or document content",async()=>{
  vi.stubEnv("GROQ_API_KEY","secret-groq-key");
  const logs=[];
  const spy=vi.spyOn(console,"info").mockImplementation((...args)=>logs.push(args));
  const networkError=Object.assign(new TypeError("fetch failed"),{cause:{code:"ECONNRESET"}});
  const fetchImpl=vi.fn().mockRejectedValue(networkError);
  await expect(generateWithFallback({stage:"document_analysis",parts:[{text:"PRIVATE DOCUMENT TEXT"}],fetchImpl})).rejects.toMatchObject({kind:"network_error",provider:"groq"});
  spy.mockRestore();
  const dumped=JSON.stringify(logs);
  expect(dumped).toContain("network_error");
  expect(dumped).toContain("ECONNRESET");
  expect(dumped).not.toContain("secret-groq-key");
  expect(dumped).not.toContain("PRIVATE DOCUMENT TEXT");
});
it("records provider response shape without logging reasoning content",async()=>{
  vi.stubEnv("GROQ_API_KEY","g");
  const logs=[];
  const spy=vi.spyOn(console,"info").mockImplementation((...args)=>logs.push(args));
  const fetchImpl=vi.fn().mockResolvedValue({ok:true,status:200,headers:new Headers(),json:async()=>({choices:[{finish_reason:"stop",message:{content:null,reasoning:"private reasoning"}}]})});
  await expect(generateWithFallback({parts:[],fetchImpl})).rejects.toMatchObject({kind:"empty_response"});
  spy.mockRestore();
  const dumped=JSON.stringify(logs);
  expect(dumped).toContain("missing_content");
  expect(dumped).toContain("reasoningContentLength");
  expect(dumped).not.toContain("private reasoning");
});
});
