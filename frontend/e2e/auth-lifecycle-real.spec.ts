import { test,expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { api,createLiveAccount } from "./helpers/live";
test.skip(process.env.API_REAL_E2E!=="1","Requires isolated real services and local mail");
test("profile conflicts preserve the unsaved form draft",async({browser})=>{
  const context=await browser.newContext();try {
    await createLiveAccount(context.request,"profile-conflict");const page=await context.newPage();await page.goto("/settings");
    const field=page.getByRole("textbox",{name:"昵称",exact:true});await field.fill("需要保留的昵称草稿");
    const me=(await (await api(context.request,"/me")).json()).data;
    expect((await api(context.request,"/me","PATCH",{version:me.version,displayName:"另一个窗口的修改"})).status()).toBe(200);
    const conflict=page.waitForResponse(r=>r.url().endsWith("/api/v1/me")&&r.request().method()==="PATCH");
    await page.getByRole("button",{name:"保存设置",exact:true}).click();expect((await conflict).status()).toBe(409);
    await expect(page.getByRole("alert")).toBeVisible();await expect(page.getByRole("button",{name:"保存设置",exact:true})).toBeEnabled();await expect(field).toHaveValue("需要保留的昵称草稿");
  }finally{await context.close();}
});
test("rendered login, password change and emailed reset revoke sessions and allow the next login",async({browser})=>{
  const owner=await browser.newContext(),otherSession=await browser.newContext();
  try {
    const account=await createLiveAccount(owner.request,"auth-lifecycle");
    expect((await api(otherSession.request,"/auth/login","POST",{email:account.email,password:account.password})).status()).toBe(200);
    await api(owner.request,"/auth/logout","POST");
    const page=await owner.newPage();await page.goto("/login?returnTo=%2Fsettings");
    const signIn=async(password:string)=>{await page.getByRole("textbox",{name:"邮箱",exact:true}).fill(account.email);await page.getByLabel("密码",{exact:true}).fill(password);await page.getByRole("button",{name:"登录",exact:true}).click();};
    await signIn(account.password);await expect(page).toHaveURL(/\/settings$/);
    await page.getByRole("button",{name:"账号安全",exact:true}).click();
    const changedPassword=`Bb2!${randomUUID()}`;
    await page.getByLabel("当前密码",{exact:true}).fill(account.password);await page.getByLabel("新密码",{exact:true}).fill(changedPassword);
    const changed=page.waitForResponse(r=>r.url().endsWith("/auth/password")&&r.request().method()==="PUT");
    await page.getByRole("button",{name:"修改密码",exact:true}).click();expect((await changed).status()).toBe(200);
    await expect(page).toHaveURL(/\/login$/);expect((await api(otherSession.request,"/me")).status()).toBe(401);
    expect((await api(otherSession.request,"/auth/login","POST",{email:account.email,password:account.password})).status()).toBe(401);
    await signIn(changedPassword);await expect(page).toHaveURL(/\/me$/);
    expect((await api(otherSession.request,"/auth/login","POST",{email:account.email,password:changedPassword})).status()).toBe(200);
    await page.goto("/forgot-password");await page.getByRole("textbox",{name:"邮箱",exact:true}).fill(account.email);
    await page.getByRole("button",{name:"发送重置邮件",exact:true}).click();await expect(page.getByText("申请已受理。",{exact:false})).toBeVisible();
    let token="";
    await expect.poll(async()=>{
      const messages=await owner.request.get("http://127.0.0.1:38025/api/v1/messages");
      for(const message of (await messages.json()).messages??[]){if(!String(message.Subject).includes("重置密码")||!(message.To??[]).some((x:{Address:string})=>x.Address===account.email))continue;
        const detail=await owner.request.get(`http://127.0.0.1:38025/api/v1/message/${message.ID}`);token=String((await detail.json()).Text??"").match(/#token=([A-Za-z0-9_-]+)/)?.[1]??"";if(token)return true;
      }return false;
    },{timeout:45000}).toBe(true);
    const resetPassword=`Cc3!${randomUUID()}`;
    await page.goto(`/reset-password#token=${token}`);await expect(page).toHaveURL(/\/reset-password$/);
    await page.getByLabel("新密码").fill(resetPassword);await page.getByRole("button",{name:"重置密码",exact:true}).click();
    await expect(page.getByText("密码已重置，请使用新密码登录。",{exact:true})).toBeVisible();
    expect((await api(otherSession.request,"/me")).status()).toBe(401);
    const replay=await api(otherSession.request,"/auth/reset-password","POST",{token,newPassword:resetPassword});expect(replay.status()).toBe(422);
    await page.getByRole("link",{name:"前往登录",exact:true}).click();await signIn(resetPassword);await expect(page).toHaveURL(/\/me$/);
    await expect(page.getByRole("heading",{name:"我的求职概览",exact:true})).toBeVisible();
  } finally {await owner.close();await otherSession.close();}
});
