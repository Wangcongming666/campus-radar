import type { Company, Job } from '@career-launch/shared'

export const MAX_COMPARE = 3

export interface CompareField {
  label: string
  values: string[]
  differs: boolean
}

interface RowDefinition {
  label: string
  get: (job: Job, companiesById?: Map<string, Company>) => string
}

const ROW_DEFINITIONS: RowDefinition[] = [
  { label: '薪资', get: (job) => job.salaryLabel },
  { label: '工作城市', get: (job) => job.city.join(' / ') },
  { label: '学历要求', get: (job) => job.education.join(' / ') },
  { label: '职位类别', get: (job) => job.category },
  { label: '公司', get: (job) => job.companyName },
  { label: '行业', get: (job, companies) => companies?.get(job.companyId)?.industry ?? '—' },
  { label: '规模', get: (job, companies) => companies?.get(job.companyId)?.scale ?? '—' },
  { label: '公司性质', get: (job, companies) => companies?.get(job.companyId)?.ownership ?? '—' },
  { label: '投递截止', get: (job) => new Date(job.deadlineAt).toLocaleDateString('zh-CN') },
  { label: '职位要求', get: (job) => job.requirements.join('；') || '—' },
]

export function buildCompareRows(jobs: Job[], companiesById?: Map<string, Company>): CompareField[] {
  return ROW_DEFINITIONS.map(({ label, get }) => {
    const values = jobs.map((job) => get(job, companiesById))
    return { label, values, differs: new Set(values).size > 1 }
  })
}
