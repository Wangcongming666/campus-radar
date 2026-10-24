'use client';
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
interface RadarState {
  favorites: string[];
  applications: Application[];
  notes: Record<string, string>;
  completed: string[];
  userName: string;
  profileComplete: boolean;
  notifications: RadarNotification[];
  notify: (input: NoticeInput) => void;
  removeNotification: (id: string) => void;
  lastMove: { id: string; from: Stage; to: Stage; version: number } | null;
  toggleFavorite: (type: string, id: string) => void;
  addApplication: (jobId: string) => void;
  moveApplication: (id: string, stage: Stage) => void;
  undoMove: () => void;
  reorderApplication: (id: string, targetId: string) => void;
  removeApplication: (id: string) => void;
  updateApplication: (
    id: string,
    patch: Partial<Pick<Application, 'notes' | 'archived' | 'resumeId' | 'date'>>,
    expectedVersion?: number,
  ) => boolean;
  setNote: (id: string, note: string) => void;
  toggleCompleted: (id: string) => void;
  setProfile: (name: string) => void;
  reset: () => void;
}
export const useRadarStore = create<RadarState>()(
  persist(
    (set, get) => ({
      favorites: ['job:job-1', 'job:job-2', 'experience:exp-1'],
      applications: initialApplications,
      notes: {},
      completed: ['js'],
      userName: '林同学',
      profileComplete: false,
      notifications: [],
      notify: (input) =>
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
        })),
      removeNotification: (id) =>
        set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) })),
      lastMove: null,
      toggleFavorite: (type, id) =>
        set((s) => ({
          favorites: s.favorites.includes(`${type}:${id}`)
            ? s.favorites.filter((k) => k !== `${type}:${id}`)
            : [...s.favorites, `${type}:${id}`],
        })),
      addApplication: (jobId) => {
        if (!getJob(jobId)) {
          toast.error('未找到岗位，无法加入投递。');
          return;
        }
        const existing = get().applications.find((a) => a.jobId === jobId);
        if (existing?.archived) {
          get().updateApplication(existing.id, { archived: false });
          toast.success('已恢复这份投递');
          return;
        }
        if (existing) {
          toast.info('这份岗位已在投递看板中');
          return;
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
      },
      moveApplication: (id, stage) => {
        const item = get().applications.find((a) => a.id === id);
        if (!item || item.stage === stage) return;
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
      },
      reorderApplication: (id, targetId) => {
        try {
          set((s) => ({
            applications: reorderApplication(s.applications, id, targetId),
            lastMove: null,
          }));
        } catch {
          toast.error('排序目标已改变，请重新选择。');
        }
      },
      removeApplication: (id) =>
        set((s) => ({ applications: s.applications.filter((a) => a.id !== id), lastMove: null })),
      undoMove: () => {
        const move = get().lastMove;
        if (!move) return;
        try {
          set((s) => ({
            applications: undoApplicationTransition(s.applications, move),
            lastMove: null,
          }));
        } catch {
          set({ lastMove: null });
          toast.info('记录已有更新，无法撤销旧操作');
          return;
        }
        toast.success('已撤销阶段移动');
      },
      updateApplication: (id, patch, expectedVersion) => {
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
      setNote: (id, note) => set((s) => ({ notes: { ...s.notes, [id]: note } })),
      toggleCompleted: (id) =>
        set((s) => ({
          completed: s.completed.includes(id)
            ? s.completed.filter((v) => v !== id)
            : [...s.completed, id],
        })),
      setProfile: (name) => set({ userName: name, profileComplete: true }),
      reset: () => {
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
          userName: '林同学',
          profileComplete: false,
          lastMove: null,
          notifications: [],
        });
        if (typeof window !== 'undefined') window.dispatchEvent(new Event(LOCAL_RESET_EVENT));
        toast.success('演示数据已重置');
      },
    }),
    {
      name: 'campus-radar-demo-v1',
      storage: createJSONStorage(() => ({
        getItem: (key) => {
          try {
            return localStorage.getItem(key);
          } catch {
            return null;
          }
        },
        removeItem: (key) => localStorage.removeItem(key),
        setItem: (key, value) => {
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
