import { test,expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { api,createLiveAccount,ensureLiveCatalog } from "./helpers/live";
test.skip(process.env.API_REAL_E2E!=="1","Requires isolated real service database");
test("real HTTP boundaries reject invalid input and CSRF while preserving full Unicode content",async({browser})=>{
  const context=await browser.newContext();
  try {
    const catalog=await ensureLiveCatalog(context.request);
    expect((await api(context.request,"/me")).status()).toBe(401);
    await createLiveAccount(context.request,"http-boundaries");
    const current=await api(context.request,"/me");expect(current.status()).toBe(200);const me=(await current.json()).data;
    const csrfMissing=await context.request.patch("http://127.0.0.1:8080/api/v1/me",{headers:{Origin:"http://127.0.0.1:5179"},data:{version:me.version,displayName:"不应保存"}});expect(csrfMissing.status()).toBe(403);
    expect((await api(context.request,"/me","PATCH",{version:me.version,graduationYear:2027.5})).status()).toBe(422);
    expect((await api(context.request,"/me","PATCH",{version:me.version,unexpected:"拒绝未知字段"})).status()).toBe(422);
    expect((await api(context.request,"/admin/jobs")).status()).toBe(403);
    await api(context.request,"/auth/login","POST",{email:catalog.admin.email,password:catalog.admin.password});
    for(const path of ["/admin/jobs?page=0","/admin/jobs?size=101","/admin/jobs?page=abc"]){const invalid=await api(context.request,path);expect(invalid.status(),path).toBe(422);expect((await invalid.json()).error.code).toBe("VALIDATION_ERROR");}
    const unicode="🧭".repeat(20000);
    const created=await api(context.request,"/admin/companies","POST",{slug:`unicode-${randomUUID()}`,name:"Unicode 字节容量验收",logoUrl:null,industry:null,sizeBand:null,cities:[],tags:[],descriptionMd:unicode},randomUUID());
    expect(created.status()).toBe(201);const company=(await created.json()).data;expect(company.descriptionMd).toBe(unicode);
    const list=await api(context.request,"/admin/companies?size=100");expect(list.status()).toBe(200);expect((await list.json()).data.find((x:{id:string})=>x.id===company.id).descriptionMd).toBe(unicode);
    const originInvalid=await context.request.post("http://127.0.0.1:8080/api/v1/auth/logout",{headers:{Origin:"https://foreign.example"},data:{}});expect(originInvalid.status()).toBe(403);
  } finally {await context.close();}
});
