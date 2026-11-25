import {describe,it,expect,vi,afterEach} from "vitest";
import {classifyProviderError,getModels,generateWithFallback} from "./gemini.js";
describe("Gemini provider resilience",()=>{
 afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals()});
 it("uses supported Flash defaults and allows explicit model order",()=>{
  vi.stubEnv("GEMINI_MODELS","");
  expect(getModels()).toEqual(["gemini-3.5-flash-lite","gemini-3.1-flash-lite"]);
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
  expect(result).toEqual({model:"second",text:"answer"});expect(fetch).toHaveBeenCalledTimes(2);expect(fallback).toHaveBeenCalledWith("second");
 });
 it("does not retry authentication failures",async()=>{
  vi.stubEnv("GEMINI_API_KEY","test-key");vi.stubEnv("GEMINI_MODELS","first,second");
  const fetch=vi.fn().mockResolvedValue({ok:false,status:403,json:async()=>({error:{message:"secret"}})});vi.stubGlobal("fetch",fetch);
  await expect(generateWithFallback({systemInstruction:"s",parts:[],generationConfig:{}})).rejects.toMatchObject({kind:"configuration"});
  expect(fetch).toHaveBeenCalledTimes(1);
 });
});
