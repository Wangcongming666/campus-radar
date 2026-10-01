import type { Application, RecruitmentSeason } from '@career-launch/shared'
import { describe, expect, it } from 'vitest'

import { buildCalendar, buildMonthGrid, localDateKey } from './calendar'

const NOW = new Date(2026, 9, 1, 12, 0, 0)

function application(partial: Partial<Application> & { id: string }): Application {
  return {
    userId: 'user-1', jobId: 'job-x', jobTitle: '后端开发', companyName: '星海科技', companyLogoText: '星',
    city: ['上海'], deadlineAt: '2026-10-08T15:59:59.000Z', stage: 'applied', note: '', archived: false,
    events: [{ id: 'event-1', toStage: 'applied', occurredAt: '2026-09-20T10:00:00.000Z' }],
    reminders: [], updatedAt: '2026-09-20T10:00:00.000Z',
    ...partial,
  }
}

const SEASONS: RecruitmentSeason[] = [
  { id: 'season-1', name: '2027 届秋招', year: 2027, type: 'autumn', startsAt: '2026-10-06T16:00:00.000Z', endsAt: '2026-12-31T15:59:59.000Z', active: true },
]

describe('buildMonthGrid', () => {
  it('always renders 42 cells starting on Sunday', () => {
    const grid = buildMonthGrid(2026, 9, NOW)
    expect(grid).toHaveLength(42)
    expect(localDateKey(new Date(2026, 8, 27))).toBe(grid[0]?.dateKey)
  })

  it('marks today and out-of-month cells', () => {
    const grid = buildMonthGrid(2026, 9, NOW)
    const today = grid.find((cell) => cell.isToday)
    expect(today?.dateKey).toBe('2026-10-01')
    expect(grid[0]?.inMonth).toBe(false)
    expect(grid.find((cell) => cell.dateKey === '2026-10-01')?.inMonth).toBe(true)
  })
})

describe('buildCalendar', () => {
  it('places application deadlines, reminders and season bounds on the right days', () => {
    const app = application({
      id: 'a1',
      deadlineAt: '2026-10-08T15:59:59.000Z',
      reminders: [{ id: 'r1', applicationId: 'a1', title: '复盘笔试', remindAt: '2026-10-02T02:00:00.000Z', channels: ['in_app'], status: 'scheduled' }],
    })
    const cells = buildCalendar([app], SEASONS, 2026, 9, NOW)

    expect(cells.find((cell) => cell.dateKey === '2026-10-08')?.events.map((event) => event.kind)).toContain('deadline')
    expect(cells.find((cell) => cell.dateKey === '2026-10-02')?.events.map((event) => event.kind)).toContain('reminder')
    expect(cells.find((cell) => cell.dateKey === '2026-10-07')?.events.map((event) => event.kind)).toContain('season_start')
  })

  it('excludes archived applications and tones past deadlines neutral', () => {
    const cells = buildCalendar([
      application({ id: 'a1', archived: true, deadlineAt: '2026-10-08T15:59:59.000Z' }),
      application({ id: 'a2', deadlineAt: '2026-09-28T15:59:59.000Z' }),
    ], SEASONS, 2026, 9, NOW)

    expect(cells.find((cell) => cell.dateKey === '2026-10-08')?.events).toEqual([])
    expect(cells.find((cell) => cell.dateKey === '2026-09-28')?.events[0]?.tone).toBe('neutral')
  })
})
