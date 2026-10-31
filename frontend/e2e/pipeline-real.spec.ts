import { test,expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { api,createLiveAccount,ensureLiveCatalog } from "./helpers/live";

test.skip(process.env.API_REAL_E2E!=="1","Requires isolated real service database");
test("job actions, board moves, undo, notes and archives persist with ownership and conflict protection",async({browser})=>{
  const owner=await browser.newContext(),peer=await browser.newContext();
  try {
    const catalog=await ensureLiveCatalog(owner.request);
    await createLiveAccount(owner.request,"pipeline-owner");
    await createLiveAccount(peer.request,"pipeline-peer");
    const page=await owner.newPage();
    await page.goto(`/jobs/${catalog.jobId}`);
    const added=page.waitForResponse(r=>r.url().endsWith("/api/v1/applications")&&r.request().method()==="POST");
    await page.getByRole("button",{name:"加入投递",exact:true}).click();
    const response=await added;expect(response.status()).toBe(200);
    let mutation=(await response.json()).data;
    const id=mutation.application.id;
    expect((await api(peer.request,`/applications/${id}`)).status()).toBe(404);
    // A second acceptance of the same job returns the same record, including concurrent requests.
    const duplicates=await Promise.all([api(owner.request,"/applications","POST",{jobId:catalog.jobId},randomUUID()),api(owner.request,"/applications","POST",{jobId:catalog.jobId},randomUUID())]);
    for(const item of duplicates){expect(item.status()).toBe(200);expect((await item.json()).data.application.id).toBe(id);}
    await page.goto("/pipeline");
    const select=page.getByRole("combobox",{name:"移动 联调测试岗位 到阶段"});
    await expect(select).toHaveValue("PENDING");
    const moved=page.waitForResponse(r=>r.url().endsWith(`/applications/${id}/move`)&&r.request().method()==="POST");
    await select.selectOption("APPLIED");
    const movedResponse=await moved;expect(movedResponse.status()).toBe(200);mutation=(await movedResponse.json()).data;
    await expect(page.getByRole("button",{name:"撤销",exact:true})).toBeEnabled();
    const stale=await api(owner.request,`/applications/${id}/move`,"POST",{version:1,boardVersion:1,stage:"OFFER"},randomUUID());expect(stale.status()).toBe(409);
    const undone=page.waitForResponse(r=>r.url().endsWith(`/applications/${id}/undo`));
    await page.getByRole("button",{name:"撤销",exact:true}).click();expect((await undone).status()).toBe(200);
    await expect(select).toHaveValue("PENDING");
    await page.getByRole("button",{name:"联调测试岗位",exact:true}).click();
    const notes=page.getByRole("textbox",{name:"跟进笔记"});await notes.fill("真实联调跟进笔记 🧭");
    const saved=page.waitForResponse(r=>r.url().endsWith(`/applications/${id}`)&&r.request().method()==="PATCH");
    await page.getByRole("button",{name:"保存笔记",exact:true}).click();expect((await saved).status()).toBe(200);
    await expect(page.getByRole("button",{name:"保存笔记",exact:true})).toBeDisabled();
    await page.reload();await page.getByRole("button",{name:"联调测试岗位",exact:true}).click();await expect(notes).toHaveValue("真实联调跟进笔记 🧭");
    const archived=page.waitForResponse(r=>r.url().endsWith(`/applications/${id}`)&&r.request().method()==="PATCH");
    await page.getByRole("button",{name:"归档投递",exact:true}).click();expect((await archived).status()).toBe(200);
    await page.keyboard.press("Escape");await page.getByRole("button",{name:"已归档",exact:true}).click();
    await expect(page.getByRole("button",{name:"恢复投递",exact:true})).toBeVisible();
    const restored=page.waitForResponse(r=>r.url().endsWith(`/applications/${id}`)&&r.request().method()==="PATCH");await page.getByRole("button",{name:"恢复投递",exact:true}).click();expect((await restored).status()).toBe(200);
    await page.getByRole("button",{name:"进行中",exact:true}).click();await expect(select).toHaveValue("PENDING");
    const board=await api(owner.request,"/applications/board");expect(board.status()).toBe(200);expect((await board.json()).data.items.filter((x:{id:string})=>x.id===id)).toHaveLength(1);
    await page.screenshot({path:"qa/pipeline-real.png",fullPage:true});
  } finally {await owner.close();await peer.close();}
});
