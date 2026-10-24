import {ExperienceDetail} from '@/features/knowledge/knowledge-pages';
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <ExperienceDetail id={id}/>;}
