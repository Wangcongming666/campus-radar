import {Suspense} from 'react';
import {QuestionsPage} from '@/features/extended/knowledge';
export default function Page(){return <Suspense fallback={<div className="p-8 text-muted-foreground">正在载入题库…</div>}><QuestionsPage/></Suspense>}
