import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
const environment = vi.hoisted(() => {
  const previous = process.env.NEXT_PUBLIC_DATA_MODE;
  process.env.NEXT_PUBLIC_DATA_MODE = 'api';
  return { previous };
});
afterAll(() => {
  if (environment.previous === undefined) delete process.env.NEXT_PUBLIC_DATA_MODE;
  else process.env.NEXT_PUBLIC_DATA_MODE = environment.previous;
});
vi.mock('@/components/campus-provider', () => ({
  useCampus: () => ({
    mode: 'api',
    busy: false,
    user: {
      id: '123e4567-e89b-42d3-a456-426614174000',
      displayName: '真实账号同学',
      school: '实际学校',
      education: 'master',
      graduationYear: 2028,
      preferences: {
        schemaVersion: 1,
        roles: ['实际研发方向'],
        cities: ['实际城市'],
        industries: [],
        recruitmentTypes: [],
        graduationYear: 2028,
      },
      theme: 'light',
      timezone: 'Asia/Shanghai',
      onboardingStep: 1,
    },
  }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({}) }));
vi.mock('@/lib/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/store')>();
  const hook = actual.useRadarStore;
  return {
    ...actual,
    useRadarStore: Object.assign(
      (selector?: (value: ReturnType<typeof hook.getState>) => unknown) =>
        selector ? selector(hook.getState()) : hook.getState(),
      hook,
    ),
  };
});
import { SettingsPage, NotificationsPage } from './account-pages';
import { useRadarStore } from '@/lib/store';
beforeEach(() => useRadarStore.setState({ notifications: [], notes: {} }));

describe('real account settings and notifications', () => {
  it('shows actual account profile and cloud backup tools instead of localStorage export/reset', () => {
    const html = renderToStaticMarkup(createElement(SettingsPage));
    expect(html).toContain('真实账号同学');
    expect(html).toContain('实际学校');
    expect(html).toContain('实际研发方向');
    expect(html).toContain('账号数据备份与恢复');
    expect(html).toContain('清空本账户私有求职数据');
    expect(html).not.toContain('重置演示数据');
    expect(html).not.toContain('导出完整备份');
  });
  it('does not add demo notifications to a real empty account', () => {
    const html = renderToStaticMarkup(createElement(NotificationsPage));
    expect(html).toContain('0 条未读');
    expect(html).not.toContain('腾讯 WXG');
    expect(html).not.toContain('你的收藏岗位即将截止');
    expect(html).not.toContain('预置样本');
  });
  it('renders only real saved notifications with their original details', () => {
    useRadarStore.setState({
      notifications: [
        {
          id: 'notice-real-uuid',
          title: '实际面试提醒',
          content: '用户保存的真实安排',
          category: '面试提醒',
          date: '2026-10-24',
          href: '/calendar',
          action: '查看安排',
        },
      ],
    });
    const html = renderToStaticMarkup(createElement(NotificationsPage));
    expect(html).toContain('实际面试提醒');
    expect(html).toContain('用户保存的真实安排');
    expect(html).not.toContain('下一场对话，准备好了吗');
  });
});
