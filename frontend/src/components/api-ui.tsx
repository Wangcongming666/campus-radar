import { useCallback,useEffect,useState,type ReactNode } from "react";
import { apiRequest, ApiError } from "../api/auth";
import { Button } from "./ui";

export function useApi<T>(path:string|null) {
  const [data,setData]=useState<T|null>(null),[error,setError]=useState(""),[loading,setLoading]=useState(true),[version,setVersion]=useState(0);
  const refresh=useCallback(()=>setVersion(x=>x+1),[]);
  useEffect(()=>{if(!path){setData(null);setLoading(false);return;}const controller=new AbortController();setLoading(true);setError("");setData(null);apiRequest<T>(path,{signal:controller.signal}).then(setData).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[path,version]);
  return {data,error,loading,refresh,setData};
}
export function LoadState({loading,error,children,retry}:{loading:boolean;error:string;children:ReactNode;retry?:()=>void}){if(loading)return <p role="status">正在加载…</p>;if(error)return <div role="alert"><p>{error}</p>{retry&&<Button onClick={retry}>重新加载</Button>}</div>;return <>{children}</>;}
export function useCommand(after?:()=>void){const [busy,setBusy]=useState(false),[error,setError]=useState("");async function run(action:()=>Promise<unknown>,success?:()=>void){if(busy)return;setBusy(true);setError("");try{await action();success?.();after?.();}catch(e){setError(e instanceof Error?e.message:"操作失败，请重试。");if(e instanceof ApiError&&e.status===401)window.dispatchEvent(new Event("campus:account-changed"));}finally{setBusy(false);}}return {busy,error,run};}
export async function mutate<T=unknown>(path:string,method:string,body?:unknown,key?:string):Promise<T>{return apiRequest<T>(path,{method,headers:key?{"Idempotency-Key":key}:undefined,body:body===undefined?undefined:JSON.stringify(body)});}
