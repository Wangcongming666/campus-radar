import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ApiError, clearCsrf } from "./auth";
import { personalData } from "./personal";
beforeEach(()=>{clearCsrf();});
afterEach(()=>{vi.unstubAllGlobals();});
test("a successful 204 delete resolves so the page can refresh",async()=>{
  vi.stubGlobal("fetch",vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({data:{token:"csrf"}}),{status:200})).mockResolvedValueOnce(new Response(null,{status:204})));
  await expect(personalData("/planner/tasks/id?version=1","DELETE")).resolves.toBeUndefined();
});
test("missing review preserves the 404 API error so the create form can open",async()=>{
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({error:{code:"NOT_FOUND",message:"Missing"}}),{status:404})));
  await expect(personalData("/rounds/id/review")).rejects.toMatchObject({status:404,code:"NOT_FOUND"});
});
