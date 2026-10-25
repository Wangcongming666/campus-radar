import { describe, expect, it } from 'vitest';
import {
  cleanLocalRecords,
  offerSchema,
  subscriptionSchema,
  plannerTaskSchema,
  resumeRecordSchema,
  companyNoteSchema,
  referralRecordSchema,
} from './growth-storage';
describe('growth local record boundaries', () => {
  it('skips damaged offers, nonfinite amounts and duplicated ids while retaining healthy records', () => {
    const good = {
      id: 'a',
      company: '本地公司',
      title: '研发',
      city: '杭州',
      base: 30,
      months: 16,
      bonus: 0,
      deadline: '',
      note: '',
      scores: { growth: 70 },
    };
    expect(
      cleanLocalRecords(
        [null, { id: 'broken' }, good, { ...good }, { ...good, id: 'bad', base: NaN }],
        offerSchema,
      ),
    ).toEqual({ value: [good], invalid: 4 });
  });
  it('does not allow nested corrupted subscription hits to reach record rendering', () => {
    const rule = {
      id: 'a',
      name: '订阅',
      role: '',
      city: '',
      company: '',
      type: '',
      education: '',
      keyword: '',
      frequency: '每日汇总',
      enabled: true,
      channels: ['站内'],
      hits: [{ jobId: null }],
    };
    expect(cleanLocalRecords([rule], subscriptionSchema)).toEqual({ value: [], invalid: 1 });
  });
  it('rejects incomplete task, resume and company records and accepts full onboarding tasks', () => {
    expect(cleanLocalRecords([{ id: 'broken' }], plannerTaskSchema).invalid).toBe(1);
    expect(cleanLocalRecords([{ id: 'broken' }], resumeRecordSchema).invalid).toBe(1);
    expect(cleanLocalRecords([{ id: 'broken' }], companyNoteSchema).invalid).toBe(1);
    const task = {
      id: 'onboard-1',
      title: '准备首轮',
      milestoneId: '',
      status: '待开始',
      date: '',
      remind: true,
    };
    expect(cleanLocalRecords([task], plannerTaskSchema).value).toEqual([task]);
  });
  it('handles non-array backup values without throwing', () => {
    expect(cleanLocalRecords({ id: 'wrong-root' }, offerSchema)).toEqual({ value: [], invalid: 1 });
  });
});

it('retains a user-entered referral company and code when the public catalog is empty', () => {
  const record = {
    id: 'real-referral',
    title: '实际岗位',
    companyId: '',
    company: '实际公司',
    code: 'real-code-from-contact',
    role: '研发',
    contact: '我的联系人',
    stage: '准备联系',
    date: '2026-10-24',
    note: '',
  };
  expect(cleanLocalRecords([record], referralRecordSchema)).toEqual({
    value: [record],
    invalid: 0,
  });
});
