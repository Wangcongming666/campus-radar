'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { ThemeProvider } from 'next-themes';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { useRadarStore } from '@/lib/store';
import { CampusProvider } from './campus-provider';
import { LocalReminders } from './local-reminders';
export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 30000, retry: 1, refetchOnWindowFocus: false } },
      }),
  );
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_DATA_MODE === 'api') return;
    void useRadarStore.persist.rehydrate();
    const sync = (event: StorageEvent) => {
      if (event.key === 'campus-radar-demo-v1' || event.key === null)
        void useRadarStore.persist.rehydrate();
    };
    const fail = () => setStorageError(true);
    window.addEventListener('storage', sync);
    window.addEventListener('radar-storage-error', fail);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('radar-storage-error', fail);
    };
  }, []);
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={client}>
        <CampusProvider>
          <LocalReminders />
          {storageError && (
            <div
              role="alert"
              className="fixed bottom-20 left-4 right-4 z-[100] rounded-xl border border-destructive bg-background p-4 text-xs text-destructive shadow-overlay"
            >
              浏览器未能保存记录：当前更改只保留在内存中，刷新可能丢失。请在设置中导出备份并释放存储空间。
              <button className="ml-3 underline" onClick={() => setStorageError(false)}>
                我知道了
              </button>
            </div>
          )}
          {children}
        </CampusProvider>
        <Toaster richColors position="bottom-right" theme="system" closeButton />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
