import {TimelinePage} from '@/features/extended/interviews';
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <TimelinePage id={id}/>;}
