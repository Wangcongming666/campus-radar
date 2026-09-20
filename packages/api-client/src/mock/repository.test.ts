import { describe, expect, it } from 'vitest'

import { createMockRepository } from './repository'

describe('mock career repository', () => {
  it('filters active Shanghai jobs and paginates deterministically', async () => {
    const repository = createMockRepository({ storage: 'memory', latencyMs: 0 })

    const page = await repository.jobs.list({
      city: ['上海'],
      category: [],
      education: [],
      sort: 'latest',
      page: 1,
      pageSize: 2,
    })

    expect(page.items.length).toBeGreaterThan(0)
    expect(page.items.length).toBeLessThanOrEqual(2)
    expect(page.items.every((job) => job.city.includes('上海') && job.status === 'active')).toBe(true)
    expect(page.total).toBeGreaterThanOrEqual(page.items.length)
  })

  it('returns the existing active application when the same job starts twice', async () => {
    const repository = createMockRepository({ storage: 'memory', latencyMs: 0 })

    const first = await repository.applications.start('job-001')
    const second = await repository.applications.start('job-001')

    expect(second.id).toBe(first.id)
    expect(second.stage).toBe('pending_confirmation')
    expect(await repository.applications.list()).toHaveLength(1)
  })

  it('rejects login codes other than the documented demo code', async () => {
    const repository = createMockRepository({ storage: 'memory', latencyMs: 0 })

    await expect(repository.auth.verifyCode('student@example.com', '111111')).rejects.toMatchObject({
      code: 'INVALID_VERIFICATION_CODE',
    })
  })
})
