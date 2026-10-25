'use client';
import { useState, useEffect, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import {
  Radar,
  Search,
  Bell,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  PanelLeft,
  Sun,
  Moon,
  Settings,
  Bookmark,
  ArrowUpRight,
  Sparkles,
  BriefcaseBusiness,
  Columns3,
  BookOpen,
  UserRound,
  X,
  Radio,
  LogOut,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GlobalSearch } from '@/components/global-search';
import { PreviewDrawer } from '@/components/preview-drawer';
import { navigation, routeTitle } from '@/lib/navigation';
import { useRadarStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { useCampus } from './campus-provider';
import { SessionBoundary } from './api-workspace';
import { toast } from 'sonner';
import { ApiWorkspaceProvider } from './api-workspace-provider';
export function AppShell({ children }: { children: ReactNode }) {
  const { mode } = useCampus();
  return mode === 'api' ? (
    <SessionBoundary>
      <ApiWorkspaceProvider><WorkspaceShell cloud>{children}</WorkspaceShell></ApiWorkspaceProvider>
    </SessionBoundary>
  ) : (
    <WorkspaceShell>{children}</WorkspaceShell>
  );
}
function WorkspaceShell({ children, cloud = false }: { children: ReactNode; cloud?: boolean }) {
  const campus = useCampus();
  const pathname = usePathname();
  const reduced = useReducedMotion();
  const readNotifications = useRadarStore((s) => s.notes['notifications-read']);
  const hiddenNotifications = useRadarStore((s) => s.notes['notifications-hidden']);
  const localNotifications = useRadarStore((s) => s.notifications);
  let unread = cloud ? 0 : 5;
  try {
    const read: string[] = JSON.parse(readNotifications ?? '[]'),
      hidden: string[] = JSON.parse(hiddenNotifications ?? '[]');
    unread = [
      ...(cloud ? [] : Array.from({ length: 5 }, (_, index) => `notice-${index + 1}`)),
      ...localNotifications.map((notice) => notice.id),
    ].filter((id) => !read.includes(id) && !hidden.includes(id)).length;
  } catch {}
  const [collapsed, setCollapsed] = useState(false),
    [mobile, setMobile] = useState(false),
    [search, setSearch] = useState(false),
    [mounted, setMounted] = useState(false);
  const { theme, setTheme, resolvedTheme } = useTheme();
  const demoName = useRadarStore((s) => s.userName);
  const userName = cloud ? (campus.user?.displayName ?? '') : demoName;
  async function signOut() {
    try {
      await campus.logout();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '退出失败，请重试。');
    }
  }
  useEffect(() => setMounted(true), []);
  useEffect(() => setMobile(false), [pathname]);
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');
  return (
    <div className="app-shell">
      <aside
        className={cn('sidebar', collapsed && 'is-collapsed', mobile && 'mobile-open')}
        aria-label="主导航"
      >
        <div className="brand-lockup">
          <Link href="/" className="brand-icon" aria-label="校招雷达首页">
            <Radar className="size-6" />
          </Link>
          <Link href="/" className="brand-copy">
            <div className="brand-name">
              校招雷达<span className="text-primary">.</span>
            </div>
            <div className="brand-en">Campus Radar</div>
          </Link>
          <button
            aria-label="关闭导航"
            onClick={() => setMobile(false)}
            className="ml-auto lg:hidden text-muted-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="sidebar-scroll">
          {navigation.map((group) => (
            <div key={group.label}>
              <div className="nav-label">{group.label}</div>
              <nav className="grid gap-1">
                {group.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={item.label}
                    aria-label={item.label}
                    className={cn('nav-link', isActive(item.href) && 'active')}
                  >
                    <item.icon />
                    <span className="nav-text">{item.label}</span>
                    {!cloud && item.badge && <span className="nav-count">{item.badge}</span>}
                  </Link>
                ))}
              </nav>
            </div>
          ))}
        </div>
        <div className="sidebar-bottom">
          <div className="sidebar-upgrade">
            <div className="flex gap-2 items-center text-xs font-semibold">
              <Sparkles className="size-3.5 text-primary" />
              为下一份 Offer 做好准备
            </div>
            <Link
              href="/planner"
              className="flex items-center justify-between text-[10px] text-muted-foreground mt-2"
            >
              查看我的求职计划
              <ArrowUpRight className="size-3" />
            </Link>
          </div>
          <div className="flex items-center gap-2 p-1">
            <Link href="/me" className="avatar">
              {userName.slice(0, 1)}
            </Link>
            <Link href="/me" className="user-copy flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{userName}</p>
              <p className="text-[9px] text-subtle">
                {cloud ? '个人云端账号' : '2027届 · 产品预览'}
              </p>
            </Link>
            <Link
              href="/settings"
              aria-label="设置"
              className="user-copy text-subtle hover:text-primary"
            >
              <Settings className="size-4" />
            </Link>
          </div>
        </div>
      </aside>
      <div className={cn('workspace', collapsed && 'is-collapsed')}>
        <header className="app-topbar">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="hidden lg:inline-flex size-7 text-subtle"
              onClick={() => setCollapsed(!collapsed)}
              aria-label={collapsed ? '展开侧栏' : '折叠侧栏'}
            >
              {collapsed ? <ChevronsRight /> : <ChevronsLeft />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden size-8"
              onClick={() => setMobile(true)}
              aria-label="打开导航"
            >
              <PanelLeft />
            </Button>
            <div className="topbar-breadcrumb">
              <span>工作台</span>
              <ChevronRight className="size-3" />
              <span className="text-foreground">{routeTitle(pathname)}</span>
            </div>
          </div>
          <div className="flex items-center gap-3 sm:gap-5">
            {(
              <button
                className="topbar-search"
                onClick={() => setSearch(true)}
                aria-label="全局搜索"
              >
                <Search className="size-3.5" />
                <span>搜索岗位、公司、面经…</span>
                <kbd>⌘ K</kbd>
              </button>
            )}
            <span className="hidden xl:flex items-center gap-1.5 text-[10px] text-status-offer">
              <span className="status-dot" />
              {cloud ? '账号已连接' : '2027 秋招季'}
            </span>
            <div className="flex items-center gap-1.5 border-l border-border pl-3">
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-muted-foreground"
                aria-label="切换明暗主题"
                disabled={cloud && campus.busy}
                onClick={async () => {
                  const next = resolvedTheme === 'dark' ? 'light' : 'dark';
                  try {
                    if (cloud) await campus.updateProfile({ theme: next });
                    setTheme(next);
                  } catch (failure) {
                    toast.error(failure instanceof Error ? failure.message : '外观保存失败，请重试');
                  }
                }}
              >
                {mounted && resolvedTheme === 'dark' ? <Sun /> : <Moon />}
              </Button>
              {(
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground"
                  asChild
                >
                  <Link href="/notifications" aria-label="通知中心">
                    <span className="relative">
                      <Bell className="size-4" />
                      {unread > 0 && (
                        <i className="absolute -top-0.5 -right-0.5 size-1 rounded-full bg-primary" />
                      )}
                    </span>
                  </Link>
                </Button>
              )}
              {cloud && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground"
                  aria-label="退出登录"
                  disabled={campus.busy}
                  onClick={() => void signOut()}
                >
                  <LogOut />
                </Button>
              )}
              <Link href="/me" className="avatar ml-1" aria-label="个人主页">
                {userName.slice(0, 1)}
              </Link>
            </div>
          </div>
        </header>
        <main className="workspace-content">
          <motion.div
            key={pathname}
            initial={reduced ? false : { opacity: 0.8, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
          >
            {children}
          </motion.div>
        </main>
      </div>
      <nav className="mobile-tabs" aria-label="底部导航">
        {[
          { label: '岗位', href: '/jobs', icon: BriefcaseBusiness },
          { label: '投递', href: '/pipeline', icon: Columns3 },
          { label: '知识', href: '/experiences', icon: BookOpen },
          { label: '我的', href: '/me', icon: UserRound },
        ].map((item) => (
          <Link key={item.href} href={item.href} className={cn(isActive(item.href) && 'active')}>
            <item.icon className="size-[19px]" />
            {item.label}
          </Link>
        ))}
      </nav>
      {(
        <>
          <GlobalSearch open={search} setOpen={setSearch} />
          <PreviewDrawer />
        </>
      )}
    </div>
  );
}
