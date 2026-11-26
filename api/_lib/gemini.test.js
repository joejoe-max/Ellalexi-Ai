import {describe,it,expect,vi,afterEach} from "vitest";
import {classifyProviderError,getModels,generateWithFallback,streamWithFallback} from "./gemini.js";
describe("Gemini provider resilience",()=>{
 afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals()});
 it("uses supported Flash defaults and allows explicit model order",()=>{
  vi.stubEnv("GEMINI_MODELS","");
  expect(getModels()).toEqual(["gemini-3.8-flash","gemini-3.5-flash-lite","gemini-3.1-flash-lite"]);
  vi.stubEnv("GEMINI_MODELS","model-a, model-b,model-a");
  expect(getModels()).toEqual(["model-a","model-b"]);
 });
 it("classifies quota, transient, authentication and invalid request errors",()=>{
  expect(classifyProviderError(429).kind).toBe("rate_limit");
  expect(classifyProviderError(503).retry).toBe(true);
  expect(classifyProviderError(403).retry).toBe(false);
  expect(classifyProviderError(400).kind).toBe("invalid_request");
 });
 it("falls back after quota errors without leaking provider messages",async()=>{
  vi.stubEnv("GEMINI_API_KEY","test-key");vi.stubEnv("GEMINI_MODELS","first,second");
  const fetch=vi.fn().mockResolvedValueOnce({ok:false,status:429,json:async()=>({error:{message:"private provider detail"}})}).mockResolvedValueOnce({ok:true,json:async()=>({candidates:[{content:{parts:[{text:"answer"}]}}]})});
  vi.stubGlobal("fetch",fetch);
  const fallback=vi.fn();
  const result=await generateWithFallback({systemInstruction:"system",parts:[{text:"hello"}],generationConfig:{},onFallback:fallback});
  expect(result).toMatchObject({model:"second",text:"answer",payload:{candidates:[{content:{parts:[{text:"answer"}]}}]}});expect(fetch).toHaveBeenCalledTimes(2);expect(fallback).toHaveBeenCalledWith("second");
 });
 it("does not retry authentication failures",async()=>{
  vi.stubEnv("GEMINI_API_KEY","test-key");vi.stubEnv("GEMINI_MODELS","first,second");
  const fetch=vi.fn().mockResolvedValue({ok:false,status:403,json:async()=>({error:{message:"secret"}})});vi.stubGlobal("fetch",fetch);
  await expect(generateWithFallback({systemInstruction:"s",parts:[],generationConfig:{}})).rejects.toMatchObject({kind:"configuration"});
  expect(fetch).toHaveBeenCalledTimes(1);
 });
 it("streams Gemini text chunks as they arrive",async()=>{
  vi.stubEnv("GEMINI_API_KEY","test-key");vi.stubEnv("GEMINI_MODELS","stream-model");
  const frames=[
   'data: {"candidates":[{"content":{"parts":[{"text":"Hello "}]}}]}\n\n',
   'data: {"candidates":[{"content":{"parts":[{"text":"there"}]}}]}\n\n'
  ];
  const stream=new ReadableStream({start(controller){for(const frame of frames)controller.enqueue(new TextEncoder().encode(frame));controller.close();}});
  const fetch=vi.fn().mockResolvedValue({ok:true,body:stream});vi.stubGlobal("fetch",fetch);
  const onToken=vi.fn();
  const result=await streamWithFallback({parts:[{text:"hi"}],generationConfig:{},onToken});
  expect(result).toMatchObject({model:"stream-model",text:"Hello there"});
  expect(onToken.mock.calls).toEqual([["Hello "],["there"]]);
  expect(fetch.mock.calls[0][0]).toContain(":streamGenerateContent?alt=sse");
 });
 it("does not mix models when a stream fails after emitting text",async()=>{
  vi.stubEnv("GEMINI_API_KEY","test-key");vi.stubEnv("GEMINI_MODELS","first,second");
  const stream=new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('data: {"candidates":[{"content":{"parts":[{"text":"partial"}]}}]}\n\n'));controller.error(new Error("connection lost"));}});
  const fetch=vi.fn().mockResolvedValue({ok:true,body:stream});vi.stubGlobal("fetch",fetch);
  await expect(streamWithFallback({parts:[],generationConfig:{}})).rejects.toMatchObject({kind:"stream_interrupted"});
  expect(fetch).toHaveBeenCalledTimes(1);
 });

});
