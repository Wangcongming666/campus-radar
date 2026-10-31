import { request as requestFactory,type APIRequestContext,type APIResponse } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFileSync,writeFileSync,existsSync,mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root=fileURLToPath(new URL("../../../",import.meta.url));
const apiBase=process.env.API_URL??"http://127.0.0.1:8080";
const origin=process.env.PREVIEW_URL??"http://127.0.0.1:5179";
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
function runtimeDatabase(){const file=`${root}/.data/run/runtime.json`;const database=process.env.CAMPUS_DATABASE??(existsSync(file)?JSON.parse(readFileSync(file,"utf8")).database:"");if(!/^campus_radar_test_[a-z0-9_]+$/.test(database))throw new Error("Live acceptance requires an isolated campus_radar_test_* database.");return database;}
export async function api(request:APIRequestContext,path:string,method="GET",body?:unknown,key?:string):Promise<APIResponse>{
  const full=path.startsWith("/api/v1")?path:`/api/v1${path}`;const headers:Record<string,string>={Origin:origin};
  if(!["GET","HEAD","OPTIONS"].includes(method.toUpperCase())){const csrf=await request.get(`${apiBase}/api/v1/auth/csrf`);if(csrf.status()!==200)throw new Error(`CSRF service failed (${csrf.status()})`);headers["X-CSRF-TOKEN"]=(await csrf.json()).data.token;}
  if(key)headers["Idempotency-Key"]=key;
  return request.fetch(`${apiBase}${full}`,{method,headers,...(body===undefined?{}:{data:body})});
}
async function accepted(response:APIResponse,status:number){if(response.status()!==status){let code="";try{code=(await response.json()).error?.code??"";}catch{}throw new Error(`Live API status ${response.status()}, expected ${status}, code ${code}`);}return status===204?undefined:(await response.json()).data;}
export async function createLiveAccount(request:APIRequestContext,prefix:string){
  runtimeDatabase();const email=`${prefix.replace(/[^a-z0-9-]/gi,"")}-${randomUUID()}@example.test`,password=`Aa1!${randomUUID()}`;
  await accepted(await api(request,"/auth/register","POST",{email,password,displayName:`验收 ${prefix}`.slice(0,40)}),202);
  const user=await accepted(await api(request,"/auth/login","POST",{email,password}),200);
  return {email,password,userId:user.id as string};
}
export type LiveCatalog={companyId:string;sourceId:string;jobId:string;questionId:string;chapterId:string;admin:{email:string;password:string;userId:string}};
export async function ensureLiveCatalog(request:APIRequestContext):Promise<LiveCatalog>{
  const database=runtimeDatabase(),file=`${root}/.data/verification/catalog-${database}.json`;
  if(existsSync(file)){const cached=JSON.parse(readFileSync(file,"utf8")) as LiveCatalog;const response=await api(request,`/jobs/${cached.jobId}`);if(response.status()===200)return cached;}
  const separate=await requestFactory.newContext({baseURL:apiBase});try{
    const admin=await createLiveAccount(separate,"catalog-admin");execFileSync("python3",[`${root}/scripts/local.py`,"promote",admin.email],{cwd:root,env:{...process.env,CAMPUS_DATABASE:database},stdio:"pipe"});
    await accepted(await api(separate,"/auth/login","POST",{email:admin.email,password:admin.password}),200);
    const suffix=randomUUID().slice(0,8);
    const create=async(path:string,body:unknown)=>accepted(await api(separate,path,"POST",body,randomUUID()),201);
    const approve=async(type:string,item:{id:string;version:number})=>accepted(await api(separate,`/admin/moderation/${type}/${item.id}/decisions`,"POST",{version:item.version,decision:"APPROVE",reason:"独立测试库验收夹具"},randomUUID()),200);
    const company=await create("/admin/companies",{slug:`acceptance-${suffix}`,name:`验收公司 ${suffix}`,logoUrl:null,industry:"测试",sizeBand:null,cities:["验收城市"],tags:[],descriptionMd:"仅在独立测试库使用。"});
    const source=await create("/admin/sources",{name:`验收来源 ${suffix}`,baseUrl:"https://example.test",contentMode:"ORIGINAL",permissionNote:"独立测试库原创测试数据",enabled:true});
    const job=await create("/admin/jobs",{companyId:company.id,sourceId:source.id,title:"联调测试岗位",role:"backend",cities:["验收城市"],education:"BACHELOR",recruitmentType:"CAMPUS",graduationYears:[2027],skills:["Java","SQL"],salary:null,descriptionMd:"仅供联调的岗位描述",canonicalUrl:`https://example.test/jobs/${suffix}`,deadlineAt:null,deadlineDate:null,deadlinePrecision:"UNKNOWN",sourceTimezone:"Asia/Shanghai",status:"OPEN"});await approve("JOB",job);
    const chapter=await create("/admin/chapters",{parentId:null,slug:`acceptance-${suffix}`,title:"事务与并发",direction:"backend",sortOrder:0,bodyMd:"隔离测试数据库中的原创章节。"});await approve("CHAPTER",chapter);
    const question=await create("/admin/questions",{title:"如何处理并发更新？",promptMd:"说明乐观锁的使用。",answerMd:"读取版本，在条件更新中校验版本。",role:"backend",difficulty:"MEDIUM",tags:["数据库"],companyIds:[company.id],chapterId:chapter.id});await approve("QUESTION",question);
    const catalog={companyId:company.id,sourceId:source.id,jobId:job.id,questionId:question.id,chapterId:chapter.id,admin};mkdirSync(`${root}/.data/verification`,{recursive:true});writeFileSync(file,JSON.stringify(catalog),{mode:0o600});return catalog;
  }finally{await separate.dispose();}
}
