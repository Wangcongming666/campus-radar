import {Suspense} from 'react';import {AppShell} from '@/components/app-shell';
export default function WorkspaceLayout({children}:{children:React.ReactNode}){return <Suspense fallback={<div className="min-h-screen bg-background p-10 text-muted-foreground">正在打开校招雷达…</div>}><AppShell>{children}</AppShell></Suspense>;}
