import {describe,it,expect,beforeEach} from "vitest";
import {estimateRequestTokens,reserveTokenBudget,resetTokenBudgets} from "./tokenBudget.js";

describe("provider token budget",()=>{
 beforeEach(()=>resetTokenBudgets());
 it("estimates input plus reserved output",()=>expect(estimateRequestTokens("some legal text",100)).toBeGreaterThan(100));
 it("reserves within a sliding window",()=>{expect(reserveTokenBudget({tokens:2000,limit:5000,now:1000}).allowed).toBe(true);expect(reserveTokenBudget({tokens:2500,limit:5000,now:1001}).allowed).toBe(true);expect(reserveTokenBudget({tokens:1000,limit:5000,now:1002})).toMatchObject({allowed:false,reason:"window_budget_exhausted"});});
 it("expires old reservations",()=>{reserveTokenBudget({tokens:4000,limit:5000,now:0});expect(reserveTokenBudget({tokens:2000,limit:5000,now:60001}).allowed).toBe(true);});
 it("rejects a single request larger than the configured budget",()=>expect(reserveTokenBudget({tokens:6000,limit:5000})).toMatchObject({allowed:false,reason:"request_exceeds_budget"}));
});
