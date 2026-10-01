import type { Job } from '@career-launch/shared'

export const MAX_COMPARE = 3

export interface CompareField {
  label: string
  values: string[]
  differs: boolean
}

interface RowDefinition {
  label: string
  get: (job: Job) => string
}

const ROW_DEFINITIONS: RowDefinition[] = [
  { label: '薪资', get: (job) => job.salaryLabel },
  { label: '工作城市', get: (job) => job.city.join(' / ') },
  { label: '学历要求', get: (job) => job.education.join(' / ') },
  { label: '职位类别', get: (job) => job.category },
  { label: '公司', get: (job) => job.companyName },
  { label: '投递截止', get: (job) => new Date(job.deadlineAt).toLocaleDateString('zh-CN') },
  { label: '职位要求', get: (job) => job.requirements.join('；') || '—' },
]

export function buildCompareRows(jobs: Job[]): CompareField[] {
  return ROW_DEFINITIONS.map(({ label, get }) => {
    const values = jobs.map(get)
    return { label, values, differs: new Set(values).size > 1 }
  })
}
