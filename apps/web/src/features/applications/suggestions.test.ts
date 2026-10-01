import type { Application, Job } from '@career-launch/shared'
import { describe, expect, it } from 'vitest'

import { buildSuggestions } from './suggestions'

const NOW = new Date('2026-10-01T04:00:00.000Z')
const DAY = 24 * 60 * 60 * 1_000

function application(partial: Partial<Application> & { id: string }): Application {
  return {
    userId: 'user-1', jobId: 'job-x', jobTitle: '后端开发', companyName: '星海科技', companyLogoText: '星',
    city: ['上海'], deadlineAt: '2026-11-01T15:59:59.000Z', stage: 'applied', note: '', archived: false,
    events: [{ id: 'event-1', toStage: 'applied', occurredAt: new Date(NOW.getTime() - 9 * DAY).toISOString() }],
    reminders: [], updatedAt: new Date(NOW.getTime() - 9 * DAY).toISOString(),
    ...partial,
  }
}

function job(partial: Partial<Job> & { id: string }): Job {
  return {
    companyId: 'company-1', companyName: '云帆智能', companyLogoText: '云', seasonId: 'season-1', title: '算法工程师',
    category: '技术', city: ['杭州'], education: ['硕士'], majors: ['计算机'], salaryLabel: '25-40K·16薪',
    description: '', requirements: [], applyUrl: 'https://example.com', sourceLabel: '官方', publishedAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(), deadlineAt: '2026-11-01T15:59:59.000Z', status: 'active', featured: false, favorite: false,
    ...partial,
  }
}

describe('buildSuggestions', () => {
  it('returns an empty list for empty input', () => {
    expect(buildSuggestions({ applications: [], favoriteJobs: [], now: NOW })).toEqual([])
  })

  it('suggests a favorite job that expires within three days and has no application', () => {
    const favorite = job({ id: 'job-fav', favorite: true, deadlineAt: new Date(NOW.getTime() + 2 * DAY).toISOString() })
    const suggestions = buildSuggestions({ applications: [], favoriteJobs: [favorite], now: NOW })

    expect(suggestions).toHaveLength(1)
    expect(suggestions[0]?.rule).toBe('expiring_favorite')
    expect(suggestions[0]?.priority).toBe(0)
    expect(suggestions[0]?.actions[0]).toMatchObject({ kind: 'route', to: '/jobs/job-fav' })
  })

  it('ignores favorite jobs already applied, past deadline, or expiring in more than three days', () => {
    const applied = job({ id: 'job-applied', favorite: true, deadlineAt: new Date(NOW.getTime() + DAY).toISOString() })
    const expired = job({ id: 'job-expired', favorite: true, deadlineAt: new Date(NOW.getTime() - DAY).toISOString() })
    const later = job({ id: 'job-later', favorite: true, deadlineAt: new Date(NOW.getTime() + 5 * DAY).toISOString() })
    const suggestions = buildSuggestions({
      applications: [application({ id: 'app-1', jobId: 'job-applied' })],
      favoriteJobs: [applied, expired, later],
      now: NOW,
    })

    expect(suggestions.filter((item) => item.rule === 'expiring_favorite')).toEqual([])
  })

  it('nudges confirmations stalled over three days with both actions', () => {
    const pending = application({
      id: 'app-pending', stage: 'pending_confirmation',
      events: [{ id: 'e0', toStage: 'pending_confirmation', occurredAt: new Date(NOW.getTime() - 4 * DAY).toISOString() }],
    })
    const suggestions = buildSuggestions({ applications: [pending], favoriteJobs: [], now: NOW })

    expect(suggestions).toHaveLength(1)
    expect(suggestions[0]?.rule).toBe('confirm')
    expect(suggestions[0]?.actions.map((action) => action.kind)).toEqual(['confirm-application', 'drop-application'])
  })

  it('flags stagnant non-terminal applications after seven days, but never terminal ones', () => {
    const stagnant = application({ id: 'app-stale' })
    const terminal = application({ id: 'app-offer', stage: 'offer' })
    const suggestions = buildSuggestions({ applications: [stagnant, terminal], favoriteJobs: [], now: NOW })

    expect(suggestions.map((item) => item.rule)).toEqual(['offer_decision', 'follow_up'])
  })

  it('suggests interview preparation for interviews', () => {
    const interviewing = application({ id: 'app-int', stage: 'interview' })
    const suggestions = buildSuggestions({ applications: [interviewing], favoriteJobs: [], now: NOW })

    expect(suggestions[0]?.rule).toBe('interview_prep')
    expect(suggestions[0]?.actions[0]).toMatchObject({ kind: 'route', to: '/knowledge' })
  })

  it('excludes archived applications and dismissed suggestions, sorted by priority', () => {
    const dismissed = new Set(['confirm:app-pending'])
    const suggestions = buildSuggestions({
      applications: [
        application({ id: 'app-pending', stage: 'pending_confirmation', events: [{ id: 'e0', toStage: 'pending_confirmation', occurredAt: new Date(NOW.getTime() - 5 * DAY).toISOString() }] }),
        application({ id: 'app-gone', archived: true, stage: 'pending_confirmation', events: [{ id: 'e1', toStage: 'pending_confirmation', occurredAt: new Date(NOW.getTime() - 5 * DAY).toISOString() }] }),
        application({ id: 'app-stale' }),
      ],
      favoriteJobs: [],
      now: NOW,
    }, dismissed)

    expect(suggestions.map((item) => item.id)).toEqual(['follow_up:app-stale'])
  })
})
