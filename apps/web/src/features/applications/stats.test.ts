import type { Application } from '@career-launch/shared'
import { describe, expect, it } from 'vitest'

import { buildStats } from './stats'

const NOW = new Date('2026-10-01T04:00:00.000Z')
const DAY = 24 * 60 * 60 * 1_000

function application(partial: Partial<Application> & { id: string }): Application {
  return {
    userId: 'user-1', jobId: 'job-x', jobTitle: '后端开发', companyName: '星海科技', companyLogoText: '星',
    city: ['上海'], deadlineAt: '2026-11-01T15:59:59.000Z', stage: 'applied', note: '', archived: false,
    events: [{ id: 'event-1', toStage: 'applied', occurredAt: new Date(NOW.getTime() - DAY).toISOString() }],
    reminders: [], updatedAt: new Date(NOW.getTime() - DAY).toISOString(),
    ...partial,
  }
}

describe('buildStats', () => {
  it('returns zeroed funnel and weekly for empty input', () => {
    const stats = buildStats([], NOW)

    expect(stats.funnel).toHaveLength(7)
    expect(stats.funnel.every((entry) => entry.count === 0)).toBe(true)
    expect(stats.weekly).toHaveLength(7)
    expect(stats.keyNumbers).toEqual({ interviewing: 0, offers: 0, needsFollowUp: 0 })
  })

  it('counts stages excluding archived applications', () => {
    const stats = buildStats([
      application({ id: 'a1', stage: 'interview' }),
      application({ id: 'a2', stage: 'interview' }),
      application({ id: 'a3', stage: 'offer' }),
      application({ id: 'a4', stage: 'offer', archived: true }),
    ], NOW)

    expect(stats.funnel.find((entry) => entry.stage === 'interview')?.count).toBe(2)
    expect(stats.funnel.find((entry) => entry.stage === 'offer')?.count).toBe(1)
    expect(stats.keyNumbers.interviewing).toBe(2)
    expect(stats.keyNumbers.offers).toBe(1)
  })

  it('counts the last seven days of submissions from appliedAt', () => {
    const stats = buildStats([
      application({ id: 'a1', appliedAt: new Date(NOW.getTime() - 2 * DAY).toISOString() }),
      application({ id: 'a2', appliedAt: '2026-10-01T02:00:00.000Z', stage: 'offer' }),
      application({ id: 'a3', appliedAt: new Date(NOW.getTime() - 20 * DAY).toISOString() }),
    ], NOW)

    expect(stats.weekly.reduce((total, entry) => total + entry.count, 0)).toBe(2)
    expect(stats.weekly[6]?.count).toBe(1)
  })

  it('flags applications stagnant over seven days as needing follow-up', () => {
    const stale = application({ id: 'a1', events: [{ id: 'e1', toStage: 'applied', occurredAt: new Date(NOW.getTime() - 9 * DAY).toISOString() }] })
    const fresh = application({ id: 'a2', events: [{ id: 'e2', toStage: 'applied', occurredAt: new Date(NOW.getTime() - DAY).toISOString() }] })

    expect(buildStats([stale, fresh], NOW).keyNumbers.needsFollowUp).toBe(1)
  })
})
