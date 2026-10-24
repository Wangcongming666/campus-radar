import {ReviewPage} from '@/features/extended/interviews';
export default async function Page({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{round?:string}>}){const [{id},{round}]=await Promise.all([params,searchParams]);return <ReviewPage id={id} round={round}/>;}
