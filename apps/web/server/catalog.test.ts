import { expect, it } from 'vitest';
import { manualImportSchema } from './catalog-import';
import { catalogCompany, catalogJob } from './catalog';
const valid = {
  company: { name: '用户提供的公司' },
  title: '前端工程师',
  role: 'frontend',
  cities: ['北京'],
  recruitmentType: 'campus',
  graduationYears: [2027],
  descriptionMd: '用户录入的岗位职责。',
  canonicalUrl: 'https://careers.example.com/jobs/123',
};
it('requires source URL, company, actual graduation years and consistent deadline precision', () => {
  expect(manualImportSchema.safeParse({ jobs: [valid] }).success).toBe(true);
  for (const changes of [
    { canonicalUrl: 'javascript:alert(1)' },
    { graduationYears: [] },
    { company: { name: '' } },
    { deadlineAt: '2026-12-01T00:00:00Z' },
  ])
    expect(manualImportSchema.safeParse({ jobs: [{ ...valid, ...changes }] }).success).toBe(false);
  expect(
    manualImportSchema.safeParse({
      jobs: [{ ...valid, deadlineAt: '2026-12-01T00:00:00Z', deadlinePrecision: 'date' }],
    }).success,
  ).toBe(true);
});
it('rejects a malformed item in an otherwise valid import batch', () => {
  expect(manualImportSchema.safeParse({ jobs: [valid, { ...valid, title: '' }] }).success).toBe(
    false,
  );
  expect(
    manualImportSchema.safeParse({ jobs: [{ ...valid, verifiedAt: '2026-10-24T00:00:00Z' }] })
      .success,
  ).toBe(false);
});
it('allows an existing company UUID and preserves unknown education/publication', () => {
  const parsed = manualImportSchema.parse({ jobs: [{ ...valid, company: { id: '123e4567-e89b-42d3-a456-426614174000' } }] });
  expect(parsed.jobs[0].education).toBeNull();
  expect(parsed.jobs[0].publishedAt).toBeUndefined();
  expect(manualImportSchema.safeParse({ jobs: [{ ...valid, company: {} }] }).success).toBe(false);
});
it('preserves database UUIDs and labels unknown data without sample fields', () => {
  const company = {
    id: 'c44faac0-0748-43a0-9537-34270541efe3',
    slug: 'provided-company',
    name: '录入的公司',
    description: '',
    locations: [],
    tags: [],
    verifiedAt: null,
  };
  expect(catalogCompany(company)).toMatchObject({
    id: company.id,
    name: '录入的公司',
    en: '',
    industry: '',
  });
  const job = catalogJob({
    id: 'e4434949-d628-4432-b551-d42934eeb359',
    title: '真实岗位',
    company,
    role: 'frontend',
    cities: ['北京'],
    education: 'bachelor',
    recruitmentType: 'campus',
    graduationYears: [2027, 2028],
    skills: ['React'],
    salary: null,
    deadlineAt: null,
    deadlinePrecision: 'unknown',
    sourceTimezone: 'Asia/Shanghai',
    publishedAt: '2026-10-24T00:00:00Z',
    publishedDate: '2026-10-24',
    publishedPrecision: 'exact',
    verifiedAt: null,
    status: 'unknown',
    source: {
      id: '9c890d60-c843-4f64-bc6b-e21fb6abc72c',
      name: '手动录入 · 官方未核验',
      url: 'https://careers.example.com',
      verifiedAt: null,
    },
    descriptionMd: '实际内容',
    canonicalUrl: 'https://careers.example.com/jobs/1',
  });
  expect(job).toMatchObject({
    companyId: company.id,
    match: 0,
      salary: '薪资未注明',
    deadline: null,
    requirements: ['2027、2028届'],
    canonicalUrl: 'https://careers.example.com/jobs/1',
  });
});
