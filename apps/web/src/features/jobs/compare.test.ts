import type { Job } from '@career-launch/shared'
import { describe, expect, it } from 'vitest'

import { MAX_COMPARE, buildCompareRows } from './compare'

function job(partial: Partial<Job> & { id: string }): Job {
  return {
    companyId: 'company-1', companyName: '云帆智能', companyLogoText: '云', seasonId: 'season-1', title: '算法工程师',
    category: '技术', city: ['杭州'], education: ['硕士'], majors: ['计算机'], salaryLabel: '25-40K·16薪',
    description: '', requirements: ['熟悉机器学习'], applyUrl: 'https://example.com', sourceLabel: '官方',
    publishedAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
    deadlineAt: '2026-10-15T15:59:59.000Z', status: 'active', featured: false, favorite: false,
    ...partial,
  }
}

describe('buildCompareRows', () => {
  it('marks fields that differ and unifies fields that match', () => {
    const rows = buildCompareRows([
      job({ id: 'j1', salaryLabel: '25-40K·16薪', city: ['杭州'] }),
      job({ id: 'j2', salaryLabel: '20-35K·14薪', city: ['杭州'] }),
    ])

    const salary = rows.find((row) => row.label === '薪资')
    const city = rows.find((row) => row.label === '工作城市')
    expect(salary?.values).toEqual(['25-40K·16薪', '20-35K·14薪'])
    expect(salary?.differs).toBe(true)
    expect(city?.differs).toBe(false)
  })

  it('returns one value per job in input order for every row', () => {
    const rows = buildCompareRows([job({ id: 'j1' }), job({ id: 'j2' }), job({ id: 'j3' })])
    expect(rows.every((row) => row.values.length === 3)).toBe(true)
  })

  it('caps the documented comparison size', () => {
    expect(MAX_COMPARE).toBe(3)
  })
})
