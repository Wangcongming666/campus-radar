import CompanyDetail from '@/features/jobs/company-detail';import {companies} from '@/lib/data';import {notFound} from 'next/navigation';
export default async function Page({params}:{params:Promise<{id:string}>}){const{id}=await params;if(!companies.some(c=>c.id===id||c.slug===id))notFound();return <CompanyDetail id={id}/>;}
