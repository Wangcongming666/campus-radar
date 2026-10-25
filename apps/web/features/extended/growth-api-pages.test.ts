import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

import { ResumeCheckPage } from './growth-resume';
import { ReferralPage, SubscriptionsPage } from './discovery';
import { SalaryPage } from './growth-salary';
import { PlannerPage } from './growth-planner';
import { OfferComparePage } from './growth-offers';
import { initializeWorkspace, clearWorkspace, workspaceRecord } from '@/lib/api/workspace-client';
import { validateWorkspaceValue } from '@/server/workspace-schema';

beforeEach(() => clearWorkspace());
afterEach(() => clearWorkspace());

describe('real account growth pages with an empty catalog', () => {
  it('shows an actionable missing-target state without diagnosing a fictional job', () => {
    const html = renderToStaticMarkup(createElement(ResumeCheckPage));
    expect(html).toContain('暂无可诊断的真实岗位');
    expect(html).toContain('href="/jobs"');
    expect(html).not.toContain('载入虚构样例');
    expect(html).not.toContain('规则得分');
  });
  it('allows users to create real referral records without displaying generated codes', () => {
    const html = renderToStaticMarkup(createElement(ReferralPage));
    expect(html).toContain('新增内推进度');
    expect(html).toContain('你可以录入真实公司、岗位和内推码');
    expect(html).not.toContain('DEMO-');
    expect(html).not.toContain('虚构');
  });
  it('starts salaries, plans and subscriptions empty and keeps legitimate offer configuration', () => {
    const salary = renderToStaticMarkup(createElement(SalaryPage));
    expect(salary).not.toContain('虚构');
    expect(salary).toContain('当前条件没有薪资样本');
    expect(renderToStaticMarkup(createElement(PlannerPage))).toContain('为求职设定第一个里程碑');
    expect(renderToStaticMarkup(createElement(SubscriptionsPage))).toContain('还没有订阅信号');
    const offer = renderToStaticMarkup(createElement(OfferComparePage));
    expect(offer).toContain('技术成长');
    expect(offer).toContain('还没有待比较的 Offer');
  });
});

describe('confirmed real account growth records', () => {
  it('renders a server-validated referral code and user-entered company without catalog fallback', () => {
    const records = [
      {
        id: 'referral-real',
        companyId: '',
        company: '用户实际联系公司',
        title: '真实内推岗位',
        code: 'REAL-CODE-FROM-CONTACT',
        role: '研发岗位方向',
        contact: '用户联系人备注',
        stage: '已自行联系',
        date: '2026-10-24',
        note: '实际进度记录',
      },
    ];
    initializeWorkspace('real-user', {
      'referral-records-v2': {
        value: validateWorkspaceValue('referral-records-v2', records),
        version: 1,
      },
    });
    const html = renderToStaticMarkup(createElement(ReferralPage));
    expect(html).toContain('用户实际联系公司');
    expect(html).toContain('真实内推岗位');
    expect(html).toContain('REAL-CODE-FROM-CONTACT');
    expect(html).toContain('研发岗位方向');
    expect(html).not.toContain('公司信息未提供');
    expect(html).not.toContain('DEMO-');
  });
  it('reads the actual saved resume library and diagnosis text', () => {
    initializeWorkspace('real-user', {
      'resume-library-v2': {
        value: [
          {
            id: 'actual-resume',
            name: '用户上传的真实简历',
            fileName: 'my-resume.txt',
            mime: 'text/plain',
            size: 40,
            text: '教育：2028届本科；项目：实际负责的开发工作。',
            role: '研发',
            createdAt: '2026-10-24T00:00:00Z',
            version: 1,
            default: true,
            applicationIds: [],
          },
        ],
        version: 1,
      },
      'diagnosis-text-v2': { value: '用户已保存的实际简历文本', version: 2 },
    });
    const html = renderToStaticMarkup(createElement(ResumeCheckPage));
    expect(html).toContain('用户上传的真实简历');
    expect(html).toContain('用户已保存的实际简历文本');
    expect(html).not.toContain('协作文档平台');
  });
  it('shows default decision dimensions without silently writing account records', () => {
    initializeWorkspace('real-user', {});
    expect(renderToStaticMarkup(createElement(OfferComparePage))).toContain('保证年薪');
    expect(workspaceRecord('offer-dimensions-v2')).toEqual({ value: null, version: 0 });
  });
});
