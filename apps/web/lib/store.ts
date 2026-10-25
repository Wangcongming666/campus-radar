'use client';
import type { HttpAdapter } from './api/adapter';
import type {
  ApplicationCard as ApiApplication,
  Application as ApiApplicationDetail,
  Favorite,
} from './api/contracts';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { getJob, initialApplications, type Application, type Stage } from './data';
import { toast } from 'sonner';
import { reorderApplication, transitionApplication, undoApplicationTransition } from './domain';
import { LOCAL_RESET_EVENT } from './local-workspace';
import { workspaceSchema } from './workspace-schema';
export type RadarNotification = {
  id: string;
  title: string;
  content: string;
  category: '面试提醒' | '岗位动态' | '学习提醒' | '系统通知';
  href: string;
  action: string;
  date: string;
};
type NoticeInput = Omit<RadarNotification, 'id' | 'date' | 'href' | 'action'> & {
  href?: string;
  action?: string;
};
type SaveResult = boolean | Promise<boolean>;
interface RadarState {
  favorites: string[];
  applications: Application[];
  notes: Record<string, string>;
  completed: string[];
  userName: string;
  profileComplete: boolean;
  notifications: RadarNotification[];
  notify: (input: NoticeInput) => SaveResult;
  removeNotification: (id: string) => SaveResult;
  lastMove: { id: string; from: Stage; to: Stage; version: number; operationId?: string } | null;
  toggleFavorite: (type: string, id: string) => SaveResult;
  addApplication: (jobId: string) => SaveResult;
  moveApplication: (id: string, stage: Stage) => SaveResult;
  undoMove: () => SaveResult;
  reorderApplication: (id: string, targetId: string) => SaveResult;
  removeApplication: (id: string) => SaveResult;
  updateApplication: (
    id: string,
    patch: Partial<Pick<Application, 'notes' | 'archived' | 'resumeId' | 'date'>>,
    expectedVersion?: number,
  ) => SaveResult;
  setNote: (id: string, note: string) => SaveResult;
  toggleCompleted: (id: string) => SaveResult;
  setProfile: (name: string) => SaveResult;
  reset: () => SaveResult;
}
const apiMode = process.env.NEXT_PUBLIC_DATA_MODE === 'api';
export type RadarPrivateBridge = {
  notes: (value: Record<string, string>) => Promise<boolean>;
  completed: (value: string[]) => Promise<boolean>;
  notifications: (value: RadarNotification[]) => Promise<boolean>;
};
let apiContext: { adapter: HttpAdapter; userId: string; bridge?: RadarPrivateBridge } | null = null;
export function configureApiRadar(
  adapter: HttpAdapter,
  userId: string,
  bridge?: RadarPrivateBridge,
) {
  if (apiContext?.userId !== userId) resetApiRadar();
  apiContext = { adapter, userId, bridge };
}
function fromApi(a: ApiApplication | ApiApplicationDetail): Application {
  return {
    id: a.id,
    jobId: a.job.id,
    stage: a.stage,
    notes: a.notes,
    date: a.date ?? a.appliedAt?.slice(0, 10) ?? a.createdAt.slice(0, 10),
    version: a.version,
    archived: !!a.archivedAt,
    resumeId: a.resumeId ?? undefined,
    appliedAt: a.appliedAt ?? undefined,
    updatedAt: a.updatedAt,
    history: (a.stageHistory ?? [])
      .filter((e) => e.fromStage !== null)
      .map((e) => ({ id: e.id, from: e.fromStage!, to: e.toStage, at: e.occurredAt })),
  };
}
export async function hydrateApiRadar(
  initial?: Partial<Pick<RadarState, 'notes' | 'completed' | 'notifications' | 'userName'>>,
) {
  const context = apiContext;
  if (!context) throw new Error('请先连接账号。');
  const board = await context.adapter.applications({ includeArchived: true });
  const favorites: string[] = [];
  let cursor: string | undefined;
  do {
    const result = await context.adapter.favorites({ limit: 100, cursor });
    favorites.push(...result.data.map((f) => `${f.targetType}:${f.targetId}`));
    cursor = result.page.nextCursor ?? undefined;
  } while (cursor);
  if (apiContext !== context) return;
  useRadarStore.setState({
    ...initial,
    applications: board.items.map(fromApi),
    favorites,
    lastMove: null,
  });
}
export function resetApiRadar() {
  apiContext = null;
  useRadarStore.setState({
    favorites: [],
    applications: [],
    notes: {},
    completed: [],
    notifications: [],
    userName: '',
    profileComplete: false,
    lastMove: null,
  });
}
async function act(run: (adapter: HttpAdapter) => Promise<void>): Promise<boolean> {
  const context = apiContext;
  if (!context) {
    toast.error('请先登录。');
    return false;
  }
  const guarded = new Proxy(context.adapter, {
    get(target, key) {
      const value = Reflect.get(target, key);
      if (typeof value !== 'function') return value;
      return async (...args: unknown[]) => {
        const result = await value.apply(target, args);
        if (apiContext !== context) throw new Error('账号已切换，本次操作结果已忽略。');
        return result;
      };
    },
  });
  try {
    await run(guarded);
    return apiContext === context;
  } catch (error) {
    if (apiContext !== context) return false;
    toast.error(error instanceof Error ? error.message : '保存失败，请重试。');
    if (apiContext === context) {
      try {
        await hydrateApiRadar();
      } catch {}
    }
    return false;
  }
}
function putApplication(a: ApiApplication | ApiApplicationDetail) {
  const item = fromApi(a);
  useRadarStore.setState((s) => ({
    applications: s.applications.some((x) => x.id === item.id)
      ? s.applications.map((x) => (x.id === item.id ? item : x))
      : [...s.applications, item],
  }));
}
async function apiFavorite(type: string, id: string) {
  return act(async (adapter) => {
    if (!['job', 'company', 'experience', 'question'].includes(type))
      throw new Error('该内容暂不支持收藏。');
    const key = `${type}:${id}`,
      exists = useRadarStore.getState().favorites.includes(key);
    if (exists) await adapter.unfavorite(type as Favorite['targetType'], id);
    else await adapter.favorite(type as Favorite['targetType'], id);
    useRadarStore.setState((s) => ({
      favorites: exists
        ? s.favorites.filter((k) => k !== key)
        : [...new Set([...s.favorites, key])],
    }));
    toast.success(exists ? '已取消收藏' : '已收藏');
  });
}
async function apiAdd(jobId: string) {
  return act(async (adapter) => {
    const current = useRadarStore.getState().applications.find((a) => a.jobId === jobId);
    if (current && !current.archived) {
      toast.info('这份岗位已在投递看板中');
      return;
    }
    const app = current
      ? await adapter.updateApplication(current.id, { archived: false, version: current.version })
      : await adapter.createApplication(jobId, crypto.randomUUID());
    putApplication(app);
    toast.success(current ? '已恢复这份投递' : '已加入待投递清单');
  });
}
async function apiMove(id: string, stage: Stage) {
  return act(async (adapter) => {
    const current = useRadarStore.getState().applications.find((a) => a.id === id);
    if (!current || current.stage === stage) return;
    const result = await adapter.moveApplication(
      id,
      {
        stage,
        version: current.version,
        ...(stage === 'CLOSED' ? { closedReason: 'other' as const } : {}),
      },
      crypto.randomUUID(),
    );
    await hydrateApiRadar();
    useRadarStore.setState({
      lastMove: {
        id,
        from: current.stage,
        to: stage,
        version: result.application.version,
        operationId: result.event.operationId,
      },
    });
    toast.success('投递阶段已更新', {
      action: {
        label: '撤销',
        onClick: () => {
          void apiUndo();
        },
      },
    });
  });
}
async function apiReorder(id: string, targetId: string) {
  return act(async (adapter) => {
    const list = useRadarStore.getState().applications,
      current = list.find((a) => a.id === id),
      target = list.find((a) => a.id === targetId);
    if (!current || !target || current.stage !== target.stage) return;
    const result = await adapter.moveApplication(
      id,
      {
        stage: current.stage,
        version: current.version,
        ...(list.indexOf(current) < list.indexOf(target)
          ? { afterId: targetId }
          : { beforeId: targetId }),
        ...(current.stage === 'CLOSED' ? { closedReason: 'other' as const } : {}),
      },
      crypto.randomUUID(),
    );
    putApplication(result.application);
    await hydrateApiRadar();
    toast.success('投递排序已保存');
  });
}
async function apiUndo() {
  return act(async (adapter) => {
    const move = useRadarStore.getState().lastMove;
    if (!move?.operationId) return;
    const result = await adapter.undoApplication(
      move.id,
      { operationId: move.operationId, version: move.version },
      crypto.randomUUID(),
    );
    await hydrateApiRadar();
    useRadarStore.setState({ lastMove: null });
    toast.success('已撤销阶段移动');
  });
}
async function apiUpdate(
  id: string,
  patch: Partial<Pick<Application, 'notes' | 'archived' | 'resumeId' | 'date'>>,
  version?: number,
) {
  return act(async (adapter) => {
    const current = useRadarStore.getState().applications.find((a) => a.id === id);
    if (!current) throw new Error('未找到这份投递。');
    putApplication(
      await adapter.updateApplication(id, {
        ...patch,
        resumeId: patch.resumeId ?? (Object.hasOwn(patch, 'resumeId') ? null : undefined),
        version: version ?? current.version,
      }),
    );
  });
}
async function apiRemove(id: string) {
  return act(async (adapter) => {
    const current = useRadarStore.getState().applications.find((a) => a.id === id);
    if (!current) return;
    await adapter.deleteApplication(id, current.version);
    useRadarStore.setState((s) => ({
      applications: s.applications.filter((a) => a.id !== id),
      lastMove: null,
    }));
    toast.success('投递已删除');
  });
}
type PrivateValues = Pick<RadarState, 'notes' | 'completed' | 'notifications'>;
let privateQueue: Promise<void> = Promise.resolve();
function savePrivate<K extends keyof PrivateValues>(
  key: K,
  next: PrivateValues[K] | ((current: PrivateValues[K]) => PrivateValues[K]),
): Promise<boolean> {
  const context = apiContext;
  const pending = privateQueue.then(async () => {
    if (!context?.bridge || apiContext !== context) return false;
    const value = typeof next === 'function' ? next(useRadarStore.getState()[key]) : next;
    const save = context.bridge[key] as (value: PrivateValues[K]) => Promise<boolean>;
    try {
      if (!(await save(value)) || apiContext !== context) return false;
      useRadarStore.setState({ [key]: value });
      return true;
    } catch (error) {
      if (apiContext === context)
        toast.error(error instanceof Error ? error.message : '保存失败，请重试。');
      return false;
    }
  });
  privateQueue = pending.then(
    () => undefined,
    () => undefined,
  );
  return pending;
}
function apiNotify(input: NoticeInput): Promise<boolean> {
  const notice: RadarNotification = {
    ...input,
    id: `notice-${crypto.randomUUID()}`,
    date: new Date().toISOString(),
    href:
      input.href?.startsWith('/') && !input.href.startsWith('//') && !/[\\\r\n]/.test(input.href)
        ? input.href
        : '/notifications',
    action: input.action ?? '查看详情',
  };
  return savePrivate('notifications', (current) => [notice, ...current].slice(0, 300));
}
export const useRadarStore = create<RadarState>()(
  persist<
    RadarState,
    [],
    [],
    Pick<
      RadarState,
      | 'favorites'
      | 'applications'
      | 'notes'
      | 'completed'
      | 'userName'
      | 'profileComplete'
      | 'notifications'
    >
  >(
    (set, get) => ({
      favorites: apiMode ? [] : ['job:job-1', 'job:job-2', 'experience:exp-1'],
      applications: initialApplications,
      notes: {},
      completed: apiMode ? [] : ['js'],
      userName: apiMode ? '' : '林同学',
      profileComplete: false,
      notifications: [],
      notify: (input) => {
        if (apiMode) return apiNotify(input);
        set((s) => ({
          notifications: [
            {
              ...input,
              id: `notice-local-${crypto.randomUUID()}`,
              date: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
              href:
                input.href?.startsWith('/') &&
                !input.href.startsWith('//') &&
                !input.href.includes('\\')
                  ? input.href
                  : '/notifications',
              action: input.action ?? '查看详情',
            },
            ...s.notifications,
          ].slice(0, 300),
        }));
        return true;
      },
      removeNotification: (id) => {
        if (apiMode)
          return savePrivate('notifications', (current) => current.filter((n) => n.id !== id));
        set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) }));
        return true;
      },
      lastMove: null,
      toggleFavorite: (type, id) => {
        if (apiMode) return apiFavorite(type, id);
        set((s) => ({
          favorites: s.favorites.includes(`${type}:${id}`)
            ? s.favorites.filter((k) => k !== `${type}:${id}`)
            : [...s.favorites, `${type}:${id}`],
        }));
        return true;
      },
      addApplication: (jobId) => {
        if (apiMode) return apiAdd(jobId);
        if (!getJob(jobId)) {
          toast.error('未找到岗位，无法加入投递。');
          return false;
        }
        const existing = get().applications.find((a) => a.jobId === jobId);
        if (existing?.archived) {
          get().updateApplication(existing.id, { archived: false });
          toast.success('已恢复这份投递');
          return true;
        }
        if (existing) {
          toast.info('这份岗位已在投递看板中');
          return true;
        }
        set((s) => ({
          applications: [
            ...s.applications,
            {
              id: `app-${crypto.randomUUID()}`,
              jobId,
              stage: 'PENDING',
              notes: '',
              date: new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' }),
              updatedAt: new Date().toISOString(),
              history: [],
              version: 1,
            },
          ],
        }));
        toast.success('已加入待投递清单');
        return true;
      },
      moveApplication: (id, stage) => {
        if (apiMode) return apiMove(id, stage);
        const item = get().applications.find((a) => a.id === id);
        if (!item || item.stage === stage) return false;
        set((s) => ({
          applications: transitionApplication(s.applications, id, stage, item.version),
          lastMove: { id, from: item.stage, to: stage, version: item.version + 1 },
        }));
        get().notify({
          category: '岗位动态',
          title: '投递阶段已更新',
          content: `${getJob(item.jobId)?.title ?? '岗位'}已移动到新的阶段。`,
          href: `/interview/${item.id}/timeline`,
          action: '查看阶段记录',
        });
        toast.success('投递阶段已更新', {
          action: { label: '撤销', onClick: () => get().undoMove() },
        });
        return true;
      },
      reorderApplication: (id, targetId) => {
        if (apiMode) return apiReorder(id, targetId);
        try {
          set((s) => ({
            applications: reorderApplication(s.applications, id, targetId),
            lastMove: null,
          }));
        } catch {
          toast.error('排序目标已改变，请重新选择。');
          return false;
        }
        return true;
      },
      removeApplication: (id) => {
        if (apiMode) return apiRemove(id);
        set((s) => ({ applications: s.applications.filter((a) => a.id !== id), lastMove: null }));
        return true;
      },
      undoMove: () => {
        if (apiMode) return apiUndo();
        const move = get().lastMove;
        if (!move) return false;
        try {
          set((s) => ({
            applications: undoApplicationTransition(s.applications, move),
            lastMove: null,
          }));
        } catch {
          set({ lastMove: null });
          toast.info('记录已有更新，无法撤销旧操作');
          return false;
        }
        toast.success('已撤销阶段移动');
        return true;
      },
      updateApplication: (id, patch, expectedVersion) => {
        if (apiMode) return apiUpdate(id, patch, expectedVersion);
        // Read persisted versions as well: storage events can arrive after the save click.
        let applications = get().applications;
        try {
          const raw = localStorage.getItem('campus-radar-demo-v1');
          if (raw) {
            const stored = workspaceSchema.safeParse(JSON.parse(raw).state);
            if (stored.success) applications = stored.data.applications;
          }
        } catch {
          /* In-memory records remain available when storage is disabled. */
        }
        const current = applications.find((application) => application.id === id);
        if (!current || (expectedVersion !== undefined && current.version !== expectedVersion)) {
          set({ applications });
          return false;
        }
        set(() => ({
          applications: applications.map((a) =>
            a.id === id
              ? { ...a, ...patch, version: a.version + 1, updatedAt: new Date().toISOString() }
              : a,
          ),
        }));
        return true;
      },
      setNote: (id, note) => {
        if (apiMode) return savePrivate('notes', (current) => ({ ...current, [id]: note }));
        set((s) => ({ notes: { ...s.notes, [id]: note } }));
        return true;
      },
      toggleCompleted: (id) => {
        if (apiMode)
          return savePrivate('completed', (current) =>
            current.includes(id) ? current.filter((v) => v !== id) : [...current, id],
          );
        set((s) => ({
          completed: s.completed.includes(id)
            ? s.completed.filter((v) => v !== id)
            : [...s.completed, id],
        }));
        return true;
      },
      setProfile: (name) => {
        set({ userName: name, profileComplete: true });
        return true;
      },
      reset: () => {
        if (apiMode) {
          resetApiRadar();
          return true;
        }
        try {
          for (const key of Object.keys(localStorage)) {
            if (key.startsWith('radar-extended-')) localStorage.removeItem(key);
          }
        } catch {}
        set({
          favorites: [],
          applications: initialApplications,
          notes: {},
          completed: [],
          userName: apiMode ? '' : '林同学',
          profileComplete: false,
          lastMove: null,
          notifications: [],
        });
        if (typeof window !== 'undefined') window.dispatchEvent(new Event(LOCAL_RESET_EVENT));
        toast.success('演示数据已重置');
        return true;
      },
    }),
    {
      name: 'campus-radar-demo-v1',
      storage: createJSONStorage(() => ({
        getItem: (key) => {
          try {
            return apiMode ? null : localStorage.getItem(key);
          } catch {
            return null;
          }
        },
        removeItem: (key) => {
          if (!apiMode) localStorage.removeItem(key);
        },
        setItem: (key, value) => {
          if (apiMode) return;
          try {
            localStorage.setItem(key, value);
          } catch {
            if (typeof window !== 'undefined')
              window.dispatchEvent(new Event('radar-storage-error'));
          }
        },
      })),
      skipHydration: true,
      merge: (persisted, current) => {
        if (apiMode) return current;
        const parsed = workspaceSchema.safeParse(persisted);
        return parsed.success ? { ...current, ...parsed.data } : current;
      },
      partialize: (s) => ({
        favorites: s.favorites,
        applications: s.applications,
        notes: s.notes,
        completed: s.completed,
        userName: s.userName,
        profileComplete: s.profileComplete,
        notifications: s.notifications,
      }),
    },
  ),
);
