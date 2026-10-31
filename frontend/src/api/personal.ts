import { apiRequest, ApiError } from "./auth";
import type { components } from "./generated";
export type Schema<K extends keyof components["schemas"]> = components["schemas"][K];
export type PageResult<T> = {data:T[];page:{page:number;size:number;total:number;hasMore:boolean}};
export async function personalRequest<T>(path: string, method = "GET", body?: unknown, signal?: AbortSignal): Promise<T> {
  if (method !== "GET") {
    const data = await apiRequest<unknown>(`/api/v1${path}`, {method,body:body===undefined?undefined:JSON.stringify(body),signal,headers:method==="POST"?{"Idempotency-Key":crypto.randomUUID()}:undefined});
    return (method==="DELETE"?undefined:{data}) as T;
  }
  const response = await fetch(`/api/v1${path}`,{method,credentials:"same-origin",signal});
  if (!response.ok) {
    const error = await response.json().catch(()=>null) as {error?:{code?:string;message?:string;requestId?:string}} | null;
    throw new ApiError(response.status,error?.error?.code??"REQUEST_FAILED",response.status===401?"请先登录后使用个人工具。":error?.error?.message??`请求失败（${response.status}），请重试。`,error?.error?.requestId);
  }
  if (response.status===204) return undefined as T;
  return response.json() as Promise<T>;
}
export const personalData = async <T,>(path:string, method="GET", body?:unknown):Promise<T> => {const result=await personalRequest<{data:T}|undefined>(path,method,body);return result?.data as T;};
export async function allPersonal<T>(path:string):Promise<T[]> {
  const rows:T[]=[];
  for(let page=1;page<=500;page++){
    const result=await personalRequest<PageResult<T>>(`${path}${path.includes("?")?"&":"?"}page=${page}&size=100`);
    rows.push(...result.data);if(!result.page.hasMore)return rows;
  }
  throw new Error("记录超过可读取范围，请缩小范围。");
}
