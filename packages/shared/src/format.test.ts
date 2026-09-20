import { describe, expect, it } from 'vitest'

import { formatDeadline, parseJobQuery, serializeJobQuery } from './format'

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
