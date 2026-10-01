import { describe, expect, it } from 'vitest'

import { addDaysToKey, daysUntil, formatDeadline, formatDeadlineStatus, keyWeekday, parseJobQuery, serializeJobQuery, shanghaiDateKey, shanghaiTodayKey } from './format'

describe('formatDeadline', () => {
  it('uses Shanghai calendar days for a future deadline', () => {
    expect(formatDeadline('2026-09-23T15:59:59Z', new Date('2026-09-20T04:00:00Z'))).toBe('3天后截止')
  })

  it('marks a deadline before today as expired', () => {
    expect(formatDeadline('2026-09-19T15:59:59Z', new Date('2026-09-20T04:00:00Z'))).toBe('已截止')
  })
})

describe('job query URL conversion', () => {
  it('applies defaults and reads repeated filter values', () => {
    const input = new URLSearchParams('keyword=Java&city=上海&city=杭州&page=2')

    expect(parseJobQuery(input)).toEqual({
      keyword: 'Java',
      city: ['上海', '杭州'],
      category: [],
      education: [],
      sort: 'latest',
      page: 2,
      pageSize: 12,
    })
  })

  it('omits empty optional filters when serializing', () => {
    const output = serializeJobQuery({ city: [], category: [], education: [], sort: 'deadline', page: 1, pageSize: 12 })

    expect(output.toString()).toBe('sort=deadline')
  })
})

describe('deadline status helpers', () => {
  const now = new Date('2026-10-01T04:00:00.000Z')

  it.each([
    ['2026-10-01T15:59:59.000Z', 0, '今天截止', 'danger'],
    ['2026-10-02T15:59:59.000Z', 1, '1 天后截止', 'danger'],
    ['2026-10-04T15:59:59.000Z', 3, '3 天后截止', 'danger'],
    ['2026-10-06T15:59:59.000Z', 5, '5 天后截止', 'warning'],
    ['2026-10-08T15:59:59.000Z', 7, '7 天后截止', 'warning'],
    ['2026-10-09T15:59:59.000Z', 8, '8 天后截止', 'primary'],
    ['2026-09-29T15:59:59.000Z', -2, '已过期 2 天', 'danger'],
  ] as const)('formatDeadlineStatus(%s)', (value, days, label, tone) => {
    expect(formatDeadlineStatus(value, now)).toEqual({ days, label, tone })
  })

  it('daysUntil is negative for past values', () => {
    expect(daysUntil('2026-09-30T00:00:00.000Z', now)).toBeLessThan(0)
  })

  it('maps ISO values onto Shanghai calendar dates', () => {
    expect(shanghaiDateKey('2026-10-01T17:30:00.000Z')).toBe('2026-10-02')
    expect(shanghaiDateKey('2026-10-01T02:30:00.000Z')).toBe('2026-10-01')
  })

  it('derives the Shanghai date key of "now" regardless of machine timezone', () => {
    expect(shanghaiTodayKey(new Date('2026-10-01T20:00:00.000Z'))).toBe('2026-10-02')
    expect(shanghaiTodayKey(new Date('2026-10-01T02:00:00.000Z'))).toBe('2026-10-01')
  })

  it('adds days and reads weekdays on pure date keys', () => {
    expect(addDaysToKey('2026-10-01', -4)).toBe('2026-09-27')
    expect(addDaysToKey('2026-10-01', 31)).toBe('2026-11-01')
    expect(keyWeekday('2026-10-01')).toBe(4)
    expect(keyWeekday('2026-09-27')).toBe(0)
  })
})
