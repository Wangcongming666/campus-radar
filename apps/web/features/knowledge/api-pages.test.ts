import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, describe, expect, it, vi } from 'vitest';

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
  useCampus: () => ({ mode: 'api', user: { displayName: '真实同学' } }),
}));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));

import { ExperiencesPage, HandbookPage } from './knowledge-pages';
import { QuestionsPage, StylePage, PackPage } from '../extended/knowledge';
import { BuddyPage, CommunityPage, RadarPage } from '../extended/community';

describe('real account knowledge pages with an empty catalog', () => {
  it('renders an empty handbook and question catalog without invalid progress', () => {
    const handbook = renderToStaticMarkup(createElement(HandbookPage));
    expect(handbook).toContain('知识手册暂未收录内容');
    const questions = renderToStaticMarkup(createElement(QuestionsPage));
    expect(questions).toContain('真实题目入库后会显示在这里');
    expect(questions).not.toMatch(/(?:NaN|Infinity)%/);
    expect(renderToStaticMarkup(createElement(PackPage, { company: 'missing' }))).toContain(
      '未找到这家公司的资料',
    );
  });

  it('does not advertise fictional featured experiences or community posts', () => {
    const experiences = renderToStaticMarkup(createElement(ExperiencesPage));
    expect(experiences).not.toContain('腾讯 WXG');
    expect(experiences).not.toContain('一颗努力的栗子');
    const community = renderToStaticMarkup(createElement(CommunityPage));
    expect(community).not.toContain('今天也在学习');
    expect(community).not.toContain('小林同学');
    expect(community).toContain('当前显示你的账号记录');
  });

  it('keeps unconnected people, room samples and fabricated signal charts out of API mode', () => {
    const buddies = renderToStaticMarkup(createElement(BuddyPage));
    expect(buddies).not.toContain('样本同路人');
    expect(buddies).not.toContain('前端秋招 · 周末互面组');
    expect(buddies).not.toContain('小林同学');
    expect(buddies).toContain('暂无可核验的同路人资料');
    const radar = renderToStaticMarkup(createElement(RadarPage));
    expect(radar).toContain('暂无真实招聘情报');
    expect(radar).not.toContain('公司信号分布');
    const style = renderToStaticMarkup(createElement(StylePage, { company: 'missing' }));
    expect(style).toContain('暂无真实面试风格情报');
    expect(style).not.toContain('基础原理');
  });
});
