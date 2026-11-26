import {describe,it,expect} from "vitest";
import {consumeSSE} from "./sse.js";
function streamResponse(frames,contentType="text/event-stream"){const encoder=new TextEncoder();return new Response(new ReadableStream({start(controller){frames.forEach(frame=>controller.enqueue(encoder.encode(frame)));controller.close()}}),{headers:{"Content-Type":contentType}})}
describe("SSE client parser",()=>{
 it("parses event frames split across network chunks",async()=>{const events=[];await consumeSSE(streamResponse(['event: status\ndata: {"message":"working"}\n','\nevent: delta\ndata: {"text":"hello"}\n\nevent: complete\ndata: {"answer":"hello"}\n\n']),{onEvent:(name,data)=>events.push([name,data])});expect(events.map(x=>x[0])).toEqual(["status","delta","complete"]);expect(events[1][1].text).toBe("hello");});
 it("handles CRLF-delimited SSE frames",async()=>{const events=[];await consumeSSE(streamResponse(['event: delta\r\ndata: {"text":"first"}\r\n\r\n','event: complete\r\ndata: {"answer":"first"}\r\n\r\n']),{onEvent:(name,data)=>events.push([name,data])});expect(events.map(x=>x[0])).toEqual(["delta","complete"]);});
 it("turns safe error events into rejected requests",async()=>{await expect(consumeSSE(streamResponse(['event: error\ndata: {"message":"Try again"}\n\n']))).rejects.toThrow("Try again");});
 it("supports JSON error responses for non-stream failures",async()=>{await expect(consumeSSE(new Response(JSON.stringify({error:"Bad request"}),{status:400,headers:{"Content-Type":"application/json"}}))).rejects.toThrow("Bad request");});
 it("rejects a non-JSON event payload",async()=>{await expect(consumeSSE(streamResponse(["event: delta\ndata: not-json\n\n"]))).rejects.toThrow("invalid response");});
});
