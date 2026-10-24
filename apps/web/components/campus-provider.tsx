'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CampusApiError, createAdapter, type HttpAdapter, type DataMode } from '@/lib/api/adapter';
import type { LoginRequest, RegisterRequest, User, UserPatch } from '@/lib/api/contracts';
import { clearPrivateCache } from '@/lib/api/auth-policy';
import { useTheme } from 'next-themes';

const sessionKey = ['campus', 'session'] as const;
type SessionStatus = 'demo' | 'loading' | 'authenticated' | 'anonymous' | 'error';
type CampusContext = {
  mode: DataMode;
  adapter: HttpAdapter;
  user: User | null;
  status: SessionStatus;
  error: Error | null;
  busy: boolean;
  login(input: LoginRequest): Promise<User>;
  register(input: RegisterRequest): Promise<{ verificationRequired: boolean }>;
  logout(): Promise<void>;
  updateProfile(input: UserPatch): Promise<User>;
  refresh(): Promise<void>;
};
const Context = createContext<CampusContext | null>(null);

export function CampusProvider({ children }: { children: ReactNode }) {
  const [adapter] = useState(() => createAdapter());
  const client = useQueryClient();
  const { setTheme } = useTheme();
  const operation = useRef(false);
  const [busy, setBusy] = useState(false);
  const session = useQuery({
    queryKey: sessionKey,
    enabled: adapter.mode === 'api' && !busy,
    queryFn: async ({ signal }) => {
      try {
        return await adapter.me(signal);
      } catch (error) {
        if (error instanceof CampusApiError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: true,
  });
  const status: SessionStatus =
    adapter.mode === 'mock'
      ? 'demo'
      : session.isPending
        ? 'loading'
        : session.isError
          ? 'error'
          : session.data
            ? 'authenticated'
            : 'anonymous';
  const user = status === 'authenticated' ? (session.data ?? null) : null;
  useEffect(() => {
    if (user) setTheme(user.theme);
  }, [user?.id, user?.theme, setTheme]);
  const previousUser = useRef<string | null>(null);
  useEffect(() => {
    const current = user?.id ?? null;
    if (previousUser.current && previousUser.current !== current) {
      void clearPrivateCache(client, previousUser.current);
    }
    previousUser.current = current;
  }, [user?.id, client]);

  async function run<T>(action: () => Promise<T>): Promise<T> {
    if (adapter.mode !== 'api') throw new Error('真实账号服务仅在 API 模式可用。');
    if (operation.current) throw new Error('正在处理上一项账号操作，请稍候。');
    operation.current = true;
    setBusy(true);
    try {
      await client.cancelQueries({ queryKey: sessionKey });
      return await action();
    } catch (error) {
      if (error instanceof CampusApiError && error.status === 401) {
        await clearPrivateCache(client);
        client.setQueryData(sessionKey, null);
      }
      throw error;
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }
  return (
    <Context.Provider
      value={{
        adapter,
        mode: adapter.mode,
        status,
        user,
        error: session.error,
        busy,
        login: (input) =>
          run(async () => {
            await clearPrivateCache(client);
            const value = await adapter.login(input);
            client.setQueryData(sessionKey, value);
            return value;
          }),
        register: (input) => run(() => adapter.register(input)),
        logout: () =>
          run(async () => {
            await clearPrivateCache(client);
            await adapter.logout();
            client.setQueryData(sessionKey, null);
          }),
        updateProfile: (input) =>
          run(async () => {
            const value = await adapter.updateMe(input);
            client.setQueryData(sessionKey, value);
            return value;
          }),
        refresh: async () => {
          await session.refetch();
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}

export function useCampus() {
  const context = useContext(Context);
  if (!context) throw new Error('useCampus 必须在 CampusProvider 中使用。');
  return context;
}
