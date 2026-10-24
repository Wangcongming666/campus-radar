import {notFound} from 'next/navigation';
import {companies} from '@/lib/data';
import {PackPage} from '@/features/extended/knowledge';
export default async function Page({params}:{params:Promise<{company:string}>}){const {company}=await params;if(!companies.some(c=>c.slug===company))notFound();return <PackPage company={company}/>;}
