import JobDetail from '@/features/jobs/job-detail';import {jobs} from '@/lib/data';import {notFound} from 'next/navigation';
export default async function Page({params}:{params:Promise<{id:string}>}){const{id}=await params;if(!jobs.some(j=>j.id===id))notFound();return <JobDetail id={id}/>;}
