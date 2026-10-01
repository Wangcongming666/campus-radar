import { beforeEach, describe, expect, it } from 'vitest'

import { createMockRepository } from './repository'

beforeEach(() => {
  localStorage.clear()
})

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

  it('archives, restores and edits the note of an application', async () => {
    const repository = createMockRepository({ storage: 'memory', latencyMs: 0 })
    const application = await repository.applications.start('job-001')

    await repository.applications.setNote(application.id, '笔试前复盘项目')
    await repository.applications.archive(application.id, true)
    expect((await repository.applications.list()).find((item) => item.id === application.id)?.archived).toBe(true)
    expect((await repository.applications.list()).find((item) => item.id === application.id)?.note).toBe('笔试前复盘项目')

    await repository.applications.archive(application.id, false)
    expect((await repository.applications.list()).find((item) => item.id === application.id)?.archived).toBe(false)
  })

  it('adds and removes reminders on an application', async () => {
    const repository = createMockRepository({ storage: 'memory', latencyMs: 0 })
    const application = await repository.applications.start('job-001')

    const reminder = await repository.applications.reminders.add(application.id, '2026-10-05T02:00:00.000Z', '准备笔试')
    expect((await repository.applications.list())[0]?.reminders).toHaveLength(1)

    await repository.applications.reminders.remove(reminder.id)
    expect((await repository.applications.list())[0]?.reminders).toHaveLength(0)
  })

  it('converts due reminders into notifications exactly once', async () => {
    const repository = createMockRepository({ storage: 'memory', latencyMs: 0 })
    const application = await repository.applications.start('job-001')
    await repository.applications.reminders.add(application.id, '2026-01-01T00:00:00.000Z', '跟进结果')

    const first = await repository.applications.syncDueReminders()
    const second = await repository.applications.syncDueReminders()

    expect(first).toHaveLength(1)
    expect(first[0]?.type).toBe('deadline')
    expect(first[0]?.href).toBe('/me/workspace')
    expect(second).toHaveLength(0)
  })

  it('lists only favorite jobs when the favorite filter is on', async () => {
    const repository = createMockRepository({ storage: 'memory', latencyMs: 0 })
    await repository.jobs.favorite('job-001', true)

    const page = await repository.jobs.list({ city: [], category: [], education: [], sort: 'latest', page: 1, pageSize: 100, favorite: true })

    expect(page.total).toBe(1)
    expect(page.items.every((job) => job.favorite)).toBe(true)
  })

  it('falls back to seed data when the persisted payload is corrupt', async () => {
    localStorage.setItem('career-launch-mock-v2', '{not json')
    const repository = createMockRepository({ storage: 'indexeddb', latencyMs: 0 })

    const page = await repository.jobs.list({ city: [], category: [], education: [], sort: 'latest', page: 1, pageSize: 5 })
    expect(page.total).toBeGreaterThan(0)
  })

  it('falls back to seed data when the persisted payload is valid JSON but not a state object', async () => {
    localStorage.setItem('career-launch-mock-v2', 'null')
    const repository = createMockRepository({ storage: 'indexeddb', latencyMs: 0 })

    const page = await repository.jobs.list({ city: [], category: [], education: [], sort: 'latest', page: 1, pageSize: 5 })
    expect(page.total).toBeGreaterThan(0)
  })

  it('falls back to seed data when persisted collections are missing', async () => {
    localStorage.setItem('career-launch-mock-v2', '{"jobs":[]}')
    const repository = createMockRepository({ storage: 'indexeddb', latencyMs: 0 })

    const applications = await repository.applications.list()
    expect(Array.isArray(applications)).toBe(true)
    expect(applications.length).toBeGreaterThan(0)
  })

  it('reads the legacy v1 storage key and migrates it on save', async () => {
    const legacy = createMockRepository({ storage: 'indexeddb', latencyMs: 0 })
    const application = await legacy.applications.start('job-007')
    const payload = localStorage.getItem('career-launch-mock-v2')
    expect(payload).toBeTruthy()
    localStorage.removeItem('career-launch-mock-v2')
    localStorage.setItem('career-launch-mock-v1', payload!)

    const migrated = createMockRepository({ storage: 'indexeddb', latencyMs: 0 })
    const applications = await migrated.applications.list()
    expect(applications.some((item) => item.id === application.id)).toBe(true)
    expect(localStorage.getItem('career-launch-mock-v1')).toBe(null)
  })
})
