'use client';
import { useEffect } from 'react';
import { useRadarStore } from '@/lib/store';
import { getJob } from '@/lib/data';
import { LOCAL_STATE_EVENT } from '@/lib/local-workspace';
import type { CalendarEvent } from '@/lib/calendar-domain';

/** Foreground-only local reminders. No notification permission or outbound requests. */
export function LocalReminders() {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_DATA_MODE === 'api') return;
    function check() {
      if (!useRadarStore.persist.hasHydrated()) return;
      const state = useRadarStore.getState();
      let preferences: Record<string, boolean> = { interview: true, deadline: true },
        sent: string[] = [],
        events: CalendarEvent[] = [];
      try {
        preferences = JSON.parse(
          state.notes['account-preferences'] ?? '{"interview":true,"deadline":true}',
        );
        const saved: unknown = JSON.parse(state.notes['local-reminders-sent'] ?? '[]');
        if (Array.isArray(saved))
          sent = saved.filter((key): key is string => typeof key === 'string');
        const stored: unknown = JSON.parse(localStorage.getItem('radar-extended-events') ?? '[]');
        if (Array.isArray(stored)) events = stored;
      } catch {
        return;
      }
      const now = Date.now(),
        added: string[] = [];
      if (preferences?.interview)
        for (const event of events) {
          if (!event || event.completed || event.type === '截止' || typeof event.date !== 'string')
            continue;
          const when = Date.parse(`${event.date}T${event.time}:00+08:00`),
            key = `event:${event.id}:${event.date}:${event.time}`;
          if (when >= now && when - now <= 15 * 60000 && !sent.includes(key)) {
            state.notify({
              title: '日程将在 15 分钟内开始',
              content: `${event.title} · ${event.time}（上海时间）`,
              category: '面试提醒',
              href: `/calendar?date=${event.date}`,
            });
            added.push(key);
          }
        }
      if (preferences?.deadline)
        for (const favorite of state.favorites) {
          if (!favorite.startsWith('job:')) continue;
          const job = getJob(favorite.slice(4));
          if (!job?.deadline) continue;
          const when = Date.parse(`${job.deadline}T23:59:59+08:00`),
            key = `deadline:${job.id}:${job.deadline}`;
          if (when >= now && when - now <= 3 * 86400000 && !sent.includes(key)) {
            state.notify({
              title: '收藏岗位即将截止',
              content: `${job.title} 的样本截止日期为 ${job.deadline}；真实投递请核对企业官网。`,
              category: '岗位动态',
              href: `/jobs?preview=job:${job.id}`,
            });
            added.push(key);
          }
        }
      if (added.length)
        state.setNote('local-reminders-sent', JSON.stringify([...sent, ...added].slice(-500)));
    }
    check();
    const unsubscribe = useRadarStore.persist.onFinishHydration(check);
    const timer = setInterval(check, 60000);
    window.addEventListener(LOCAL_STATE_EVENT, check);
    return () => {
      unsubscribe();
      clearInterval(timer);
      window.removeEventListener(LOCAL_STATE_EVENT, check);
    };
  }, []);
  return null;
}
