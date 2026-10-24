'use client';

import { useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Cloud, LoaderCircle } from 'lucide-react';
import { Button } from './ui/button';
import { EmptyState, PageHeader, Panel } from './shared';
import { useCampus } from './campus-provider';
import { routeTitle } from '@/lib/navigation';

export function SessionBoundary({ children }: { children: ReactNode }) {
  const campus = useCampus();
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const query = params.toString();
  useEffect(() => {
    if (campus.status === 'anonymous')
      router.replace(
        '/login?returnTo=' + encodeURIComponent(pathname + (query ? '?' + query : '')),
      );
  }, [campus.status, pathname, query, router]);
  if (campus.status === 'error')
    return (
      <main className="max-w-xl mx-auto p-8 pt-24">
        <h1 className="text-2xl mb-5">暂时无法连接账号</h1>
        <div role="alert" className="text-sm text-muted-foreground leading-7">
          {campus.error?.message ?? '网络连接失败，请稍后重试。'}
        </div>
        <div className="flex gap-3 mt-6">
          <Button onClick={() => void campus.refresh()}>重新连接</Button>
          <Button asChild variant="outline">
            <Link href="/login">返回登录</Link>
          </Button>
        </div>
      </main>
    );
  if (campus.status !== 'authenticated')
    return (
      <main
        className="min-h-screen flex items-center justify-center gap-3 text-sm text-muted-foreground"
        aria-live="polite"
      >
        <LoaderCircle className="size-5 animate-spin" />
        正在确认登录状态…
      </main>
    );
  return children;
}

export function PendingCloudModule() {
  const pathname = usePathname();
  return (
    <>
      <PageHeader
        title={`${routeTitle(pathname)}正在接入云端`}
        description="当前账号已连接。此模块将在后续批次启用。"
      />
      <Panel>
        <EmptyState
          title="先完善你的个人资料"
          description="云端与本地演示分别保存。这里会在接入完成后显示你的真实数据。"
          action={
            <Button asChild>
              <Link href="/me">
                <Cloud className="size-4" />
                打开个人主页
              </Link>
            </Button>
          }
        />
      </Panel>
    </>
  );
}
